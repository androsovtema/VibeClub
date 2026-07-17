# 16 — Статус безопасности (актуально на 2026-07-15)

**Точка входа для новой сессии.** Здесь — что уже закрыто, что открыто, и что
можно трогать без спроса. Первоисточник находок — `audits/current-review/2026-07-14-security-audit.md`
(аудит проверен вручную: находки достоверны, но одна ошибка — см. «Важные факты», п.1).

## TL;DR

Дыры, позволявшие портить данные, **закрыты и работают на живой базе**.
Сервер VPS захарден (2026-07-14, вечер): парольный SSH выключен и проверен через
`sshd -T`, стоит fail2ban, контейнеры обновлены и закреплены по digest,
миграция применена и к self-hosted БД (SEC-09, SEC-08, SEC-12 закрыты).
Тем же вечером: **клуб переехал на `wedesignerz.com`**, SEC-05 закрыт (feedback
только авторизованным), вендорный Supabase-bundle пересобран (был нерабочим).
Капча в cloud: включена и принуждается, Auth URL Configuration обновлена —
**SEC-10 закрыт** (детали ниже). На self-hosted серверная CAPTCHA, prod
`SITE_URL` и пароль минимум 12 применены 2026-07-14; Auth/mail-bridge healthy,
запрос без CAPTCHA отбивается. T-LOC/T-CUTOVER закрыты 2026-07-15: production
переключён на self-host Supabase и Umami, полный e2e и `security-check`
зелёные. Финальный backup восстановлен в отдельных временных БД,
Storage-архив прочитан; cron/watchdog, три Timeweb-монитора и дисковые
email-алерты настроены. Cloud sign ups выключены, self-host sign ups включены.
Отчёт: `docs/reports/T-CUTOVER-02-freeze-report.md`.

---

## Важные факты (без них новая сессия сделает неверные выводы)

1. **`wedesignerz.com` — теперь ЭТОТ проект (переезд выполнен 2026-07-14).**
   Custom domain переставлен с репо `androsovtema/wdcom` (старый портфолио,
   больше не на домене) на `androsovtema/VibeClub`. DNS не менялся (apex уже
   указывал на GitHub Pages, www — CNAME на `androsovtema.github.io`).
   Старый адрес `https://androsovtema.github.io/VibeClub/` отдаёт 301 на
   `https://wedesignerz.com/`. Cert approved, HSTS работает. Проверять правки —
   на `wedesignerz.com`.

2. **Production Supabase — self-hosted на `api.wedesignerz.com`.** Старый
   cloud-проект `VibeClub` (`ndhyvspgkelxgqmfmmry`, free) сохранён как
   источник для контролируемого слияния/восстановления с выключенными sign ups,
   а не как готовый failover. Новые миграции применять к self-host; не
   синхронизировать cloud автоматически. После появления новых self-host записей
   простого rollback на cloud нет.

3. Историческое ограничение leaked-password protection относилось к cloud
   тарифу free. Актуальную self-host настройку проверять отдельно; не считать
   её включённой только из факта переезда.

---

## Закрыто и проверено

### В схеме и обеих базах (первичная проверка cloud 2026-07-14)

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
| T-CUTOVER preflight | Self-hosted Auth не проверял CAPTCHA, SITE_URL был не prod, политика пароля могла расходиться с cloud | На VPS применены Turnstile, `SITE_URL=https://wedesignerz.com` и минимум 12 (совпадает с cloud). Compose валиден, Auth/mail-bridge healthy, health с anon key → 200, signup без CAPTCHA → `captcha_failed` |

### Сессия 2026-07-14, вечер — SEC-05, домен, починка вендора

| ID | Что было | Как закрыто |
|---|---|---|
| SEC-05 | `feedback_insert_anyone` пускала `anon` — спам прямым REST в обход JS-honeypot | Политика заменена на `feedback_insert_auth` (`to authenticated`, `user_id = auth.uid()`). Применено к **обеим** базам (cloud `apply_migration` + self-hosted psql), проверено: аноним → 401. Миграция: `supabase/migrations/2026-07-14-sec-05-feedback-authenticated.sql`. Фронт: модалка гостю показывает «войди» + кнопку входа (`js/ui/feedbackModal.js`), `security-check.mjs` — атака 6 |
| SEC-07 (регресс) | **Вендорный bundle с `dd1db44` был нерабочим**: esm.sh-сборка импортирует `/node/process.mjs`, `/node/buffer.mjs` — на нашем хосте 404, все Supabase-фичи на живом сайте падали | Bundle пересобран **esbuild'ом** в самодостаточный ESM (без внешних импортов), проверен в браузере живым запросом к cloud-базе. **Обновление версии — только esbuild-сборкой, esm.sh не годится** (кладёт абсолютные импорты полифиллов) |
| SEC-10 (частично) | Turnstile 110200 на github.io (Public Suffix List) | Клуб переехал на `wedesignerz.com` (custom domain переставлен wdcom → VibeClub, DNS не менялся, 301 со старого адреса). Токен Turnstile на живом домене **получается**. Переключатель включён Тёмой в тот же день, принуждение проверено с обеих сторон — **SEC-10 закрыт** |

