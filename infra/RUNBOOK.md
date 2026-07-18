# RUNBOOK — миграция бэкенда на RU-VPS (T-LOC)

Пошаговая инструкция для Тёмы. Каждый шаг — команда(ы), как проверить успех,
что делать при ошибке. Идёшь сверху вниз, не пропуская чекбоксы.

**Пререквизиты (должны быть готовы ДО начала):**
- [x] VPS куплен (Timeweb Cloud, Ubuntu 22.04+, ≥4 ГБ RAM / 2 vCPU / ≥50 ГБ NVMe)
- [x] A-записи в DNS: `api.wedesignerz.com` → IP VPS, `stats.wedesignerz.com` → IP VPS
- [x] Аккаунт Unisender Go на платном тарифе заведён, Web API работает
- [x] Бакет S3-совместимого хранилища Timeweb создан, ключи доступа получены

Не переключай прод (шаг 8), пока шаг 7 не пройден целиком и зелёным.

---

## T-RKN-CAPTCHA-BRIDGE — SmartCaptcha перед GoTrue

Это отдельный controlled deploy для замены Turnstile. До начала в
`/root/vibeclub/.env` должны быть `CAPTCHA_SECRET` (нужен только для временной
dual-mode поддержки старого фронта) и `SMARTCAPTCHA_SERVER_KEY`. Не печатай их
и не копируй `.env` в Git. Проверь конфиг без вывода значений:

```bash
cd /root/vibeclub
docker compose config -q
```

Порядок обязателен: сначала подними здоровый `auth`, затем
`captcha-bridge`, затем Kong. Обычный безопасный вариант после обновления
файлов — Compose сам соблюдёт зависимости:

```bash
docker compose up -d auth
docker compose up -d captcha-bridge
docker compose up -d kong
docker compose ps
docker compose exec captcha-bridge wget -qO- http://localhost:9997/health; echo
```

Ожидаются `auth`, `captcha-bridge` и `kong` в состоянии `healthy`. Проверяй
только агрегированные статусы/коды: в логах не искать и не печатать email,
IP, пароли, CAPTCHA-токены или request body.

Приёмка dual-mode: новый фронт шлёт `smart:<token>` и bridge отправляет raw
token только в Yandex SmartCaptcha; ещё закэшированный старый фронт шлёт raw
Turnstile token и bridge отправляет его только в Cloudflare. После успеха
проверяется signup, а запрос без токена должен вернуть `400 captcha_failed`.
Refresh-token, PKCE и id-token должны обновляться без CAPTCHA. Внешние Auth
маршруты `/verify`, `/callback`, `/authorize` и `/.well-known/jwks` остаются
напрямую на GoTrue.

### Точный rollback

Если приёмка не зелёная, верни secure Auth service в Kong на
`http://auth:9999/`, установи `GOTRUE_SECURITY_CAPTCHA_ENABLED: "true"` в
`docker-compose.yml`, затем пересоздай только auth и Kong:

```bash
docker compose up -d --force-recreate auth kong
```

После этого откати фронт на Turnstile отдельным проверенным изменением. Не
делай rollback фронта раньше серверного: иначе SmartCaptcha-токен попадёт в
GoTrue Turnstile validator. Ни при deploy, ни при rollback не выводи секреты
или PII.

---

## Шаг 1 — секреты и подготовка VPS

### 1.1 Сгенерировать секреты (локально, на своей машине — Node уже стоит)

```bash
cd infra
cp .env.example .env
node scripts/gen-keys.mjs --update-env
```

Проверка: открой `infra/.env`, `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY`/
`POSTGRES_PASSWORD`/`PG_META_CRYPTO_KEY`/`UMAMI_DB_PASSWORD`/`UMAMI_APP_SECRET`
не пустые. Вставь `ANON_KEY` в https://jwt.io — должно раскодироваться в
`{"role":"anon","iss":"supabase",...}`.

Если ошибка `infra/.env не найден` — не выполнил `cp .env.example .env` из
этой же папки (`infra/`), не из корня репо.

### 1.2 Дозаполнить `.env` руками

Открой `infra/.env`, впиши:
- `UNISENDER_API_KEY` — из кабинета Unisender Go; это рабочий путь отправки
  через `mail-bridge` (шаг 6);
- `SMTP_USER` / `SMTP_PASS` — можно сохранить как fallback-конфиг GoTrue, но
  при включённом send-email hook он не используется;
- `BACKUP_S3_BUCKET` / `BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY` — из кабинета Timeweb
- `CAPTCHA_SECRET` — Turnstile secret из Cloudflare (добавляется в
  T-CUTOVER-01; никогда не вставлять его в репозиторий).

### 1.3 Подключиться к VPS и поставить Docker

```bash
ssh root@<IP-VPS>
```

