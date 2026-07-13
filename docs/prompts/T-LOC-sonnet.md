# Промпт для Sonnet — задача T-LOC (локализация бэкенда в РФ)

> Скопируй всё под чертой в сессию Sonnet. Работать на ветке `main`
> (`git branch --show-current` должно = `main`, репо `androsovtema/VibeClub`).
> Отвечай по-русски.
>
> **Пререквизиты (Тёма, до запуска Sonnet):** куплен VPS (Timeweb Cloud,
> Ubuntu 22.04+, ≥4 ГБ RAM / 2 vCPU / ≥50 ГБ NVMe), A-записи
> `api.wedesignerz.com` и `stats.wedesignerz.com` → IP VPS, заведён аккаунт
> Unisender Go (SMTP-креды под рукой). Если чего-то нет — Sonnet всё равно
> готовит артефакты, а исполнение ранбука откладывается.

---

Проект We Designerz — статический сайт-клуб вайбкодеров (GitHub Pages), бэкенд
Supabase Cloud (EU), который переезжает на self-hosted в РФ по юридическим
причинам. Прочитай: `CLAUDE.md`, `docs/14-ru-compliance.md` (контекст и
выбранная схема), `docs/08-workflow.md`, `supabase/schema.sql`,
`supabase/migrations/` (все), `js/config.js`, `js/analytics.js`,
`.github/workflows/deploy.yml`, `scripts/security-check.mjs`.

## Контекст

Целевая архитектура (решение 2026-07-13, `14-ru-compliance.md`):

- Один RU-VPS: docker-compose c Supabase (db, kong, auth/GoTrue, rest/PostgREST,
  storage + imgproxy, meta; **без** realtime, edge functions, logflare/analytics,
  vector — не используются) + Umami self-host + Caddy (reverse proxy + авто-TLS).
- SMTP — Unisender Go (вместо Resend), домен писем `mail.wedesignerz.com`.
- API-домен: `https://api.wedesignerz.com`, Umami: `https://stats.wedesignerz.com`.
- Статика остаётся на GitHub Pages, фронт меняет только конфиг.

Твоя работа — артефакты в репо + ранбук; на VPS команды исполняет Тёма,
построчно копируя из ранбука. Пиши ранбук так, чтобы человек без девопс-опыта
прошёл его сверху вниз.

## Выход

### 1. `infra/` — конфигурация деплоя (новая папка)

База — официальный `supabase/docker` (github.com/supabase/supabase, папка
`docker/`). Не тащи его целиком: возьми компоуз и `volumes/`, урежь до нужных
сервисов, зафиксируй версии образов явными тегами (не `latest`).

- `infra/docker-compose.yml` — supabase-сервисы (см. список выше) + `umami`
  (postgres-вариант; отдельная база в том же инстансе Postgres допустима) +
  `caddy`.
- `infra/Caddyfile` — `api.wedesignerz.com` → kong (8000), `stats.wedesignerz.com`
  → umami (3000). Caddy сам получает Let's Encrypt-сертификаты.
- `infra/.env.example` — все переменные с комментариями: POSTGRES_PASSWORD,
  JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, SITE_URL (`https://wedesignerz.com`),
  API_EXTERNAL_URL, GOTRUE SMTP_* (Unisender Go), redirect-allowlist,
  UMAMI_APP_SECRET и т.д. Реальный `.env` — **никогда не в репо**: добавь
  `infra/.env` в `.gitignore`.
- `infra/scripts/gen-keys.mjs` — генерация JWT_SECRET + подписанных им
  ANON_KEY/SERVICE_ROLE_KEY (стандартные клеймы supabase: role, iss, exp).
- `infra/scripts/backup.sh` + строка crontab в ранбуке: ночной `pg_dump`
  (вся база) + архив storage-файлов → S3-совместимое хранилище Timeweb
  (креды из `.env`), ротация: хранить 14 суток.
- GoTrue mailer-шаблоны: в Cloud они кастомные (T21) — вынеси текущие тексты
  в `infra/mail-templates/` (возьми у Тёмы из Dashboard → Auth → Templates,
  попроси прислать; если недоступны — оставь TODO-заглушки с пометкой).

### 2. Правки деплоя и фронта

- `.github/workflows/deploy.yml`: добавить `--exclude='infra'` в rsync
  (правило CLAUDE.md: служебные папки не публикуются).