### SEC-01 — GitHub-токен (был P0)

Закрыт полностью. Токен `wedeignerz.com` (scopes `repo, workflow`) отозван Тёмой.
Remote переведён на чистый `https://github.com/androsovtema/VibeClub.git`.
**Доступ к push теперь через `gh` CLI** — токен в macOS keyring, не в файлах
(`gh auth setup-git` настроен). Секретов в `.git/config` нет.

---

## Открыто

### 🟢 Стабилизационные follow-up после cutover

- **SEC-10 — ЗАКРЫТ в cloud и self-host (2026-07-14).** Тёма включил переключатель CAPTCHA и
  обновил Auth URL Configuration. Проверено живьём на `wedesignerz.com`:
  логин с токеном → `invalid_credentials` (запрос дошёл до GoTrue), прямой
  REST без токена → `captcha_failed`. Та же серверная проверка подтверждена
  на self-hosted до переноса данных.
  ⚠️ Следствие: `security-check.mjs` больше не может логиниться паролем —
  передавать готовый JWT: `WDZ_TEST_JWT=<access_token> node scripts/security-check.mjs`.
- Полный self-hosted e2e и `security-check` закрыты 2026-07-15.
- После согласованного стабилизационного окна удалить старый cloud Supabase
  host из CSP и требования `check:csp`.
- Перенести публичный anon key Auth-монитора Timeweb из query string в HTTP
  header `apikey`.
- Зелёное состояние мониторов и каналы уведомлений проверены, но намеренный
  просроченный backup marker/404-инцидент и доставка тестового алерта не
  моделировались. Провести отдельный операционный drill.

### 🟢 Приоритет 3

SEC-13 (бэкапы в S3 без клиентского шифрования), SEC-14 (нет `cap_drop`/`read_only`),
SEC-15 (actions не закреплены по SHA), SEC-19 (внешний `avatar_url` → tracking pixel;
`js/profile.js:70`, `members.js:30`, `project.js:444` пишут его прямо в `img.src` —
ограничение сломает текущие аватары, нужен продуктовый разбор), SEC-20 (perf RLS),
SEC-21 (eslint 9 vs eslint-config-standard, `ERESOLVE`), SEC-22 (публичность
контактов), SEC-23 (Pages run `29402539008` зелёный, но GitHub пометил Node 20
в `actions/checkout@v4`, `configure-pages@v5`, `deploy-pages@v4` и
`upload-artifact@v4` как deprecated и пока принудительно запускает их на Node
24; это не текущая поломка, обновить actions после выхода совместимых версий и
проверить deploy).

---

## Решения, принятые осознанно (не переоткрывать)

- **Passkeys — не включаем.** В доках Supabase помечены как experimental
  («API может измениться без предупреждения»), дыр из аудита не закрывают.
- **Leaked-password protection:** сначала проверить фактическую self-host
  настройку, затем отдельно решить включение; cloud-ограничение free больше не
  определяет production.
- **`is_admin()` остаётся доступной `anon`/`authenticated`** — используется в RLS.

---

## Что делать в новой сессии

1. Прочитать этот файл и `08-workflow.md`.
2. Сервер захарден (SEC-09/08/12 закрыты), домен переехал, SEC-05 закрыт.
3. T-LOC/T-CUTOVER закрыты; production использует self-host. T-CONSENT-02
   технически принят 2026-07-16: member JWT security-check, CAPTCHA+письмо и
   375 px зелёные; inventory не делал backfill/удалений. Сохраняемый legacy
   admin явно подтвердил v4 2026-07-17, coverage `1 current / 0 missing`,
   flash-fix живьём принят. **T-CONSENT-RECONSENT** ожидает только повторный
   security-check с обычным member JWT после live migration, затем уведомление РКН.
4. Не удалять служебные/тестовые аккаунты автоматически: перед любым удалением
   нужны отдельное решение Тёмы, проверка связанных данных и отзыв сессий.
5. `npm run check` — линтеры перед любым коммитом.