На VPS:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
docker compose version   # должна напечататься версия — проверка успеха
```

Если `docker compose version` не находится — `docker-compose-plugin` не
встал, повтори `apt install -y docker-compose-plugin`.

### 1.4 Файрвол

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status   # проверка: 22, 80, 443 — ALLOW
```

### 1.5 Скопировать `infra/` и `supabase/` на VPS

Содержимое `infra/` копируем НАПРЯМУЮ в `/root/vibeclub` (не как подпапку —
все команды ниже написаны в предположении, что `docker-compose.yml` лежит
прямо в `/root/vibeclub`). `supabase/` кладём рядом отдельной подпапкой —
понадобится на шаге 3. С локальной машины (не с VPS!):

```bash
ssh root@<IP-VPS> "mkdir -p /root/vibeclub"
scp -r infra/. root@<IP-VPS>:/root/vibeclub/
scp -r supabase root@<IP-VPS>:/root/vibeclub/
ssh root@<IP-VPS> "chmod +x /root/vibeclub/scripts/*.sh /root/vibeclub/volumes/api/kong-entrypoint.sh"
```

Проверка: `ssh root@<IP-VPS> ls /root/vibeclub` — видно `docker-compose.yml`,
`.env`, `Caddyfile`, `volumes/`, `scripts/`, `mail-templates/`, `supabase/`.

**Стоп-проверка секретов:** `ssh root@<IP-VPS> cat /root/vibeclub/.env` —
файл должен существовать и быть заполненным (не `.env.example`). Если пусто —
шаг 1.1–1.2 пропущен.

---

## Шаг 2 — подъём контейнеров

На VPS:

```bash
cd /root/vibeclub
docker compose config -q && echo "конфиг валиден"   # падает с ошибкой, если .env неполный
docker compose up -d
docker compose ps   # все сервисы — статус healthy/running, не restarting
```

Если что-то в `Restarting` дольше минуты — смотри логи:
`docker compose logs <имя-сервиса> --tail=50`.

Известные ошибки (обе пойманы на живом подъёме 2026-07-14):
- `auth` в Restarting, в логах `must be owner of function uid (SQLSTATE
  42501)` — образ postgres создал auth-функции владельцем `postgres`, а
  GoTrue ходит как `supabase_auth_admin`.
- `storage` в Restarting, в логах `28P01 ... auth_failed` — образ создаёт
  роль `supabase_storage_admin` после init-скриптов, пароль из `roles.sql`
  по ней не попадает.

На свежей установке оба фикса применяются сами
(`volumes/db/auth-fn-owner.sql` монтируется в фазу migrations); если поймал
на уже созданной базе — выполни руками:

```bash
docker compose exec -T db psql -U postgres -d postgres < volumes/db/auth-fn-owner.sql
docker compose restart auth
```

### Проверка здоровья (изнутри VPS)

Ни один сервис, кроме Caddy, не публикует порт на хост (только внутренняя
docker-сеть) — поэтому колонка `STATUS` в `docker compose ps` (там же, где
`healthy`/`unhealthy`) и есть основная проверка. Дополнительно, руками:

```bash
docker compose exec kong kong health
docker compose exec auth wget -qO- http://localhost:9999/health; echo
docker compose exec rest postgrest --ready && echo "rest: OK"
docker compose exec storage wget -qO- http://localhost:5000/status; echo
docker compose exec umami node -e "fetch('http://localhost:3000/api/heartbeat').then(r=>console.log(r.status))"
```

Все — без ошибок (auth/storage напечатают `{"date":...}`-подобный JSON,
umami — `200`). Если `unhealthy`/`Restarting` дольше минуты — смотри
`docker compose logs <сервис> --tail=50`.

### Проверка снаружи (после DNS + Caddy)

```bash
curl -I https://api.wedesignerz.com/rest/v1/
# Ожидаем: HTTP/2 401 — это УСПЕХ (TLS и маршрутизация работают, Kong просто
# не пускает без apikey). Ошибка — это connection refused / timeout / 502.
curl -I https://api.wedesignerz.com/mail-templates/confirmation.html
# Ожидаем: HTTP/2 200 — шаблоны писем раздаются (их отсюда забирает GoTrue).
curl -I https://stats.wedesignerz.com/
# Ожидаем: HTTP/2 200.
```

Если сертификат не выдаётся — `docker compose logs caddy`. Частая причина:
DNS ещё не разошёлся (подожди 5–10 минут, `dig api.wedesignerz.com`) или
80/443 закрыты в ufw/у провайдера.

---

## Шаг 3 — схема БД и storage-бакет

