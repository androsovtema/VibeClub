# T-RKN-CAPTCHA-BRIDGE — launch-critical мост SmartCaptcha для ChatGPT 5.6 Terra High

Ты — ChatGPT 5.6 Terra High, исполнитель production-critical задачи We Designerz.
Работай в текущем репозитории. Общайся по-русски. Цель — за один проход
подготовить минимальную безопасную реализацию, которую Opus после ревью сможет
синхронно выкатить в production. Сам **не делай commit, push, deploy и SSH**.

## Срочный продуктовый контекст

Сайт должен принимать новых пользователей в ближайшие часы. Сейчас production
работает: GoTrue `v2.193.0`, CAPTCHA provider `turnstile`, `auth` и `mail-bridge`
healthy. В `/root/vibeclub/.env` на VPS уже есть оба секрета:

- `CAPTCHA_SECRET` — текущий Turnstile secret;
- `SMARTCAPTCHA_SERVER_KEY` — новый серверный ключ Яндекса.

Sonnet уже подготовил незакоммиченный фронтовый diff: `js/captcha.js`, CSP всех
18 HTML и комментарий в `styles.css`. SmartCaptcha на localhost выдаёт токен,
но GoTrue отклоняет его, потому что штатно поддерживает только hCaptcha и
Turnstile. Этот diff нужно **сохранить и доработать**, не переписывая заново.

Нужен обязательный внутренний gateway `captcha-bridge` перед GoTrue. Он сам
валидирует CAPTCHA, а GoTrue после переключения работает с встроенной CAPTCHA,
выключенной. Kong остаётся единственной внешней точкой входа; прямого
публичного доступа к `auth` или bridge нет.

## Сначала прочитай

1. `AGENTS.md`, `CLAUDE.md`, `docs/08-workflow.md`.
2. `docs/19-rkn-submission.md`, секцию `T-RKN-CAPTCHA`.
3. `docs/prompts/T-RKN-CAPTCHA-sonnet.md`.
4. Текущие `js/captcha.js`, `js/auth.js`, `scripts/check-csp.mjs`.
5. `infra/docker-compose.yml`, `infra/volumes/api/kong.yml`,
   `infra/volumes/api/kong-entrypoint.sh`.
6. `infra/mail-bridge/server.mjs` как локальный образец Node-сервиса без
   npm-зависимостей.

Сначала покажи `git status --short`. В дереве есть чужой untracked-файл
`docs/prompts/T-AUTH-UX2-review-fix-sonnet.md`; не изменяй и не включай его в
scope.

## Неподвижные архитектурные условия

1. Нельзя просто проверить SmartCaptcha, а затем оставить Turnstile-проверку
   GoTrue: Smart-токен одноразовый, схемы провайдеров различаются.
2. Сначала Kong должен направлять secure Auth route в healthy bridge; только в
   этом же изменении `GOTRUE_SECURITY_CAPTCHA_ENABLED` становится `false`.
3. Open Auth routes (`/verify`, `/callback`, `/authorize`, `/.well-known/jwks`)
   остаются напрямую на GoTrue.
4. Refresh-token, PKCE и id-token flows не требуют CAPTCHA — повтори поведение
   GoTrue `v2.193.0`. Иначе действующие сессии перестанут обновляться.
5. Никаких `service_role`, JWT, CAPTCHA-токенов, IP, email, паролей или body в
   логах.
6. Любая ошибка/таймаут провайдера = fail closed. Никаких «при ошибке считать
   CAPTCHA успешной».
7. Только stdlib Node 22, без новых npm production-зависимостей.

## Что реализовать

### 1. Dual-mode токен на фронте

В `js/captcha.js` сохрани публичный контракт `getCaptchaToken(): Promise<string>`,
но успешный SmartCaptcha-токен возвращай как `smart:<raw-token>`. Сам raw-токен
не логировать и нигде не сохранять. Это маршрутизирующий envelope для bridge.

Старый закэшированный Turnstile-фронт продолжит присылать токен без префикса.
Bridge временно принимает оба формата:

- `smart:*` → снять префикс и проверить только в Яндексе;
- без префикса → проверить только в Turnstile.

Никогда не отправляй Smart-токен в Cloudflare и наоборот. Обнови неверный
комментарий в `js/captcha.js`: токен проверяет `captcha-bridge`, не GoTrue.
В `js/auth.js` разрешена только замена устаревшего слова `Turnstile` в
комментарии на нейтральное `CAPTCHA`; функциональный код не менять.

### 2. `infra/captcha-bridge/server.mjs`

Создай внутренний HTTP gateway без npm-зависимостей.

Обязательные env:

- `SMARTCAPTCHA_SERVER_KEY`;
- `CAPTCHA_SECRET`;
- `AUTH_UPSTREAM_URL` (production: `http://auth:9999`);
- `SMARTCAPTCHA_ALLOWED_HOSTS` (CSV; production минимум
  `wedesignerz.com,localhost,localhost:8080`).

Опциональные:

- `PORT`, default `9997`;
- `CAPTCHA_VERIFY_TIMEOUT_MS`, разумный default 5000–8000;
- provider URLs только для тестов, с безопасными production defaults:
  `https://smartcaptcha.cloud.yandex.ru/validate` и
  `https://challenges.cloudflare.com/turnstile/v0/siteverify`.

Требования:

- `GET /health` → 200 без обращения к провайдерам/upstream;
- ограничение body не больше 256 KiB;
- сохранить raw body для неизменного проксирования в GoTrue;
- понимать JSON и `application/x-www-form-urlencoded` при извлечении
  `gotrue_meta_security.captcha_token`;
- путь/query, метод, допустимые заголовки, upstream status/body/headers
  проксировать прозрачно; не проксировать hop-by-hop headers и пересчитать
  `content-length`;
- корректно передавать несколько `set-cookie`, если upstream их вернул;
- клиентский IP брать только из уже поставленных trusted proxy headers,
  использовать первый адрес `X-Forwarded-For`; не логировать его;
- ответ при CAPTCHA failure совместим с фронтом/GoTrue: HTTP 400,
  `error_code: "captcha_failed"`, без provider message/token;
- provider timeout/network/malformed response также не пропускают запрос.

SmartCaptcha verification:

- POST `application/x-www-form-urlencoded`;
- поля `secret`, `token`, `ip`;
- успех только HTTP 200 + JSON `status === "ok"` + `host` входит в
  `SMARTCAPTCHA_ALLOWED_HOSTS`;
- пустой/неожиданный `host` отклонять.

Turnstile verification:

- POST `application/x-www-form-urlencoded`;
- поля `secret`, `response`, `remoteip`;
- успех только HTTP 200 + JSON `success === true`.

### 3. Точная матрица CAPTCHA routes GoTrue v2.193.0

Требовать CAPTCHA только для POST:

- `/signup`;
- `/recover`;
- `/resend`;
- `/magiclink`;
- `/otp`;
- `/token`, кроме `grant_type=refresh_token|pkce|id_token`;
- `/passkeys/authentication/options`;
- `/sso` и `/sso/`.

Все остальные маршруты bridge прозрачно проксирует без CAPTCHA. Это важно для
`/user`, logout, verify, session refresh и admin API. Матрицу вынеси в чистую
функцию и покрой тестами.

### 4. Тесты

Создай `infra/captcha-bridge/server.test.mjs` на `node:test` с локальными fake
provider/upstream серверами. Никаких реальных запросов к Яндексу/Cloudflare.

Минимальные тесты:

1. health;
2. route matrix, включая bypass refresh_token/PKCE/id_token;
3. protected route без токена → 400 и upstream не вызван;
4. `smart:` вызывает только Yandex fake, снимает префикс и после успеха ровно
   один раз вызывает upstream;
5. raw token вызывает только Turnstile fake;
6. invalid/status failed/host mismatch/malformed JSON/timeout → fail closed;
7. unprotected route проксируется без provider call;
8. upstream status/body/ключевые headers сохраняются;
9. oversized body → 413;
10. в логах теста нет токенов/body/PII.

