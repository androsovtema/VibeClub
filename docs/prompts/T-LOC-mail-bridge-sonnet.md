# Промпт для Sonnet — T-LOC-MAIL: мост GoTrue → Unisender Web API

> Скопируй всё под чертой в сессию Sonnet. Ветка `main`, репо
> `androsovtema/VibeClub`. Отвечай по-русски. Доступ к серверу: `ssh vibeclub`
> (рабочая папка `/root/vibeclub`, там же боевой `.env` с секретами — в репо
> НЕ коммитить). Читай `CLAUDE.md`, `infra/RUNBOOK.md`, `infra/docker-compose.yml`,
> `docs/15-security-hardening.md` перед работой.

---

## Контекст и почему так

Бэкенд We Designerz переехал на self-hosted Supabase на RU-VPS (T-LOC, шаги 1–6
ранбука пройдены Opus). Единственный блокер шага 7 — **GoTrue не может слать
письма**.

Диагностика (Opus, 2026-07-14): GoTrue умеет только SMTP, но SMTP-порты
Unisender Go (`smtp.go2.unisender.ru`, 587/465) **недоступны по TCP** и с VPS,
и с домашней машины Тёмы (два независимых провайдера) — при живом ICMP-ping.
Это фильтрация на стороне Unisender, их поддержка блок отрицает, но факт
воспроизводится. **Web API Unisender при этом работает** — тестовое письмо
через него реально доставлено:

```bash
curl -s -X POST "https://go2.unisender.ru/ru/transactional/api/v1/email/send.json" \
  -H "X-API-KEY: <ключ>" -H "Content-Type: application/json" \
  -d '{"message":{"recipients":[{"email":"..."}],"body":{"html":"..."},
       "subject":"...","from_email":"noreply@mail.wedesignerz.com","from_name":"We Designerz"}}'
# -> {"status":"success","job_id":"..."}
```

Решение: включить у GoTrue **send-email hook** (HTTP) и поставить рядом
крошечный сервис-мост, который принимает вебхук GoTrue и шлёт письмо через
Web API Unisender. SMTP уходит из цепочки совсем.

Проверено в исходниках GoTrue v2.189.0: `Hook.SendEmail` есть,
`hookshttp.go` поддерживает `http://`-схему, подпись — standard-webhooks
(HMAC-SHA256 base64 от `{id}.{timestamp}.{body}`, секрет из `whsec_<base64>`).

## Что сделать

### 1. `infra/mail-bridge/` — сервис-мост

- `server.mjs` — Node, **без npm-зависимостей** (только stdlib, как
  `scripts/copy-storage.mjs`). HTTP-сервер на `:9998`, слушает только
  внутреннюю docker-сеть (порт наружу НЕ публиковать).
- Эндпоинт `POST /` принимает вебхук GoTrue send_email:
  - Заголовки standard-webhooks: `webhook-id`, `webhook-timestamp`,
    `webhook-signature`. **Проверить подпись** секретом из env
    `SEND_EMAIL_HOOK_SECRET` (формат `v1,whsec_<base64>` — брать часть после
    `whsec_`, base64-decode, HMAC-SHA256 от `{id}.{timestamp}.{rawBody}`,
    сравнить с одной из подписей в заголовке `v1,<sig> v1,<sig>`). Невалидная
    подпись → 401, тело не обрабатывать.
  - Тело: `{ "user": { "email": ... }, "email_data": { "token_hash",
    "email_action_type", "redirect_to", "site_url", "token_hash_new", ... } }`.
  - Собрать ссылку подтверждения ровно как GoTrue:
    `${API_EXTERNAL_BASE}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`,
    где `API_EXTERNAL_BASE=https://api.wedesignerz.com` (env). Для
    `email_change` учесть `token_hash_new` — свериться с докой GoTrue по типам
    (`signup`/`recovery`/`email_change`/`magiclink`/`invite`).
  - По `email_action_type` выбрать шаблон из `infra/mail-templates/*.html`
    (переиспользовать существующие: `confirmation.html`, `recovery.html`,
    `email_change.html`) и тему из env (`MAILER_SUBJECTS_*`, уже в `.env`).
    Подставить ссылку вместо плейсхолдера `{{ .ConfirmationURL }}`
    (и прочих `{{ . }}`, что используются).
  - Отправить через Web API Unisender (`UNISENDER_API_URL`, `UNISENDER_API_KEY`,
    `MAIL_FROM`, `MAIL_FROM_NAME` из env). Тайм-аут, обработка ошибок:
    при не-`success` вернуть 500 с телом ошибки (GoTrue залогирует и покажет
    юзеру мягкую ошибку), при успехе — `200 {}`.
  - Никаких PII в логах, кроме факта отправки (тип письма + статус). Ключи
    не логировать.