```bash
cd /root/vibeclub
docker compose exec -T db psql -U postgres -d postgres < supabase/schema.sql
for f in supabase/migrations/*.sql; do
  echo "=== $f ==="
  docker compose exec -T db psql -U postgres -d postgres < "$f"
done
# ВАЖНО: glob сортирует по алфавиту, а не по дате применения — из-за этого
# «поздние» миграции с суффиксом в имени прогоняются РАНЬШЕ базовых с той же
# датой (дефис < точки), и в базе остаётся устаревшее состояние. Ловили два
# случая: protect_privileged_columns остаётся багованной (hardening-fix до
# hardening) и projects_images_max остаётся 3 вместо 9 (images-nine до
# images) — из-за второго импорт данных на шаге 4 падает с
# «violates check constraint projects_images_max». Перекатываем оба поверх:
docker compose exec -T db psql -U postgres -d postgres < supabase/migrations/2026-07-06-rls-privilege-hardening-fix.sql
docker compose exec -T db psql -U postgres -d postgres < supabase/migrations/2026-07-08-project-images-nine.sql

# PostgREST стартовал раньше, чем появились таблицы — его кэш схемы пуст
# (REST отвечает PGRST205 "Could not find the table"). Перезагрузить кэш:
docker compose exec -T db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
```

(`supabase/` должен уже лежать в `/root/vibeclub/supabase` — скопирован на
шаге 1.5.)

Проверка:

```bash
docker compose exec db psql -U postgres -d postgres -c "\dt public.*"
# Ожидаем: comments, feedback, profiles, project_upvotes, projects

docker compose exec db psql -U postgres -d postgres -c "select id, public from storage.buckets;"
# Ожидаем: covers | t
```

Если таблицы не появились — проверь, что `schema.sql` прогнался без ошибок
(психейлер выведет `ERROR:` прямо в консоль).

Storage-бакет `covers` создаётся самим `schema.sql` (`insert into
storage.buckets ...`) — второй раз ничего создавать не нужно.

---

## Шаг 3.5 — prod-конфиг self-hosted (T-CUTOVER, до переноса данных)

Добавлен по внешнему аудиту 2026-07-14 (задача **T-CUTOVER** в
`docs/04-tasks-sonnet.md`). Без этого шага cutover ломает прод.

**Статус 2026-07-14: выполнено на VPS.** Compose валиден, `auth` и
`mail-bridge` healthy, `SITE_URL` корректен, Turnstile принуждается, пароль
минимум 12. CSP задеплоен commit `4a21ce6`; живой cloud-прод и существующая
auth-сессия работают, `js/config.js` ещё не переключён.

1. **`/root/vibeclub/.env` на сервере** (локальный исходник до копирования —
   `infra/.env`):
   - `SITE_URL=https://wedesignerz.com` (не доверять локальной копии `.env`:
     проверить фактическое значение на VPS, иначе ссылки в письмах поведут не туда);
   - добавить `CAPTCHA_SECRET=<Turnstile secret key>` из Cloudflare Turnstile.
2. **`docker-compose.yml`** (правится в репо, копируется на VPS): в сервис
   auth — серверная капча и минимальная длина пароля:
   ```yaml
   GOTRUE_SECURITY_CAPTCHA_ENABLED: "true"
   GOTRUE_SECURITY_CAPTCHA_PROVIDER: turnstile
   GOTRUE_SECURITY_CAPTCHA_SECRET: ${CAPTCHA_SECRET}
   GOTRUE_PASSWORD_MIN_LENGTH: "12"
   ```
   Затем `docker compose up -d auth` (пересоздать контейнер).
3. **CSP на всех 18 HTML** (коммит в репо, деплой ДО cutover — безопасно,
   CSP допускает несколько источников): в `connect-src` добавить
   `https://api.wedesignerz.com wss://api.wedesignerz.com
   https://stats.wedesignerz.com`; в `script-src` —
   `https://stats.wedesignerz.com`. Старый cloud-хост убрать отдельным
   коммитом только ПОСЛЕ успешного шага 8.
4. **Шаблоны писем**: проверить тексты и ссылки во всех
   `infra/mail-templates/*.html`; в проде не должно остаться TODO и тестовых
   адресов.

Проверка: Kong требует `apikey`, поэтому голый health закономерно отдаёт 401;
с заголовком `apikey: <ANON_KEY>` URL
`https://api.wedesignerz.com/auth/v1/health` отдаёт 200. После пересоздания
auth signup без captcha-токена напрямую в REST отбивается `captcha_failed`.

---

## Шаг 4 — перенос данных

**Freeze-окно.** Между дампом (4.1) и переключением фронта (шаг 8) любые записи
в cloud-базу потеряются. Поэтому шаги 4 → 8 выполнять **одним заходом**
(данных мало — реально уложиться в 30–60 минут), в тихое время (ночь), и на
время окна включить заморозку записи:

- Cloud Dashboard → Authentication → Sign In / Up → **Disable new sign ups**
  (блокирует новые регистрации);
