# T-RKN-CAPTCHA (фронт) — Cloudflare Turnstile → Yandex SmartCaptcha

Ты — Sonnet, исполнитель задачи We Designerz. Работай в текущем репозитории.
Общайся с пользователем по-русски.

## Зачем

Подача РКН по пути B (`docs/19-rkn-submission.md`): убираем последнюю
иностранную браузерную зависимость — Cloudflare Turnstile. Замена — Yandex
SmartCaptcha (капча создана, хосты `wedesignerz.com` + `localhost`).

Это **только фронтовая половина** задачи. Серверную проверку токена на VPS
делает владелец/Opus отдельно. Поэтому: после твоих правок регистрация
**против живого бэкенда работать не будет** (бэкенд пока ждёт
Turnstile-токены) — это ожидаемо и не является багом твоей части.
**Commit, push, deploy не делать** — выкатка строго синхронно с бэкендом.

## Контекст и границы

- Сначала покажи `git status --short`; чужие изменения не включай в scope.
- Не меняй `js/auth.js` (интерфейс `getCaptchaToken()` сохраняется),
  `js/config.js`, `robots.txt`, `infra/`, `supabase/`, серверные конфиги.
- Инлайновых `<script>` не заводить (CSP `script-src 'self'`).

## Сначала прочитай

1. `AGENTS.md`, `CLAUDE.md`, `docs/08-workflow.md`.
2. Раздел «T-RKN-CAPTCHA» в `docs/19-rkn-submission.md`.
3. Текущий `js/captcha.js` целиком — сохраняем его контракт и паттерн
   «свежий виджет на каждый Auth-запрос».
4. Официальную доку SmartCaptcha: методы `window.smartCaptcha.render /
   execute / subscribe / reset / destroy`, режим invisible, параметры
   `sitekey`, `invisible`, `shieldPosition`, `hl`, колбэки `success`,
   `token-expired`, `network-error`, `javascript-error`,
   `challenge-visible`, `challenge-hidden`.

## Что сделать

### 1. Переписать `js/captcha.js` на SmartCaptcha

- `SITE_KEY = 'ysc1_3IEnmBJ5FxKEBWM2bhCbKoyxliT6JggB1KvQkQDF4c168c4e'`
  (публичный по дизайну, как и у Turnstile).
- `SCRIPT_URL = 'https://smartcaptcha.yandexcloud.net/captcha.js'` —
  та же ленивоя загрузка скрипта один раз, что сейчас.
- Экспорт остаётся один: `getCaptchaToken(): Promise<string>` — auth.js не
  должен измениться ни на строку.
- Паттерн тот же: на каждый вызов — новый скрытый контейнер в `body`,
  `smartCaptcha.render(host, { sitekey, invisible: true, hl: 'ru',
  shieldPosition: 'bottom-right', callback: ... })`, затем
  `smartCaptcha.execute(widgetId)`; после результата — `destroy(widgetId)`
  и удаление контейнера. Shield (уведомление об обработке данных Яндексом)
  **не скрывать** — это юридическое уведомление.
- Таймауты — важное отличие от Turnstile: пазл человек решает долго.
  Логика: стартовый таймаут 30 с; подпиской на `challenge-visible`
  таймаут отменяется (человек решает — не обрубать); `challenge-hidden`
  без полученного токена = человек закрыл челлендж → reject
  `captcha_cancelled`. `token-expired` → reject `captcha_expired`;
  `network-error`/`javascript-error` → reject `captcha_error`. Сообщения об
  ошибках для пользователя в auth.js уже есть — коды ошибок сохрани
  совместимыми с текущими (`captcha_error`, `captcha_expired`,
  `captcha_timeout`), новый `captcha_cancelled` обработай так же, как
  `captcha_error`, если в auth.js нет отдельной ветки.
- Комментарий в шапке файла обнови: SmartCaptcha, зачем invisible, почему
  токен одноразовый.

### 2. CSP во всех 18 HTML

В CSP-meta каждой страницы (корень + `projects/`):

- `script-src`: `https://challenges.cloudflare.com` →
  `https://smartcaptcha.yandexcloud.net`;
- `frame-src`: `https://challenges.cloudflare.com` →
  `https://smartcaptcha.yandexcloud.net`;
- `connect-src`: убрать `https://challenges.cloudflare.com`, добавить
  `https://smartcaptcha.yandexcloud.net`.

Затем **проверь фактические хосты** виджета в DevTools → Network: если
captcha.js тянет что-то ещё с других яндексовых доменов (стили, картинки
пазла) — добавь эти хосты в соответствующие директивы точечно и зафиксируй
список в отчёте. `img-src` сейчас без яндексовых хостов — если картинки
задания идут с отдельного домена, его придётся добавить в `img-src`.
Строка CSP обязана быть идентичной во всех 18 файлах.

### 3. Стили при необходимости

Если скрытому контейнеру нужен класс — используй существующий
`.captcha-host` в `styles.css`, не плоди новые. Проверь, что invisible-режим
не оставляет видимых артефактов на странице (кроме shield справа внизу во
время challenge-флоу).

## Проверка (localhost:8080)

- `python3 -m http.server 8080` → `index.html` → «Вступить» → вкладка
  «Вступить», заполни форму мусорными данными и отправь: виджет должен
  запуститься invisible (host `localhost` разрешён в консоли Яндекса).
  Ожидаемо: токен выдан, запрос к бэкенду уйдёт и **упадёт** на серверной
  проверке — это норма до синхронной выкатки бэкенда. Главное: в Network
  токен-флоу SmartCaptcha прошёл, к `challenges.cloudflare.com` запросов
  **ноль**.
- Консоль: без CSP-violation на всех проверенных страницах
  (`index`, `projects`, `project.html?id=…`, `about`, `privacy`).
- Слово `cloudflare` в grep по репо остаётся только в
  `docs/`/`audits/` (история) — в коде и HTML его быть не должно.
- 375px: модалка и shield не ломают вёрстку.
- `npm run check` зелёный (если `scripts/check-csp.mjs` проверяет CSP-строку
  с cloudflare-хостом — обнови ожидание в нём в этом же изменении),
  `git diff --check` чистый.

## Критерии приёмки (из docs/19, фронтовая часть)

- Запросов к Cloudflare нет ни на одной странице.
- SmartCaptcha invisible выдаёт токен на localhost.
- `getCaptchaToken()` контракт не изменён, auth.js не тронут.
- `npm run check` зелёный.

## Финальный отчёт

Изменённые файлы, фактический список яндексовых хостов в CSP (по Network),
как вёл себя invisible-флоу (был ли challenge), что осталось до выкатки
(бэкенд-мост + синхронный deploy — делает владелец/Opus).
