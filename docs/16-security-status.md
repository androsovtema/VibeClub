# 16 — Статус безопасности (актуально на 2026-07-14)

**Точка входа для новой сессии.** Здесь — что уже закрыто, что открыто, и что
можно трогать без спроса. Первоисточник находок — `audits/current-review/2026-07-14-security-audit.md`
(аудит проверен вручную: находки достоверны, но одна ошибка — см. «Важные факты», п.1).

## TL;DR

Дыры, позволявшие портить данные, **закрыты и работают на живой базе**.
Сервер VPS захарден (2026-07-14, вечер): парольный SSH выключен и проверен через
`sshd -T`, стоит fail2ban, контейнеры обновлены и закреплены по digest,
миграция применена и к self-hosted БД (SEC-09, SEC-08, SEC-12 закрыты).
Капча написана и задеплоена, но **выключена** — упирается в вопрос домена.

---

## Важные факты (без них новая сессия сделает неверные выводы)

1. **`wedesignerz.com` — это НЕ этот проект.** Домен обслуживается отдельным репо
   `androsovtema/wdcom` (там `CNAME`), последний коммит 2026-04-13, статичный
   сайт-портфолио без Supabase и авторизации (`/js/supabase.js` → 404).
   **Клубный сайт (этот репо) живёт на `https://androsovtema.github.io/VibeClub/`**,
   домен к нему не привязан (`gh api repos/androsovtema/VibeClub/pages` → `cname: None`).
   → Аудит в SEC-06 проверял заголовки старого сайта и приписал находку нам.
   Рекомендация сама по себе верная и выполнена, но проверять её надо на github.io.
   **Открытый вопрос к Тёме: переводим ли клуб на `wedesignerz.com`.**

2. **Supabase-проект сайта — `VibeClub` (`ndhyvspgkelxgqmfmmry`), план `free`.**
   Есть второй, self-hosted, на VPS (`api.wedesignerz.com`) — фронт его пока **не**
   использует. Правки нужно применять к обоим (SEC-12), но приоритет — cloud.

3. **План `free` ⇒ leaked-password protection недоступна** (нужен Pro). Отложено
   осознанно. На self-hosted она бесплатна — включим при переезде (T-LOC).

---

## Закрыто и проверено

### В живой cloud-базе (миграция `security_audit_2026_07_14_p0p1` применена)

Зеркало в репо: `supabase/migrations/2026-07-14-security-audit-p0p1.sql`,
канон — `supabase/schema.sql`.

| ID | Что было | Как закрыто |
|---|---|---|
| SEC-02 | Автор мог PATCH-ем поставить себе любой `upvotes` | `protect_privileged_columns` отбивает смену `upvotes`; легитимный путь — только триггер `sync_project_upvotes`, который ставит транзакционный флаг `app.upvote_sync` |
| SEC-11 | Можно было менять `created_at`, `author_id`, поля комментариев | Те же поля закрыты в триггере; добавлен триггер `trg_protect_comments` (`project_id`/`author_id`/`created_at`/`status`) |
| SEC-03 | `REVOKE` был только у `anon`/`authenticated`, право через `PUBLIC` оставалось | `revoke ... from public, anon, authenticated`; `array_elems_fit` получил `search_path=''` |
| SEC-04 | Bucket `covers` без лимитов | `file_size_limit=10MB`, `allowed_mime_types` = jpeg/png/webp |
| SEC-18 | Аноним мог листить объекты bucket | Снята broad SELECT-политика `covers_read` (публичные URL работают без неё; клиент листинг не использует — только `upload`/`remove`/`getPublicUrl`) |

**Проверено:** rolled-back тест на живой базе — накрутка `upvotes` отбита
(`upvotes can only be changed via project_upvotes`), обычное редактирование
работает. Supabase security advisors: **18 → 3**.

Оставшиеся 3 advisor-warning — не дыры: `is_admin()` доступна `anon`/`authenticated`
**намеренно** (вызывается в RLS-политиках, revoke их сломает) ×2, и
leaked-password (см. Важные факты, п.3).

### Во фронтенде (задеплоено, коммит `dd1db44`)

| ID | Что сделано |
|---|---|
| SEC-07 | Supabase JS **вендорен локально**: `js/vendor/supabase-js@2.110.3.mjs` (самодостаточный bundle). Плавающий `esm.sh/@supabase/supabase-js@2` убран — компрометация CDN больше не даёт доступ к сессиям |
| SEC-06 | CSP + `Referrer-Policy` meta на всех 18 страницах. `script-src 'self'` **без** `unsafe-inline` — для этого 11 одинаковых инлайн-скриптов вынесены в `js/header-scroll.js` |
| SEC-16 | `scripts/security-check.mjs` расширен: атаки на `upvotes`, `created_at`, анонимный листинг storage |

### На VPS (сессия 2026-07-14, вечер)

