# RUNBOOK — миграция бэкенда на RU-VPS (T-LOC)

Пошаговая инструкция для Тёмы. Каждый шаг — команда(ы), как проверить успех,
что делать при ошибке. Идёшь сверху вниз, не пропуская чекбоксы.

**Пререквизиты (должны быть готовы ДО начала):**
- [ ] VPS куплен (Timeweb Cloud, Ubuntu 22.04+, ≥4 ГБ RAM / 2 vCPU / ≥50 ГБ NVMe)
- [ ] A-записи в DNS: `api.wedesignerz.com` → IP VPS, `stats.wedesignerz.com` → IP VPS
- [ ] Аккаунт Unisender Go заведён, SMTP-креды под рукой
- [ ] Бакет S3-совместимого хранилища Timeweb создан, ключи доступа получены

Не переключай прод (шаг 8), пока шаг 7 не пройден целиком и зелёным.

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
- `SMTP_USER` / `SMTP_PASS` — из кабинета Unisender Go
- `BACKUP_S3_BUCKET` / `BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY` — из кабинета Timeweb
- Сверь `SMTP_HOST`/`SMTP_PORT` в кабинете Unisender Go (дефолт в файле —
  `smtp.unisender.com:587`, но перепроверь, могло измениться)

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

## Шаг 4 — перенос данных

### 4.1 Дамп схемы `public` + `auth` из Cloud

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

Впиши руками в `infra/.env` (на сервере, не в репозитории):
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

Не коммитить изменения ниже — только локальная проверка.

1. Временно поменяй в `js/config.js` (не коммитить):
   ```js
   export const SUPABASE_URL = 'https://api.wedesignerz.com';
   export const SUPABASE_ANON_KEY = '<ANON_KEY из infra/.env>';
   ```
2. `python3 -m http.server 8080` → `http://localhost:8080/index.html`
3. Пройти живьём:
   - [ ] Регистрация с новой почтой → письмо подтверждения → переход по
     ссылке → вход (до верификации домена/тарифа в Unisender Go — см. шаг 6 —
     письмо дойдёт только на заранее проверенный тестовый адрес, не на
     произвольный новый)
   - [ ] Сабмит проекта с обязательной обложкой
   - [ ] Публикация в админке (нужен свой `role='admin'`:
     `docker compose exec db psql -U postgres -d postgres -c "update public.profiles set role='admin' where id='<uuid>';"`)
   - [ ] Комментарий под опубликованным проектом
4. Security-check:
   ```bash
   node scripts/security-check.mjs <тестовый-email> <пароль>
   ```
   Ожидаем: `✓ ВСЁ ЧИСТО`.
5. `git checkout js/config.js` — откатить временную правку, она не коммитится.

Все пункты зелёные → переходи к шагу 8. Если что-то красное — не переключай
прод, чини на self-host и повтори шаг 7 с начала.

---

## Шаг 8 — переключение

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

```bash
git add js/config.js
git commit -m "feat(T-LOC): переключение фронта на self-hosted бэкенд"
git push
```

Деплой пройдёт по Actions автоматически. После деплоя — живая проверка с
прода: регистрация/вход/сабмит на реальном `wedesignerz.com` (или текущем
Pages-адресе, если домен ещё не подключён).

---

## Шаг 9 — после переезда

- [ ] Cloud-проект **не удалять**. Через месяц стабильной работы self-host —
  `pause_project` в Supabase Dashboard. Ещё через месяц — удалить совсем.
- [ ] Включить крон бэкапа:
  ```bash
  crontab -e
  # добавить строку:
  0 3 * * * /root/vibeclub/scripts/backup.sh >> /var/log/vibeclub-backup.log 2>&1
  ```
  Проверка: выполни `bash /root/vibeclub/scripts/backup.sh` руками разово и
  убедись, что в бакете Timeweb появились `db/db_*.dump` и
  `storage/storage_*.tar.gz`. `backup.sh` ищет `.env` и вызывает
  `docker compose exec`, поэтому сам скрипт должен лежать и запускаться из
  `/root/vibeclub/scripts/` (там же, где `docker-compose.yml`) — так и есть
  после шага 1.5.
- [ ] Обновить `docs/14-ru-compliance.md`: дата локализации, статус —
  «выполнено».
- [ ] **Напомнить Тёме подать уведомление РКН** (`docs/14-ru-compliance.md`,
  раздел «Как подавать» — теперь схема простая: один ЦОД, российский,
  уведомление о трансграничной передаче больше не нужно).

---

## Границы (не нарушать)

- Секреты — только в `infra/.env` на сервере и в менеджере паролей Тёмы. В
  репозитории — только `.env.example`.
- `service_role` никогда не попадает во фронт.
- Схему БД и RLS-политики (`supabase/schema.sql`) не менять — переезд 1:1.
- Не переключать прод, пока шаг 7 не пройден целиком и зелёным.
- Studio наружу не выставлен (см. комментарий в `docker-compose.yml`) — если
  понадобится, добавить сервис `studio` во временный override-compose с
  портом, опубликованным ТОЛЬКО на loopback (`"127.0.0.1:3000:3000"`, не
  `"3000:3000"`), и открывать через ssh-туннель:
  `ssh -L 3000:127.0.0.1:3000 root@<IP-VPS>` → `http://localhost:3000` на
  своей машине. Наружу (0.0.0.0) Studio не публиковать никогда.

## Что осталось руками Тёмы

- Покупка VPS, DNS-записи, аккаунт Unisender Go, бакет Timeweb S3 — до старта.
- Исполнение этого ранбука на VPS (шаги 1–9) — ассистент код не выполняет за
  пределами репозитория.
- Реальные тексты писем в `infra/mail-templates/*.html` — сейчас там рабочие
  заглушки, TODO-пометки внутри файлов.
- После переезда — подать уведомление РКН об обработке ПДн с российским ЦОД
  (`docs/14-ru-compliance.md`, шаг 9 выше).