- заранее попросить трёх текущих участников не пользоваться сайтом в течение
  окна. **Disable new sign ups не блокирует записи действующих сессий** — это
  координационная пауза, а не строгий read-only;
- до дампа записать контрольные количества строк и максимальные `created_at`
  для `auth.users`, `projects`, `comments`, `project_upvotes`, `feedback` и
  `storage.objects`. После переключения они сверяются в шаге 8.1;
- если окно сорвалось или в cloud появились новые строки — не продолжать со
  старым дампом: вернуть sign ups и повторить шаг 4 в следующее окно.

> **Состояние 2026-07-14 (сверка Fable, независимо повторена Codex по обеим живым базам): шаги 4–5 УЖЕ
> выполнены** — self-host содержит те же данные, что cloud (3 юзера / 3 профиля /
> 3 проекта / 1 коммент / 3 апвоута / 2 фидбека), замена хоста чистая
> (0 строк с `supabase.co`). Расхождение только в storage: cloud 19 объектов,
> self-host 18 — недостающий `…/e96f43f1-….png` (2026-07-07) — сирота, не
> используется ни в `avatar_url`, ни в `cover_url`, ни в `images`; на шаге 8.1
> сверять как 19 = 18 + 1 сирота (или удалить сироту в cloud до сверки).
>
> Поэтому в freeze-окне шаги 4.1–4.3 НЕ повторять слепо. **Повторный полный
> импорт дампа в непустую базу опасен:** `pg_dump --data-only` грузит через
> `COPY`, и при `duplicate key` абортируется ВЕСЬ COPY таблицы — старые строки
> останутся, а новые из дампа молча не доедут. В окне вместо этого:
> 1. Сверить counts + `max(created_at)` по шести наборам cloud ↔ self-host.
> 2. Совпало (как сейчас) — данные уже на месте, сразу к шагу 7.
> 3. Есть дельта — перенести её адресно (единичные строки INSERT'ами +
>    докопировать новые storage-файлы `copy-storage.mjs`), либо, если дельта
>    большая, очистить данные self-host (`truncate` затронутых таблиц public +
>    auth.users cascade) и повторить полный импорт 4.1–4.3 с нуля.

На локальной машине (нужен `psql`/`pg_dump`, `brew install postgresql` на Mac,
или `supabase` CLI):

```bash
# Connection string — Dashboard → Project Settings → Database → Connection string (URI)
pg_dump "postgresql://postgres:<пароль>@<host-cloud>:5432/postgres" \
  --data-only --disable-triggers --schema=public --schema=auth \
  --exclude-table=auth.schema_migrations \
  -f cloud-data.sql
```

`--disable-triggers` обязателен: без него при загрузке `auth.users` сработает
наш же триггер `on_auth_user_created` и создаст в `public.profiles` пустые
профили ДО того, как в них загрузятся настоящие данные — восстановление
упадёт на `duplicate key` (PK `profiles.id`). Заодно исключает срабатывание
`comment_cooldown` при массовой загрузке старых комментариев.

`--exclude-table=auth.schema_migrations` тоже обязателен: это служебная
таблица версий миграций самого GoTrue. Self-hosted GoTrue уже заполнил её
при первом старте (шаг 2), и набор миграций Cloud ≠ self-host — перенос
этих строк даст `duplicate key` при импорте и может запутать GoTrue при
следующем обновлении.

### 4.2 Импорт в новую БД

```bash
scp cloud-data.sql root@<IP-VPS>:/root/vibeclub/
ssh root@<IP-VPS>
cd /root/vibeclub
docker compose exec -T db psql -U postgres -d postgres < cloud-data.sql
```

Проверка:

```bash
docker compose exec db psql -U postgres -d postgres -c "select count(*) from auth.users;"
docker compose exec db psql -U postgres -d postgres -c "select count(*) from public.projects;"
# Ожидаем: те же числа, что в Cloud Dashboard (сейчас — 3 юзера, 3 проекта)
```

Если `duplicate key` несмотря на `--disable-triggers` — БД уже была не пустая
(повторный прогон на той же базе), это не страшно для идемпотентных данных,
но проверь вручную, не задвоилось ли что-то.

### 4.3 Файлы storage

```bash
OLD_URL=https://ndhyvspgkelxgqmfmmry.supabase.co \
OLD_SERVICE_ROLE=<service_role Cloud-проекта, Dashboard → Settings → API> \
NEW_URL=https://api.wedesignerz.com \
NEW_SERVICE_ROLE=<SERVICE_ROLE_KEY из infra/.env> \
node infra/scripts/copy-storage.mjs
```

Запускать локально (там, где Node и есть сеть до обоих URL). Проверка —
в выводе `Готово: N/N файлов перенесено` (N=N, без провалов).

---

## Шаг 5 — замена хоста в данных