- `Dockerfile` не нужен, если хватит `node:22-alpine` с bind-mount `server.mjs`
  (как удобнее — можно и минимальный Dockerfile). Образ Node зафиксировать
  тегом (не `latest`).

### 2. `infra/docker-compose.yml`

- Сервис `mail-bridge`: образ `node:22-alpine` (или свой), `command` запускает
  `server.mjs`, volume с `./mail-bridge` и `./mail-templates` (ro),
  `restart: unless-stopped`, healthcheck на `:9998/health`, порт наружу НЕ
  публиковать. `depends_on` не обязателен.
- В сервис `auth` добавить env:
  - `GOTRUE_HOOK_SEND_EMAIL_ENABLED: "true"`
  - `GOTRUE_HOOK_SEND_EMAIL_URI: http://mail-bridge:9998/`
  - `GOTRUE_HOOK_SEND_EMAIL_SECRETS: ${SEND_EMAIL_HOOK_SECRET}`
  - Оставить SMTP-переменные как есть (не мешают; при включённом хуке GoTrue
    шлёт через хук). Проверить в доке: не нужно ли явно что-то отключить.

### 3. `infra/.env.example` (+ реальный `.env` на сервере — руками, gen-keys не трогает)

Добавить с комментариями:
- `SEND_EMAIL_HOOK_SECRET=` — формат `v1,whsec_<base64-32-байта>`. Дописать в
  `infra/scripts/gen-keys.mjs` генерацию этого секрета (base64 от 32 байт с
  префиксом `v1,whsec_`).
- `UNISENDER_API_URL=https://go2.unisender.ru/ru/transactional/api/v1/email/send.json`
- `UNISENDER_API_KEY=` — тот же API-ключ Unisender (в боевом `.env` уже есть как
  `SMTP_PASS`, но заведи отдельную явную переменную, не переиспользуй).
- `MAIL_FROM=noreply@mail.wedesignerz.com`, `MAIL_FROM_NAME=We Designerz`
- `API_EXTERNAL_BASE=https://api.wedesignerz.com`

### 4. `infra/RUNBOOK.md`

- Шаг 6 переписать: вместо «тестовое письмо через SMTP» — поднять `mail-bridge`,
  сгенерировать `SEND_EMAIL_HOOK_SECRET`, вписать `UNISENDER_API_KEY`,
  `docker compose up -d mail-bridge auth`, проверка: `POST /auth/v1/recover`
  реально шлёт письмо (приходит на ящик). Оставить пометку, что путь через
  SMTP не заработал (кратко, со ссылкой на диагностику здесь), Web API — рабочий.
- Отметить в `docs/15-security-hardening.md` или новом абзаце, что hook-секрет —
  ещё один секрет только в `.env`.

## Приёмка (обязательно живьём на VPS)

1. `docker compose config -q` валиден, `mail-bridge` healthy, наружу не
   опубликован (`docker ps` — нет `0.0.0.0:9998`).
2. **Живой тест**: `curl -X POST https://api.wedesignerz.com/auth/v1/recover`
   с anon-ключом на реальный ящик Тёмы (спроси, какой) → письмо **приходит**,
   ссылка в нём ведёт на `api.wedesignerz.com/auth/v1/verify?...` и по ней
   происходит вход. Подтверждение регистрации (`signup`) — тоже проверить
   (создай тестового юзера через сайт на шаге 7, либо
   `POST /auth/v1/signup`), письмо приходит, по ссылке аккаунт активируется.
3. Невалидная подпись вебхука → 401 (проверить curl-ом с левой подписью).
4. После проверки удалить тестового юзера
   (`DELETE /auth/v1/admin/users/<id>` с service_role), в базе снова 3 юзера.
5. Линтеры репо: `npm run lint` — 0. Секреты не в репозитории (только
   `.env.example` с пустыми значениями).
6. В ответе — что осталось Тёме (если что-то), и подтверждение, что шаг 7
   ранбука теперь проходим целиком.

## Границы

- Схему БД и RLS не трогать. `js/config.js` НЕ переключать (это шаг 8, отдельно).
- Секреты — только в `.env` на сервере и менеджере паролей Тёмы.
- Сервис-мост наружу не публиковать — только внутренняя docker-сеть.
- Не удалять/не менять SMTP-переменные и mail-шаблоны Caddy (шаблоны
  переиспользуются мостом; раздача через Caddy остаётся как есть — не мешает).
