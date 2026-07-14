# T-CUTOVER-01 — подготовка репозитория к безопасному cutover

> **Статус: выполнено 2026-07-14. Не запускать повторно.** После проверки
> выяснилось, что cloud уже требует 12 символов, поэтому финальная реализация
> выровнена на 12 вместо первоначально указанных ниже 8.

Ты — Terra, исполнитель инфраструктурной задачи в проекте We Designerz.
Работай в текущем репозитории. Общайся с пользователем по-русски.

## Сначала прочитай

1. `AGENTS.md` и `CLAUDE.md`.
2. `docs/08-workflow.md`.
3. Задачу **T-CUTOVER** в `docs/04-tasks-sonnet.md`.
4. Шаги 3.5, 7, 8 и 8.1 в `infra/RUNBOOK.md`.
5. `docs/16-security-status.md`.

В рабочем дереве уже могут лежать незакоммиченные правки документации Claude/
Codex. Это изменения владельца: **не сбрасывай, не stash'ь, не переписывай и
не включай их случайно в свой scope**. Перед работой покажи `git status --short`
и отделяй собственный diff по файлам.

## Цель этого этапа

Подготовить код и конфиги репозитория так, чтобы позже Тёма мог безопасно
выполнить миграцию по runbook. На этом этапе текущий прод продолжает работать
с Supabase Cloud.

## Сделай

### 1. CSP на всех 18 HTML-страницах

Найди страницы командой `rg -l "Content-Security-Policy" --glob '*.html'`.
Их должно быть 18.

- В `connect-src` каждой страницы добавь:
  `https://api.wedesignerz.com`, `wss://api.wedesignerz.com`,
  `https://stats.wedesignerz.com`.
- В `script-src` добавь `https://stats.wedesignerz.com`.
- **Не удаляй** пока `https://ndhyvspgkelxgqmfmmry.supabase.co` и его `wss`:
  старый backend нужен текущему проду до cutover.
- Не добавляй `cloud.umami.is`: T19 оживёт после переключения на self-hosted
  Umami в отдельном cutover-коммите.
- Не ослабляй остальные директивы (`default-src`, `object-src`, `frame-ancestors`
  и т. п.).

Добавь небольшой автоматический статический check в `scripts/`, который
падает, если HTML-страниц с CSP не 18 или хотя бы на одной нет обязательных
cloud + self-host источников. Подключи его отдельным npm-script и в общий
`npm run check`, чтобы будущая новая страница не создала тихий runtime-регресс.

### 2. GoTrue self-hosted

В `infra/docker-compose.yml`, сервис `auth`, добавь:

```yaml
GOTRUE_SECURITY_CAPTCHA_ENABLED: "true"
GOTRUE_SECURITY_CAPTCHA_PROVIDER: turnstile
GOTRUE_SECURITY_CAPTCHA_SECRET: ${CAPTCHA_SECRET}
GOTRUE_PASSWORD_MIN_LENGTH: "12"
```

В `infra/.env.example`:

- замени `SITE_URL` на `https://wedesignerz.com`;
- добавь пустой `CAPTCHA_SECRET=` с комментарием, что это секрет Cloudflare
  Turnstile и он не коммитится заполненным.

Не читай и не показывай значения из `infra/.env`. Если для проверки compose
достаточно существующего файла — запускай только `docker compose config -q`,
без вывода раскрытого конфига.

### 3. Пароль минимум 12 на фронте

В `js/ui/authModal.js` добавь единый минимум 12 в поля нового пароля:
регистрация, reset и подтверждение reset. Поле обычного входа не ограничивай:
старый пользователь должен иметь возможность попытаться войти старым паролем.

Добавь явную JS-проверку длины при регистрации и reset, чтобы сообщение было
понятным, а не зависело только от браузера/GoTrue. Текст проведи через текущую
i18n-систему; обнови все реально поддерживаемые локали. Не хардкодь русский
текст в бизнес-логике.

В `package.json` обнови устаревшую финальную подсказку `npm run check`: при
включённой CAPTCHA security-check запускается через `WDZ_TEST_JWT`, а не через
`<email> <пароль>`. Сам токен в package.json, файлы и отчёт не вставлять.

### 4. Почтовые шаблоны

Проверь `infra/mail-templates/*.html`: убери TODO/служебные комментарии из
продовых шаблонов, сохрани рабочие переменные GoTrue/mail-bridge и убедись, что
confirmation, recovery и email change объясняют действие и бренд We Designerz.
Не подставляй тестовые email, токены или абсолютные секретные ссылки.

## Жёсткие границы

- Не меняй `js/config.js`: backend и Umami пока остаются cloud.
- Не выполняй шаги 4–9 runbook, не подключайся к VPS, не мигрируй данные.
- Не меняй БД, миграции, RLS и содержимое `infra/.env`.
- Не удаляй старые cloud-hosts из CSP.
- Не трогай `robots.txt`, sitemap и индексацию.
- Не делай commit, push, deploy или PR без отдельной просьбы пользователя.
- Не бери T-CONSENT и T-IMG: это следующие отдельные задачи.

## Проверка

1. `npm run check` — зелёный, включая новый CSP-check.
2. `rg -l "Content-Security-Policy" --glob '*.html' | wc -l` → 18.
3. Автоматически докажи, что все 18 CSP содержат старый cloud, новый API и
   self-hosted stats в нужных директивах.
4. `cd infra && docker compose config -q` — зелёный; не печатай раскрытый
   compose и секреты.
5. Через `python3 -m http.server 8080` проверь минимум главную, auth-модалку и
   reset-состояние на desktop и 375px. Текущий cloud login/signup не должны
   сломаться; ошибок CSP для Supabase/Turnstile в консоли нет.
6. Проверь `git diff --check`.

## Отчёт пользователю

Коротко по-русски:

- какие файлы и поведение изменены;
- результаты каждой проверки;
- что ты сознательно не делал (VPS, миграция, переключение, deploy);
- точный список ручных действий Тёмы, если что-то нельзя проверить без
  Turnstile secret или внешнего кабинета;
- `git status --short`, отдельно указав, какие изменения были до твоей работы.