Старый хост в абсолютных URL: `ndhyvspgkelxgqmfmmry.supabase.co`. Заменить на
`api.wedesignerz.com` в `avatar_url`, `cover_url` и поэлементно в `images`:

```sql
-- Выполнить в psql на новой БД (docker compose exec db psql -U postgres -d postgres)

update public.profiles
set avatar_url = replace(avatar_url, 'ndhyvspgkelxgqmfmmry.supabase.co', 'api.wedesignerz.com')
where avatar_url like '%ndhyvspgkelxgqmfmmry.supabase.co%';

update public.projects
set cover_url = replace(cover_url, 'ndhyvspgkelxgqmfmmry.supabase.co', 'api.wedesignerz.com')
where cover_url like '%ndhyvspgkelxgqmfmmry.supabase.co%';

update public.projects
set images = (
  select array_agg(replace(img, 'ndhyvspgkelxgqmfmmry.supabase.co', 'api.wedesignerz.com') order by ord)
  from unnest(images) with ordinality as t(img, ord)
)
where exists (
  select 1 from unnest(images) as img where img like '%ndhyvspgkelxgqmfmmry.supabase.co%'
);
```

Проверка:

```sql
select cover_url from public.projects where cover_url is not null;
-- Ни одной строки со старым хостом
select count(*) from public.projects, unnest(images) img where img like '%supabase.co%';
-- Ожидаем: 0
```

---

## Шаг 6 — почта (send-email hook → Unisender Web API)

**Почему не SMTP.** `infra/.env` содержит `SMTP_HOST/PORT/USER/PASS`
(шаг 1.2), но SMTP-порты Unisender Go (`smtp.go2.unisender.ru`, 587/465)
**недоступны по TCP** ни с VPS, ни с домашней машины Тёмы (два независимых
провайдера, диагностика 2026-07-14, живой ICMP-ping проходит — фильтрация
именно на TCP-уровне, поддержка Unisender блок отрицает, но факт
воспроизводится). SMTP-переменные в `.env` оставлены как есть (GoTrue их не
трогает, пока hook включён) — просто письма реальным путём не идут.

**Web API Unisender рабочий** — проверено, письмо доставлено:

```bash
curl -s -X POST "https://go2.unisender.ru/ru/transactional/api/v1/email/send.json" \
  -H "X-API-KEY: <ключ>" -H "Content-Type: application/json" \
  -d '{"message":{"recipients":[{"email":"..."}],"body":{"html":"..."},
       "subject":"...","from_email":"noreply@mail.wedesignerz.com","from_name":"We Designerz"}}'
# -> {"status":"success","job_id":"..."}
```

Решение — `infra/mail-bridge/` (Node без npm-зависимостей, сервис
`mail-bridge` в `docker-compose.yml`, порт `9998` только на внутренней
docker-сети): принимает вебхук GoTrue `send-email` (подпись
standard-webhooks проверяется секретом `SEND_EMAIL_HOOK_SECRET`), рендерит
письмо из `./mail-templates/*.html` и шлёт через Web API Unisender.

### 6.1 Секрет и ключ

```bash
cd infra
node scripts/gen-keys.mjs --update-env   # допишет SEND_EMAIL_HOOK_SECRET, если его ещё нет
```

До первичного копирования впиши в локальный `infra/.env`; на уже работающем
VPS фактический путь — `/root/vibeclub/.env`:
- `UNISENDER_API_KEY` — тот же API-ключ, что уже лежит как `SMTP_PASS`.
- Проверь `MAIL_FROM` / `MAIL_FROM_NAME` / `API_EXTERNAL_BASE` — дефолты в
  `.env.example` обычно верны как есть.

### 6.2 Поднять и проверить

```bash
docker compose up -d mail-bridge auth
docker compose ps mail-bridge auth   # оба healthy
docker ps --format '{{.Names}}\t{{.Ports}}' | grep mail-bridge
# Ожидаем: порты пустые/только внутренние — НЕ должно быть 0.0.0.0:9998
```

Живой тест — `/recover` шлёт письмо только существующему пользователю (если
тестовой почты ещё нет в базе — заведи через `/auth/v1/signup` тем же
способом или зарегистрируйся на сайте один раз; см. также грабли с
`free_tier` Unisender ниже — до верификации домена сработает только на уже
проверенный тестовый адрес):

```bash
curl -X POST https://api.wedesignerz.com/auth/v1/recover \
  -H "apikey: <ANON_KEY из infra/.env>" \
  -H "Content-Type: application/json" \
  -d '{"email":"<твоя личная почта для теста>"}'
```

Проверка: письмо пришло (папка «Входящие», проверь и «Спам»), ссылка в нём
ведёт на `https://api.wedesignerz.com/auth/v1/verify?token=...&type=recovery&redirect_to=...`
и по ней происходит вход. Если нет — `docker compose logs mail-bridge --tail=50`
(там же видно `невалидная подпись` или ошибку Unisender без PII) и
`docker compose logs auth | grep -i hook`.

