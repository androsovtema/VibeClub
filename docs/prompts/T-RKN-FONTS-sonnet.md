# T-RKN-FONTS — self-host шрифтов (зачистка Google Fonts)

Ты — Sonnet, исполнитель задачи We Designerz. Работай в текущем репозитории.
Общайся с пользователем по-русски.

## Зачем

Готовим подачу уведомления РКН по пути B: «трансграничная передача не
осуществляется» (`docs/19-rkn-submission.md`). Для этого браузер посетителя не
должен обращаться к иностранным хостам. Сейчас все 18 HTML-страниц грузят
Onest и JetBrains Mono с `fonts.googleapis.com`/`fonts.gstatic.com` — это
надо заменить на шрифты из нашего репозитория. Видео-анонс уже вышел, окно
короткое — задача точечная, без рефакторингов вокруг.

## Контекст и границы

- **Не делай commit, push, deploy.** Не подключайся к VPS и production-БД.
- Не меняй `js/config.js`, `robots.txt`, домены Turnstile/Umami/API в CSP,
  `infra/`, `supabase/`.
- Сначала покажи `git status --short`. Чужие изменения не сбрасывай, не
  stash'ь и не включай в свой scope.
- Инлайновые `<script>`/новые внешние домены не заводить (CSP
  `script-src 'self'`, см. `CLAUDE.md`).

## Сначала прочитай

1. `AGENTS.md`, `CLAUDE.md`, `docs/08-workflow.md`.
2. Раздел «T-RKN-FONTS» в `docs/19-rkn-submission.md` — критерии приёмки.
3. `css/tokens.css` (переменные `--font-*`), голову `index.html`
   (preconnect + link на Google Fonts, CSP-meta).

## Что сделать

### 1. Скачать шрифты

- Наборы — паритет с текущей ссылкой Google Fonts, не сужать и не расширять:
  **Onest** 300/400/500/600/700/800, **JetBrains Mono** 400/500/600/700.
- Формат — только `woff2`. Субсеты: `latin`, `latin-ext`, `cyrillic`,
  `cyrillic-ext` (те, что Google реально отдаёт для этих семейств).
- Источник: CSS API Google Fonts (запросить `css2?family=...` с современным
  браузерным User-Agent, из ответа забрать URL `.woff2` и `unicode-range`
  каждого блока) либо google-webfonts-helper. Файлы положить в новую папку
  `fonts/` в корне с понятными именами вида
  `onest-400-cyrillic.woff2`, `jetbrains-mono-700-latin.woff2`.

### 2. Подключить локально

- Создать `css/fonts.css`: блоки `@font-face` — по одному на каждый файл, с
  тем же `unicode-range`, что отдал Google (иначе браузер будет качать все
  субсеты сразу). Везде `font-display: swap`. Пути — относительные
  (`../fonts/...`), без ведущего `/`: сайт должен работать и с корня домена,
  и на локальном сервере.
- Подключить через `@import` в начале `styles.css` рядом с существующим
  `@import` токенов. В HTML новых `<link>` не добавлять.

### 3. Зачистить все 18 HTML

В каждой странице (корень + `projects/*.html`):

- удалить `<link rel="preconnect" href="https://fonts.googleapis.com">`,
  `<link rel="preconnect" href="https://fonts.gstatic.com">` и
  `<link href="https://fonts.googleapis.com/css2?...">` вместе с комментарием
  «Google Fonts»;
- в CSP-meta: из `style-src` убрать `https://fonts.googleapis.com`, из
  `font-src` убрать `https://fonts.gstatic.com` (оставить `'self'`).
  Остальные источники CSP не трогать.

### 4. Проверить

- `python3 -m http.server 8080` → пройти минимум: `index.html`,
  `projects.html`, `project.html?id=<любой>`, `about.html`, `privacy.html`,
  auth-модалку. Onest и JetBrains Mono рендерятся (не системный fallback),
  кириллица и латиница целы, жирности различаются (300 vs 700 видно).
- В DevTools → Network: **ни одного запроса** к `fonts.googleapis.com`,
  `fonts.gstatic.com`, любым `*.google*`; шрифты идут с `localhost` из
  `fonts/`, консоль без CSP-ошибок.
- Проверить 375px (адаптив не должен измениться).
- `fonts/` не попадает под `.gitignore`; deploy-workflow собирает `_site/`
  по exclude-списку, папку отдельно добавлять не нужно — просто убедись, что
  она не в исключениях `.github/workflows/deploy.yml`.
- `npm run check` зелёный, `git diff --check` чистый.

## Критерии приёмки (из docs/19)

- На сайте нет запросов к `*.google*`.
- Шрифты рендерятся во всех весах, визуал не изменился.
- `npm run check` зелёный.

## Финальный отчёт

Список изменённых файлов, суммарный вес `fonts/` в КБ, скриншот главной,
подтверждение чистого Network и зелёного `npm run check`. Commit сделает
владелец после приёмки.
