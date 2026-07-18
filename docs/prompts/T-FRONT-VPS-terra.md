# T-FRONT-VPS — перенос статического origin на RU-VPS (ChatGPT 5.6 Terra High)

## Роль и режим

Ты — исполнитель **ChatGPT 5.6 Terra High**. Работаешь только в локальном
репозитории:

`/Users/prosto/Desktop/01_Work/Products/VibeClub`

Задача срочная, но production-безопасность важнее скорости. Выполни только
repo-prep и локальную верификацию. **Не подключайся к VPS, не меняй DNS, не
создавай GitHub secrets/environments, не запускай workflow, не делай commit,
push, deploy или cutover.** Эти шаги выполняет владелец/Opus после ревью.

Общайся и пиши отчёт по-русски. Код, имена файлов и переменных — по-английски.

## Обязательное чтение до изменений

1. `AGENTS.md`
2. `docs/08-workflow.md`
3. `docs/18-project-roadmap.md`, раздел `T-FRONT-VPS`
4. `docs/19-rkn-submission.md`
5. `.github/workflows/deploy.yml`
6. `infra/docker-compose.yml`
7. `infra/Caddyfile`
8. `infra/RUNBOOK.md`
9. `package.json`

## Фактический baseline на 2026-07-18

- Ветка `main`, ожидаемый HEAD: `62e0c72 feat(auth): bridge SmartCaptcha before GoTrue`.
- Локально есть чужой untracked-файл
  `docs/prompts/T-AUTH-UX2-review-fix-sonnet.md`. Не изменять, не добавлять в
  индекс, не удалять, не stash/reset/clean.
- Сайт — статический HTML/CSS/JS без сборщика.
- Public origin пока GitHub Pages/Fastly; apex и `www` ещё ведут туда.
- Российский VPS: `109.73.195.2`; backend и аналитика уже self-hosted на
  `api.wedesignerz.com` и `stats.wedesignerz.com`.
- Caddy работает контейнером из `infra/docker-compose.yml`, занимает 80/443 и
  монтирует `infra/Caddyfile`.
- На VPS пока нет `/srv/wedesignerz` и нет непривилегированного deploy-user.
- `robots.txt` должен остаться `Disallow: /`.
- SmartCaptcha production принята end-to-end; Turnstile временно поддерживается
  только серверным dual-mode bridge.
- Все 18 HTML имеют одинаковую meta-CSP. В CSP ещё остался legacy allowlist
  `ndhyvspgkelxgqmfmmry.supabase.co`, хотя runtime использует только
  `https://api.wedesignerz.com`. В рамках этой задачи legacy cloud origin надо
  удалить из всех CSP после проверки отсутствия runtime-ссылок.

## Цель repo-prep

Подготовить воспроизводимый и безопасный контур, в котором:

1. Один общий build-скрипт создаёт `_site/` с теми же исключениями, что текущий
   Pages workflow.
2. Отдельный verifier доказывает, что в `_site/` нет внутренних каталогов,
   конфигов, секретов и symlink; присутствуют обязательные site-файлы и ровно
   18 HTML.
3. Текущий Pages workflow использует общий build-скрипт и остаётся рабочим как
   rollback до cutover.
4. Новый VPS workflow сначала существует только как `workflow_dispatch`,
   использует GitHub Environment `production`, обычный SSH/rsync и только
   непривилегированного пользователя. Root SSH из Actions запрещён.
5. Релизы хранятся в `/srv/wedesignerz/releases/<40-char-sha>`, активируются
   атомарным symlink `/srv/wedesignerz/current`, предыдущий release доступен
   для воспроизводимого rollback.
6. Caddy обслуживает apex с `/srv/wedesignerz/current`, `www` постоянно
   редиректит на apex, внутренние пути всегда дают 404, directory listing
   выключен.
7. До DNS-cutover тот же static handler доступен только внутри Caddy-контейнера
   на `http://127.0.0.1:8080` для pre-cutover smoke-тестов. Порт 8080 не
   публиковать на host.
8. Response headers включают HSTS, `nosniff`, frame protection,
   `Referrer-Policy`, `Permissions-Policy` и header-CSP, совпадающую с
   meta-CSP по origin allowlist. Meta-CSP остаётся вторым слоем.

## Требуемые изменения

### 1. Общая сборка и проверка артефакта

- Создай `scripts/build-site.sh`:
  - `set -eu`;
  - работает из корня репозитория независимо от текущего cwd;
  - пересоздаёт только `<repo>/_site`;
  - повторяет текущие исключения Pages: `.git`, `.github`, `.claude`,
    `node_modules`, `docs`, `audits`, `supabase`, `infra`, `scripts`, `_site`,
    `CLAUDE.md`, `AGENTS.md`, package/lint/config files, `.DS_Store`;
  - не следует по symlink и не публикует dotfiles/секреты;
  - не использует широкие или невалидированные destructive targets.
- Создай `scripts/check-site-artifact.mjs` без новых npm-зависимостей:
  - принимает необязательный путь, default `_site`;
  - запрещает symlink на любой глубине;
  - запрещает внутренние каталоги/файлы, `.env*`, ключи и служебные файлы;
  - требует `index.html`, `404.html`, `robots.txt`, `styles.css`, `js/`, `css/`,
    `fonts/`;
  - требует ровно 18 HTML;
  - проверяет, что `robots.txt` содержит `Disallow: /`;
  - проверяет отсутствие Cloudflare/Turnstile и legacy cloud Supabase host в
    собранных HTML/CSS/JS;
  - выдаёт понятный ненулевой exit при нарушении.
- Добавь npm scripts `build:site` и `check:site-artifact`. Не ломай текущий
  `npm run check`.

### 2. CSP cleanup