Невалидная подпись вебхука должна отбиваться 401 — проверить можно прямым
curl на мост изнутри VPS (`docker compose exec auth wget -qO- --header "webhook-id: x" --header "webhook-timestamp: $(date +%s)" --header "webhook-signature: v1,AAAA" --post-data '{}' http://127.0.0.1:9998/`) — ожидаем `401` (живьём проверено 2026-07-14).

**Грабли живого подъёма (2026-07-14), уже исправлены в репо:**
- GoTrue валидирует `http://`-хуки ТОЛЬКО для хостов `localhost`/`127.0.0.1`/
  `::1`/`host.docker.internal` (`internal/conf/configuration.go`,
  `ValidateExtensibilityPoint`) — обычное имя сервиса вида
  `http://mail-bridge:9998/` роняет `auth` при старте с фатальной ошибкой
  `only localhost, 127.0.0.1, and ::1 are supported with http`. Поэтому
  `mail-bridge` в `docker-compose.yml` поднят с `network_mode: service:auth`
  (общий сетевой неймспейс с `auth`), а `GOTRUE_HOOK_SEND_EMAIL_URI` —
  `http://127.0.0.1:9998/`. Именно `127.0.0.1`, не `localhost`: `/etc/hosts`
  в образе резолвит `localhost` и в `127.0.0.1`, и в `::1`, а `server.mjs`
  слушает только IPv4 — через `::1` было `connection refused`.
- `server.mjs` по умолчанию ищет `../mail-templates` от своего расположения
  (верно для локального запуска), но в контейнере оба bind-mount'а плоские
  внутри `/app` — понадобился явный `MAIL_TEMPLATES_DIR: /app/mail-templates`
  в `environment` сервиса `mail-bridge`.
- **Unisender Go на тарифе `free_tier` шлёт письма ТОЛЬКО на «проверенные»
  адреса/домены** (проверено живьём: `/recover` на `veteristema@gmail.com`
  доставился, а `/signup` на новый адрес того же `gmail.com` упал с `403
  ... 'free_tier' tariff it is allowed to send letters only to the
  'checked' domains or 'checked' emails`). Это блокер не мостика, а самого
  аккаунта Unisender — **до анонса обязательно поднять тариф или
  верифицировать домен `mail.wedesignerz.com`** в кабинете Unisender Go,
  иначе реальные пользователи (кроме проверенных тестовых адресов) вообще
  не получат ни одного письма. Живой тест `/signup` на новый адрес до этого
  момента невозможен — только `/recover` на уже одобренный адрес.

**SPF/DKIM для `mail.wedesignerz.com`:** записи выдаёт кабинет Unisender Go
(раздел «Домены отправки» → добавить домен → скопировать TXT-записи в DNS).
Без этого письма будут падать в спам массово — сделать до анонса. Это же
действие (верификация домена отправки), как правило, снимает и ограничение
`free_tier` из пункта выше — сделать одним заходом в кабинет.

---

## Шаг 7 — прогон ДО переключения фронта (обязательно весь зелёный)

**Статус 2026-07-15: выполнено.** Регистрация с Turnstile, письмо, вход,
recovery, проект с обложкой, модерация, комментарий, feedback и
`security-check` пройдены на self-host. Инструкции ниже сохранены для будущих
повторных прогонов.

Не коммитить изменения ниже — только локальная проверка.

1. Временно поменяй в `js/config.js` (не коммитить):
   ```js
   export const SUPABASE_URL = 'https://api.wedesignerz.com';
   export const SUPABASE_ANON_KEY = '<ANON_KEY из infra/.env>';
   ```
2. `python3 -m http.server 8080` → `http://localhost:8080/index.html`
3. Пройти живьём:
   - [x] Регистрация с новой почтой → письмо подтверждения → переход по
     ссылке → вход (до верификации домена/тарифа в Unisender Go — см. шаг 6 —
     письмо дойдёт только на заранее проверенный тестовый адрес, не на
     произвольный новый)
   - [x] Сабмит проекта с обязательной обложкой
   - [x] Публикация в админке (нужен свой `role='admin'`:
     `docker compose exec db psql -U postgres -d postgres -c "update public.profiles set role='admin' where id='<uuid>';"`)
   - [x] Комментарий под опубликованным проектом
4. Security-check. При включённой CAPTCHA вход паролем из CLI не работает;
   скопируй `access_token` обычного участника из живой браузерной сессии и
   передай его только через переменную окружения:
   ```bash
   WDZ_TEST_JWT='<access_token>' node scripts/security-check.mjs
   ```
   Ожидаем: `✓ ВСЁ ЧИСТО`.