- `js/analytics.js`: src скрипта захардкожен (`cloud.umami.is`) —
  параметризуй: `UMAMI_SRC` в `js/config.js` рядом с `UMAMI_WEBSITE_ID`,
  дефолт — текущий cloud-URL, чтобы ничего не сломать до переезда.
- `js/config.js` НЕ переключай на новый URL в этой задаче — переключение
  делается шагом ранбука после проверки нового бэкенда (см. ниже), отдельным
  коммитом.

### 3. `infra/RUNBOOK.md` — ранбук миграции (главный артефакт)

Пошагово, с копируемыми командами и чекбоксами:

1. **VPS:** ssh, установка docker + compose plugin, ufw (22/80/443), clone
   репо или scp папки `infra/`, заполнение `.env` (ссылка на gen-keys).
2. **Подъём:** `docker compose up -d`, проверка здоровья каждого сервиса
   (curl-команды: kong, auth health, rest, storage, umami).
3. **Схема:** прогнать `supabase/schema.sql` + все `supabase/migrations/*.sql`
   на новую БД (psql-команды). Storage-бакеты создать как в Cloud (имена и
   public-флаги возьми из текущего кода — найди все `.storage.from(...)`).
4. **Данные:** экспорт из Cloud — `supabase` CLI (`db dump --data-only`) или
   прямой `pg_dump` по connection string; импорт в новую БД. Отдельно:
   схема `auth` (users с хэшами паролей — переносится дампом). Файлы storage:
   выгрузка из Cloud (скрипт `infra/scripts/copy-storage.mjs` через
   service_role старого проекта → service_role нового; объём — единицы файлов).
5. **Замена хоста в данных:** в БД абсолютные URL старого проекта
   (сейчас: 3 cover_url + 15 элементов images, avatar_url появятся) — готовый
   SQL: `update ... set cover_url = replace(cover_url, '<старый-хост>',
   'https://api.wedesignerz.com')` для profiles.avatar_url, projects.cover_url
   и поэлементно для projects.images (unnest/array_agg).
6. **SMTP:** переменные Unisender Go в `.env`, SPF/DKIM для
   `mail.wedesignerz.com` (записи даст кабинет Unisender), тестовое письмо.
7. **Прогон ДО переключения фронта:** локальная копия сайта с временно
   переключённым `js/config.js` на новый URL (не коммитить) — регистрация с
   подтверждением, вход, сабмит с обложкой, публикация в админке, коммент,
   `npm run security-check` против нового URL. Все зелёные → дальше.
8. **Переключение:** коммит `js/config.js` (URL + новый anon-ключ,
   UMAMI_SRC → `https://stats.wedesignerz.com/script.js`, website id из
   self-host Umami) → деплой → живая проверка с прода.
9. **После:** Cloud-проект НЕ удалять — pause через месяц стабильной работы,
   удалить ещё через месяц; включить крон бэкапа; строка в
   `docs/14-ru-compliance.md`, что локализация выполнена (дата) — и напоминание
   Тёме подать уведомление РКН (раздел «Как подавать», теперь только одно).

## Границы

- Секреты (пароли, service_role, SMTP) — только в `.env` на сервере и в
  менеджере паролей Тёмы. В репо — исключительно `.env.example`.
- `service_role` во фронт не попадает никогда; вся защита — RLS (не трогаешь).
- Схему БД и RLS-политики не менять — переезд 1:1.
- Не переключай прод, пока шаг 7 ранбука не зелёный целиком.
- Studio (админ-UI Supabase) наружу не выставлять: либо не поднимать, либо
  только за ssh-туннелем — отметь в компоузе комментарием.

## Приёмка

- `docker compose config` валиден; линтеры репо 0; `infra/` исключена из
  деплоя на Pages (проверить сборку `_site` локально rsync-командой из workflow).
- `gen-keys.mjs` выдаёт валидные JWT (проверка: jwt.io-декод в ранбуке).
- Ранбук проходится Тёмой без «а что тут имелось в виду» — каждый шаг:
  команда + как проверить успех + что делать при ошибке.
- Фронт до переключения работает как раньше (UMAMI_SRC-дефолт не ломает T19:
  локальный прогон — события в console.debug, консоль чистая).
- В ответе — список того, что осталось руками Тёмы (VPS, DNS, Unisender,
  исполнение ранбука) и напоминание про уведомление РКН после переезда.