- Удали `https://ndhyvspgkelxgqmfmmry.supabase.co` и
  `wss://ndhyvspgkelxgqmfmmry.supabase.co` из meta-CSP всех 18 HTML.
- Обнови `scripts/check-csp.mjs`, чтобы legacy host был запрещён и все CSP
  оставались идентичными.
- Не удаляй `api.wedesignerz.com`, `stats.wedesignerz.com` или SmartCaptcha.

### 3. GitHub workflows

- Переведи `.github/workflows/deploy.yml` на `npm ci`, `npm run check`,
  `npm run build:site`, `npm run check:site-artifact`, затем существующий Pages
  upload/deploy. Pages остаётся активным rollback до отдельного cutover.
- Создай `.github/workflows/deploy-vps.yml`:
  - только `workflow_dispatch`;
  - `permissions: contents: read`;
  - environment `production`;
  - inputs: `action` (`deploy`/`rollback`) и необязательный `release` для
    rollback;
  - build/check для deploy;
  - секреты только `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
    `VPS_KNOWN_HOSTS`;
  - запрещён `StrictHostKeyChecking=no`; known_hosts берётся из secret;
  - SSH key пишется с mode 600, не выводится в лог;
  - deploy rsync-ит `_site/` в
    `/srv/wedesignerz/incoming/${GITHUB_SHA}/`, затем вызывает
    `/usr/local/bin/wedesignerz-deploy activate ${GITHUB_SHA}`;
  - rollback принимает только полный 40-символьный lowercase SHA и вызывает
    `/usr/local/bin/wedesignerz-deploy rollback <sha>`;
  - никакого root username и никакого `sudo` в workflow.

### 4. VPS provisioning/deploy scripts

- Создай `infra/scripts/wedesignerz-deploy` — root-owned при установке, но
  исполняемый deploy-user без повышения привилегий:
  - безопасно валидирует 40-char lowercase SHA;
  - работает только внутри `/srv/wedesignerz`;
  - перед активацией повторно проверяет обязательные файлы, отсутствие symlink,
    внутренних путей и `.env`;
  - атомарно активирует release через временный symlink + rename/mv;
  - сохраняет корректный `previous`;
  - rollback разрешает только существующий release внутри allowlisted path;
  - не использует `eval`, небезопасные glob или рекурсивное удаление;
  - не чистит старые релизы автоматически.
- Создай `infra/scripts/provision-frontend-deploy.sh` для ручного запуска root:
  - создаёт системного пользователя `wedesignerz-deploy` без пароля;
  - создаёт `/srv/wedesignerz/{incoming,releases}` с минимальными правами;
  - устанавливает root-owned `/usr/local/bin/wedesignerz-deploy`;
  - принимает путь к заранее созданному public key, не генерирует и не
    печатает private key;
  - создаёт `authorized_keys` с ограничениями, совместимыми с rsync+ssh;
  - повторный запуск идемпотентен;
  - не меняет firewall, sshd, DNS, Docker или Caddy.

### 5. Caddy/Compose

- Обнови `infra/docker-compose.yml`: смонтируй весь `/srv/wedesignerz` в
  Caddy read-only по тому же пути. Не публикуй 8080.
- Обнови `infra/Caddyfile`:
  - не сломай `api.wedesignerz.com`, mail templates, backup health и
    `stats.wedesignerz.com`;
  - вынеси reusable static handler/snippet;
  - `wedesignerz.com` обслуживает static root;
  - `www.wedesignerz.com` делает permanent redirect на apex с сохранением URI;
  - внутренний `http://:8080` использует тот же handler для smoke;
  - `/docs*`, `/audits*`, `/supabase*`, `/infra*`, `/scripts*`, `/.git*`,
    `/.github*`, `.env`, `AGENTS.md`, `CLAUDE.md`, package/lint/config файлы
    явно дают 404;
  - custom 404 возвращает именно HTTP 404;
  - `encode zstd gzip`, `file_server` без `browse`;
  - security headers и header-CSP применяются к apex и internal smoke.

### 6. Документация

- Добавь в `infra/RUNBOOK.md` отдельный раздел T-FRONT-VPS:
  provisioning, GitHub Environment secrets, manual deploy, internal smoke,
  DNS cutover, live acceptance и rollback. Не включай реальные ключи/PII.
- В `docs/19-rkn-submission.md` отметь T-RKN-CAPTCHA и ручной шаг Yandex keys
  выполненными 2026-07-18 с фактической приёмкой: SmartCaptcha end-to-end,
  no-token fail-closed, Cloudflare отсутствует. T-FRONT-VPS не закрывай до
  реального cutover.
- В `docs/05-launch.md` зачистку T-RKN dependencies отметь выполненной, но
  T-FRONT-VPS/RKN/robots оставь открытыми.

## Проверки

Выполни и приложи точные результаты:

```bash
npm run check
npm run build:site
npm run check:site-artifact
git diff --check
node --check scripts/check-site-artifact.mjs
sh -n scripts/build-site.sh
sh -n infra/scripts/wedesignerz-deploy
sh -n infra/scripts/provision-frontend-deploy.sh
```

Дополнительно:

- посчитай HTML в `_site`;
- докажи отсутствие каждого запрещённого каталога/файла;
- проверь YAML workflows хотя бы доступным parser/структурной проверкой;
- если локально нет Docker/Caddy — честно отметь, production validation делает
  Opus на VPS; не выдумывай результат.

## Финальный отчёт

Кратко перечисли:

1. изменённые файлы;
2. архитектуру build/deploy/rollback;
3. результаты проверок;
4. что Opus должен сделать на VPS/GitHub/DNS;
5. любые риски или незакрытые вопросы.

Ещё раз: **не commit, не push, не VPS, не DNS, не deploy**.