5. `git restore js/config.js` — откатить только временную правку. Перед этим
   убедись через `git diff -- js/config.js`, что в файле не было других своих
   незакоммиченных изменений.

Все пункты зелёные → переходи к шагу 8. Если что-то красное — не переключай
прод, чини на self-host и повтори шаг 7 с начала.

---

## Шаг 8 — переключение

**Статус 2026-07-15: выполнено.** Production `js/config.js` указывает на
`api.wedesignerz.com` и `stats.wedesignerz.com`; GitHub Pages deploy зелёный.

Отдельным коммитом:

```js
// js/config.js
export const SUPABASE_URL = 'https://api.wedesignerz.com';
export const SUPABASE_ANON_KEY = '<ANON_KEY из infra/.env>';
// ...
export const UMAMI_SRC = 'https://stats.wedesignerz.com/script.js';
export const UMAMI_WEBSITE_ID = '<id сайта из self-host Umami>';
```

`UMAMI_WEBSITE_ID` self-host — зайти на `https://stats.wedesignerz.com`,
логин `admin`, пароль — тот, что задан при аудите безопасности (лежит в
менеджере паролей Тёмы, НЕ дефолтный `umami`: он сменён сразу после подъёма,
см. `docs/15-security-hardening.md`), добавить сайт `wedesignerz.com`,
скопировать его id.

**Статус 2026-07-14:** сайт `wedesignerz.com` уже создан в self-host Umami,
`/api/send` принимает tracking-запрос (HTTP 200). ID не дублируется в
документации; перед cutover взять его из Umami или безопасным read-only
запросом к таблице `website`.

```bash
git add js/config.js
git commit -m "feat(T-LOC): переключение фронта на self-hosted бэкенд"
git push
```

Деплой пройдёт по Actions автоматически. После деплоя — живая проверка с
прода: регистрация/вход/сабмит на реальном `wedesignerz.com`.

### Шаг 8.1 — сверка, приёмка и граница отката

**Статус 2026-07-15: выполнено.** Итог и baseline зафиксированы в
`docs/reports/T-CUTOVER-02-freeze-report.md`.

Пока этот шаг не зелёный, не открывать регистрации, не снимать `robots.txt`
и не приглашать пользователей обратно.

- [x] Сверить с контрольным листом из шага 4 количества и последние даты во
      всех шести наборах данных. Проверить, что в новой БД нет URL старого
      `*.supabase.co` в `avatar_url`, `cover_url` и `images`.
- [x] Открыть несколько перенесённых обложек и аватаров с прода.
- [x] Пройти полный сценарий: регистрация + Turnstile → письмо → подтверждение
      → вход → восстановление пароля → проект с обложкой → модерация →
      комментарий → feedback → событие в self-host Umami.
- [x] Запустить `WDZ_TEST_JWT='<access_token>' npm run security-check` обычным
      участником и `npm run check`.
- [x] Проверить логи `auth`, `rest`, `storage`, `mail-bridge`, `umami` и `caddy`:
      новых повторяющихся 4xx/5xx и рестартов нет.

**Если cloud изменился после дампа:** cutover не принят. Пока в новой базе нет
новых пользовательских записей, безопасный откат — вернуть старые значения
`js/config.js`, задеплоить и повторить миграцию в новое окно. Если записи уже
появились в self-hosted БД, простого отката нет: не переключать вслепую,
сначала составить план слияния двух дельт и сделать новые резервные копии обеих
баз.

---

## Шаг 9 — стабилизация до анонса

**Операционная часть закрыта 2026-07-15:** cron и watchdog установлены; финальный S3 backup
`2026-07-15_08-01` содержит три артефакта. Дампы основной БД и Umami
восстановлены в отдельные временные БД, Storage-архив прочитан. Три внешних
монитора зелёные, каналы уведомлений и дисковые пороги настроены. Намеренный
просроченный marker/404-инцидент и доставка тестового incident-алерта не
моделировались. Будущая пауза cloud и уведомление РКН ниже остаются открытыми.

- [ ] Cloud-проект **не удалять**. Через месяц стабильной работы self-host —
  `pause_project` в Supabase Dashboard. Ещё через месяц — удалить совсем.
- [x] **До возвращения пользователей** включить крон бэкапа:
  ```bash
  crontab -e
  # добавить строку:
  0 3 * * * /root/vibeclub/scripts/backup.sh >> /var/log/vibeclub-backup.log 2>&1
  17 * * * * /root/vibeclub/scripts/backup-watchdog.sh >> /var/log/vibeclub-backup-watchdog.log 2>&1
  ```
  Проверка: выполни `bash /root/vibeclub/scripts/backup.sh` руками разово и
  убедись, что в бакете Timeweb появились `db/db_*.dump`,
  `db/umami_*.dump` и
  `storage/storage_*.tar.gz`. `backup.sh` ищет `.env` и вызывает
  `docker compose exec`, поэтому сам скрипт должен лежать и запускаться из
  `/root/vibeclub/scripts/` (там же, где `docker-compose.yml`) — так и есть
  после шага 1.5.
