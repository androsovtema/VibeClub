# CLAUDE.md — правила для этого проекта

## Язык общения

**Всегда отвечай пользователю на русском языке.** Не на украинском, не на английском.
Код, коммиты, имена файлов и переменных — на английском по стандарту. Но все объяснения,
анализ, планы и сообщения в чат — по-русски.

## О проекте

We Designerz — сайт, который переходит от «студии дизайна» к **сообществу вайбкодеров**
(людей, создающих продукты с ИИ без программистского бэкграунда). Полное видение и план —
в папке [docs/](docs/README.md). Читай их перед работой. Как устроена работа (роли Тёма /
Opus-«мозг» / Sonnet-исполнитель, цикл, где что лежит) — в [docs/08-workflow.md](docs/08-workflow.md),
начинай оттуда.

- `docs/00-vision.md` — позиционирование и цели.
- `docs/01-architecture.md` — стек (статика + Supabase на GitHub Pages), схема БД, RLS.
- `docs/02-information-architecture.md` — карта страниц.
- `docs/03-content.md` — тексты и тон.
- `docs/04-tasks-sonnet.md` — задачи реализации с критериями приёмки.
- `docs/05-launch.md` — сидинг и чек-лист запуска.
- `docs/06-design-direction.md` — новый визуал (направление A «Электрический холст»).
- `docs/07-supabase-setup.md` — настройка Supabase руками Тёмы.
- `docs/09-growth-plan.md` — продуктовый план роста (пулы P0/P1/P2).
- `docs/10-membership.md` — клуб, траектория участника, грейды.
- `docs/11-market-review.md` — рынок, конкуренты, стратегия экспансии.
- `docs/16-security-status.md` — **статус безопасности: что закрыто, что открыто.
  Читай перед любой работой по теме безопасности/инфраструктуры.**

Полный актуальный список — в `docs/README.md`.

## Где живёт сайт

**Клубный сайт из этого репо живёт на `https://wedesignerz.com`** (с 2026-07-14:
custom domain GitHub Pages переставлен со старого репо `androsovtema/wdcom` на
`androsovtema/VibeClub`). Старый адрес `androsovtema.github.io/VibeClub/` отдаёт
301 на домен. Проверять правки — на `wedesignerz.com`. История переезда —
`docs/16-security-status.md`.

## Технические правила

- Стек: статический HTML/CSS/JS, без фреймворка и сборки. Хостинг — GitHub Pages.
- Структура: HTML-страницы в корне и в `projects/`, все скрипты — в `js/`
  (включая `js/main.js`, общий для всех страниц), стили — `styles.css` + `css/tokens.css`.
  Новые скрипты класть только в `js/`, мусорные файлы в корне не заводить.
- Деплой публикует **только файлы сайта**: workflow `.github/workflows/deploy.yml`
  собирает `_site/` и исключает `docs/`, `audits/`, `supabase/`, `CLAUDE.md` и конфиги.
  Внутренние документы на публичный сайт попадать не должны — при добавлении новых
  служебных папок дополняй список исключений в workflow.
- Дизайн-токены — единый источник правды в `css/tokens.css` (`:root`), подключены через
  `@import` в `styles.css`. Новые цвета/размеры бери из токенов, не хардкодь.
- Шрифты: Onest (дисплей/текст) + JetBrains Mono (код/акценты). Cormorant Garamond убран.
- Логотип пока — текст «We Designerz» классом `.logo-text` в шрифте Onest (не SVG).
- Секреты Supabase: только публичный `anon`-ключ на фронте, `service_role` — никогда.
  Защита данных строится на RLS.
- **Supabase JS вендорен локально** (`js/vendor/supabase-js@2.110.3.mjs`). Не возвращай
  импорт с CDN (`esm.sh`) — это закрытая находка аудита SEC-07. Обновлять bundle —
  **только сборкой esbuild** (`esbuild entry.mjs --bundle --format=esm
  --platform=browser --minify`, entry: `export * from "@supabase/supabase-js"`).
  Скачанный с esm.sh файл НЕ годится: он содержит абсолютные импорты
  `/node/process.mjs`, `/node/buffer.mjs`, которые на нашем хосте дают 404 и
  ломают все Supabase-фичи (уже наступали). После пересборки — проверить живой
  запрос в браузере и `npm run security-check`.
- **RLS ограничивает строки, но не колонки.** Служебные поля (`upvotes`, `created_at`,
  `author_id`, `role`, `is_core`, `status`) стережёт триггер `protect_privileged_columns`.
  Добавляешь служебную колонку — добавь её в триггер и в `scripts/security-check.mjs`.
- **CSP: `script-src 'self'` без `unsafe-inline`.** Инлайновые `<script>` в HTML не заводить —
  выносить в `js/`. Новый внешний домен (скрипт/шрифт/api) требует правки CSP-meta
  во всех HTML, иначе браузер его молча заблокирует.
- **`display:flex`/`inline-flex`/`grid` перебивает атрибут `hidden`** (author-стили
  сильнее UA-правила `[hidden]{display:none}`). Любому новому классу с таким display,
  который скрывается через `hidden`, сразу добавляй явный гард
  `.класс[hidden] { display: none; }`. Этот баг ловили уже 4 раза (T4, T7, T-UX1).

## Локальный запуск

Сайт нужно открывать **через локальный сервер**, а не двойным кликом по файлу (`file://`)
и не через `npm run dev` (скрипта `dev` в package.json нет). Пример:

```
python3 -m http.server 8080
```

затем открыть `http://localhost:8080/index.html`.

## RU-VPS (T-LOC)

Бэкенд переехал на self-hosted Supabase 2026-07-15 (`infra/`, операции —
`infra/RUNBOOK.md`). Production API — `https://api.wedesignerz.com`; старый
cloud не является готовым rollback и не получает новые миграции автоматически.
Доступ к серверу: **`ssh vibeclub`** (алиас в `~/.ssh/config` этой машины,
ключевая аутентификация, пароль не нужен). Рабочая папка на сервере —
`/root/vibeclub`. Секреты — только в `/root/vibeclub/.env` на сервере;
`infra/.env` — локальный исходник до копирования. Оба файла не коммитить.