Добавь `test:captcha-bridge` в `package.json` и включи его в `npm run check`.

### 5. Compose и Kong

В `infra/docker-compose.yml`:

- добавь сервис `captcha-bridge` на том же pinned
  `node:22.23.1-alpine@sha256:...`, что `mail-bridge`;
- bind-mount `./captcha-bridge/server.mjs:/app/server.mjs:ro,z`;
- внутренний порт, без `ports:`;
- healthcheck `/health`;
- env из списка выше;
- `depends_on: auth: condition: service_healthy`;
- для `auth` поставь `GOTRUE_SECURITY_CAPTCHA_ENABLED: "false"`, но временно
  сохрани provider/secret строки рядом для быстрого rollback;
- Kong должен стартовать после healthy `captcha-bridge`.

В `infra/volumes/api/kong.yml` измени только secure Auth service upstream:

- было `http://auth:9999/`;
- станет `http://captcha-bridge:9997/`.

Open Auth services оставь прямыми на `auth:9999`.

Добавь новые переменные с пустыми/безопасными placeholders в
`infra/.env.example`. Реальные секреты в Git не добавлять.

### 6. CSP gate и минимальный runbook

Усиль `scripts/check-csp.mjs`:

- SmartCaptcha обязана быть в `script-src`, `connect-src`, `frame-src`;
- `https://challenges.cloudflare.com` запрещён во всех 18 HTML;
- полная CSP должна быть идентичной во всех 18 HTML;
- сообщение больше не должно утверждать только абстрактные cloud sources.

В `infra/RUNBOOK.md` добавь короткую секцию T-RKN-CAPTCHA-BRIDGE:

- preflight;
- порядок `auth → captcha-bridge → kong`/`docker compose up -d`;
- health и aggregate-only проверки;
- dual-mode acceptance;
- точный rollback: вернуть Kong на `auth:9999`, CAPTCHA GoTrue на `true`,
  пересоздать `auth`+`kong`, затем откатить frontend на Turnstile;
- не печатать секреты/PII.

Не отмечай `T-RKN-CAPTCHA` закрытой и не обновляй launch/legal status: это
делается только после live acceptance.

## Разрешённые файлы

- `js/captcha.js`;
- `js/auth.js` — только комментарий;
- `scripts/check-csp.mjs`;
- `package.json`;
- `infra/captcha-bridge/server.mjs`;
- `infra/captcha-bridge/server.test.mjs`;
- `infra/docker-compose.yml`;
- `infra/volumes/api/kong.yml`;
- `infra/.env.example`;
- `infra/RUNBOOK.md`.

Не меняй остальные HTML/CSS сверх уже существующего Sonnet diff. Если тест
показывает, что текущий фронтовый код имеет реальный blocker, остановись и
опиши его, не расширяй scope самовольно.

## Проверки

Выполни:

```bash
node --test infra/captcha-bridge/server.test.mjs
node --check infra/captcha-bridge/server.mjs
docker compose --env-file infra/.env.example -f infra/docker-compose.yml config
npm run check
git diff --check
git status --short
git diff --stat
```

Если `docker compose config` не может пройти на placeholders из-за старых
обязательных env проекта, создай временный env только вне репозитория или
объясни точную причину; секреты не выводи.

## Stop conditions

Остановись и отчитай, если:

- refresh/session flow начинает требовать CAPTCHA;
- protected route может обойти bridge через публичный Kong route;
- для запуска требуется service_role на фронте;
- Smart-токен хоть в одной ветке отправляется в Cloudflare;
- тесты требуют реальные секреты или внешние CAPTCHA-запросы;
- обнаружен чужой конфликтующий diff.

## Финальный отчёт

Коротко по-русски:

1. изменённые файлы;
2. как обеспечен dual-mode и отсутствие простоя;
3. route matrix и refresh bypass;
4. результаты всех тестов;
5. что остаётся Opus для production deploy и live acceptance;
6. подтверждение: commit/push/deploy/SSH не делались.