- [x] Проверить восстановимость, не трогая прод-БД:
  сначала скачать из S3 три файла одного свежего запуска в `/tmp` и подставить
  их реальные пути вместо `/path/to/...` ниже.
  ```bash
  # Подставить самый свежий db_*.dump, создать отдельную временную БД.
  docker compose exec -T db createdb -U postgres wdz_restore_test
  docker compose exec -T db pg_restore -U postgres -d wdz_restore_test \
    --clean --if-exists --no-owner --no-privileges \
    < /path/to/db_YYYY-MM-DD_HH-MM.dump
  docker compose exec -T db psql -U postgres -d wdz_restore_test \
    -c "select count(*) from public.projects;"
  docker compose exec -T db dropdb -U postgres wdz_restore_test
  docker compose exec -T db createdb -U postgres wdz_umami_restore_test
  docker compose exec -T db pg_restore -U postgres -d wdz_umami_restore_test \
    --clean --if-exists --no-owner --no-privileges \
    < /path/to/umami_YYYY-MM-DD_HH-MM.dump
  docker compose exec -T db psql -U postgres -d wdz_umami_restore_test \
    -c "select count(*) from website;"
  docker compose exec -T db dropdb -U postgres wdz_umami_restore_test
  tar -tzf /path/to/storage_YYYY-MM-DD_HH-MM.tar.gz >/dev/null
  ```
  Результат и дату restore-теста записать в закрытый операционный журнал.
- [x] Поставить внешний uptime-монитор минимум на
      `https://api.wedesignerz.com/auth/v1/health` и
      `https://stats.wedesignerz.com/api/heartbeat`, а также
      `https://api.wedesignerz.com/health/backup`. Последний endpoint отдаёт
      `200` только пока backup-watchdog видит успешный backup не старше 26
      часов; после этого он намеренно отдаёт `404`, чтобы внешний монитор
      создал инцидент. Отдельно включить email-алерты Timeweb на заполнение
      диска VPS 90% и 100%.
- [x] Обновить `docs/14-ru-compliance.md`: дата локализации и фактические
      провайдеры.
- [ ] Подать уведомление РКН об обработке ПДн после T-CONSENT. Не утверждать, что
      трансграничная передача исчезла: до T-FRONT-VPS отдельно учитывать
      GitHub Pages/Fastly, а по финальной схеме — Google Fonts и Cloudflare
      Turnstile.
- [x] Только после backup + restore-test + мониторинга вернуть sign ups и
      открыть сайт участникам. Cloud-проект оставить с выключенными sign ups.

---

## Границы (не нарушать)

- Секреты — только в `/root/vibeclub/.env` на сервере и в менеджере паролей
  Тёмы. В
  репозитории — только `.env.example`.
- `service_role` никогда не попадает во фронт.
- Схему БД и RLS-политики (`supabase/schema.sql`) не менять — переезд 1:1.
- Не переключать прод, пока шаг 7 не пройден целиком и зелёным.
- Studio наружу не выставлен: `docker-compose.studio.yml` публикует его только
  на loopback VPS (`127.0.0.1:3000`), а `scripts/open-studio.sh` запускает
  контейнер по требованию, открывает SSH-туннель и Google Chrome. Из корня
  репозитория:

  ```bash
  ./infra/scripts/open-studio.sh
  ```

  Пока открыто окно терминала, интерфейс доступен на
  `http://127.0.0.1:3000/project/default`. Первая загрузка новой версии может
  занять 30–40 секунд; повторные загрузки используют кэш Chrome и проходят
  заметно быстрее. Для системного браузера можно задать
  `WDZ_STUDIO_BROWSER=default`.
  После `Ctrl+C` туннель и контейнер Studio останавливаются; production API/DB
  продолжают работать. Если локальный порт 3000 занят:
  `WDZ_STUDIO_LOCAL_PORT=3001 ./infra/scripts/open-studio.sh`. Публиковать
  Studio на `0.0.0.0` или проксировать через Caddy запрещено.

## Что осталось руками Тёмы

- Реализовать T-CONSENT, затем подать уведомление РКН по фактической схеме
  (`docs/14-ru-compliance.md`).
- После согласованного стабилизационного окна убрать старый cloud Supabase host
  из CSP/`check:csp`.
- Перенести публичный anon key Auth-монитора Timeweb из query string в HTTP
  header `apikey`.
- Отдельно смоделировать просроченный backup marker/404 и проверить доставку
  incident-уведомления; после теста вернуть свежий marker и зелёный монитор.