| ID | Что было | Как закрыто |
|---|---|---|
| SEC-09 | `sshd -T` → `passwordauthentication yes` (`50-cloud-init.conf` перебивал `99-hardening.conf`); fail2ban отсутствовал | Создан `/etc/ssh/sshd_config.d/00-hardening.conf` (сортируется раньше cloud-init): `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `KbdInteractiveAuthentication no`. Проверено `sshd -T` + новая ключевая сессия. Установлен fail2ban (jail `sshd`, systemd-backend, 5 попыток/10 мин → бан 1 ч) |
| SEC-08 | Устаревшие контейнеры (Trivy: 14 Critical / 277 High) | Обновлены: Caddy 2.10.0→2.11.4, Kong 3.9.1→3.9.3, GoTrue v2.189.0→v2.193.0, PostgREST v14.12→v14.15, storage-api v1.60.4→v1.66.2, imgproxy v3.30.1→v3.31.4, node 22.17.0→22.23.1, supabase/postgres 17.6.1.136→.144 (тот же PG 17.6). Umami 2.20.2 и postgres-meta v0.96.6 уже последние. Все образы закреплены `tag@digest` в `infra/docker-compose.yml` (репо = сервер). Проверено: все контейнеры healthy, `auth/rest/storage` через `api.wedesignerz.com` → 200, mail-bridge жив |
| SEC-12 | Self-hosted БД не получила миграцию аудита | `supabase/migrations/2026-07-14-security-audit-p0p1.sql` применена к self-hosted (psql в `vibeclub-db`, одна транзакция). Проверено: `trg_protect_comments` есть, bucket `covers` = 10MB + mime-лимиты, политика `covers_read` снята |

### SEC-01 — GitHub-токен (был P0)

Закрыт полностью. Токен `wedeignerz.com` (scopes `repo, workflow`) отозван Тёмой.
Remote переведён на чистый `https://github.com/androsovtema/VibeClub.git`.
**Доступ к push теперь через `gh` CLI** — токен в macOS keyring, не в файлах
(`gh auth setup-git` настроен). Секретов в `.git/config` нет.

---

## Открыто

### 🟡 Приоритет 2

- **SEC-10 — капча.** Код готов и задеплоен (`js/captcha.js`, Turnstile,
  site key `0x4AAAAAAD1s8mvl49yX42qW`, режим `interaction-only` — невидимая).
  Подключена к signup / signin / magic-link / reset в `js/auth.js`; сбой капчи
  возвращается как `{data, error}` с кодом `captcha_failed`, формы не виснут.
  **Переключатель в Supabase ВЫКЛЮЧЕН намеренно.**
  🚧 **Блокер:** на `androsovtema.github.io` Turnstile отдаёт ошибку **110200**
  (домен не разрешён) даже после добавления хоста — `github.io` в Public Suffix List.
  → Капча заработает после переезда на `wedesignerz.com`. **Включать переключатель
  только после того, как я проверю получение токена на живом сайте** — иначе
  `captcha_failed` мгновенно ломает вход всем.
- **SEC-05 — анонимный feedback.** `feedback_insert_anyone` пускает `anon`;
  honeypot и cooldown только в JS (`js/ui/feedbackModal.js`), прямой REST их обходит.
  Временная мера: разрешить feedback только авторизованным.

### 🟢 Приоритет 3

SEC-13 (бэкапы в S3 без клиентского шифрования), SEC-14 (нет `cap_drop`/`read_only`),
SEC-15 (actions не закреплены по SHA), SEC-19 (внешний `avatar_url` → tracking pixel;
`js/profile.js:70`, `members.js:30`, `project.js:444` пишут его прямо в `img.src` —
ограничение сломает текущие аватары, нужен продуктовый разбор), SEC-20 (perf RLS),
SEC-21 (eslint 9 vs eslint-config-standard, `ERESOLVE`), SEC-22 (публичность контактов).

---

## Решения, принятые осознанно (не переоткрывать)

- **Passkeys — не включаем.** В доках Supabase помечены как experimental
  («API может измениться без предупреждения»), дыр из аудита не закрывают.
- **Leaked-password protection — ждём** (нужен Pro / переезд на self-hosted).
- **`is_admin()` остаётся доступной `anon`/`authenticated`** — используется в RLS.

---

## Что делать в новой сессии

1. Прочитать этот файл и `08-workflow.md`.
2. Сервер захарден (SEC-09/08/12 закрыты). Следующее по приоритету — SEC-10
   (домен/капча) и SEC-05 (анонимный feedback, нужно решение Тёмы).
3. Если тема — домен: решить вопрос переезда клуба на `wedesignerz.com`,
   после переезда включить капчу (проверить токен → включить переключатель).
4. Проверка защиты БД: `npm run security-check <email> <пароль>` — учётка нужна
   **обычная** (`member`), не админская.
5. `npm run check` — линтеры перед любым коммитом.
