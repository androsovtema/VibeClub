# T-CUTOVER-02 — deploy CSP и живой cutover без повторного импорта

Ты — Terra, исполнитель контролируемого production cutover проекта We Designerz.
Общайся с пользователем по-русски. Работай только после прямой команды Тёмы
начать. Один оператор ведёт весь freeze до приёмки или отката.

## Сначала прочитай

1. `AGENTS.md` и `CLAUDE.md`.
2. Хвост `docs/08-workflow.md`.
3. T-LOC и T-CUTOVER в `docs/04-tasks-sonnet.md`.
4. Шаги 4, 7, 8, 8.1 и 9 `infra/RUNBOOK.md`.
5. `docs/16-security-status.md`.

## Подтверждённое исходное состояние

- T-CUTOVER-01 выполнен: CSP подготовлен на 18 HTML, Auth на VPS проверяет
  Turnstile, `SITE_URL` корректен, cloud и self-host требуют пароль минимум 12.
- Шаги 4–5 **уже выполнены 2026-07-14**. Cloud и self-host совпадают по данным:
  3 auth users / 3 profiles / 3 projects / 1 comment / 3 upvotes / 2 feedback.
  Независимая сверка подтвердила совпадение counts, `max(created_at)` и
  нормализованных отпечатков строк. На self-host нет старых storage URL.
- Storage: cloud 19, self-host 18. Единственный отсутствующий PNG
  `e96f43f1-de4d-492c-b974-d7b12a9b9827.png` — подтверждённая сирота: он не
  используется в `profiles.avatar_url`, `projects.cover_url` или `projects.images`.
- Self-host Umami содержит сайт `wedesignerz.com`; tracking API отвечает 200.
- Предварительный backup и restore-test зелёные, cron установлен. После cutover
  backup/restore нужно повторить на финальном состоянии.

## Абсолютный запрет

**Не выполнять повторный полный импорт шагов 4.1–4.3.** Не загружать старый
`pg_dump --data-only` в непустую self-hosted БД, не делать `truncate` и не
перекопировать все Storage-объекты. При `COPY` duplicate key может оборвать
таблицу и оставить незаметно неполную дельту.

Если данные расходятся — остановить cutover и показать точную дельту. Разрешён
только адресный перенос новых строк/файлов после отдельного плана и проверки.

## Фаза A — безопасный deploy до freeze

1. Проверь `git status`, текущий diff и `npm run check` + `git diff --check`.
2. Убедись, что `js/config.js` всё ещё указывает на cloud Supabase и cloud Umami.
3. Если пакет T-CUTOVER-01 ещё не задеплоен — закоммить согласованный пакет,
   push в `main`, дождись зелёного GitHub Actions deploy.
4. На живом `https://wedesignerz.com` до freeze проверь:
   - сайт открывается, Supabase-запросы идут в cloud;
   - вход существующего пользователя работает;
   - в консоли нет CSP, Supabase и Turnstile ошибок;
   - desktop и 375px не получили регресс.

Если deploy красный или cloud-прод сломан — freeze не начинать.

## Фаза B — freeze и дельта-сверка

Начинай только после отдельного «го» Тёмы на окно 30–60 минут.

1. Выключи новые регистрации в cloud (`disable_signup=true`). Это не блокирует
   записи существующих сессий, поэтому Тёма дополнительно просит трёх участников
   не пользоваться сайтом.
2. Сними по cloud и self-host для `auth.users`, `profiles`, `projects`,
   `comments`, `project_upvotes`, `feedback`:
   - count;
   - `max(created_at)`;
   - безопасный агрегированный digest строк (для URL сначала нормализовать
     cloud storage-host к `api.wedesignerz.com`).
3. Сверь Storage: допустимо только `19 cloud = 18 self-host + 1` известная
   сирота. Проверь, что новых объектов сверх этого нет.
4. Всё совпало — **ничего не импортируй**, переходи сразу к шагу 7.
5. Есть новая дельта — остановись, не переключай фронт и не удаляй данные.

## Фаза C — шаг 7, локальный self-host e2e

1. Временно направь локальный `js/config.js` на self-host URL/anon key, не
   коммить эту пробу.
2. Через `python3 -m http.server 8080` пройди регистрацию с Turnstile, письмо,
   подтверждение, вход, recovery, проект+обложку, модерацию, комментарий и
   feedback. Для CAPTCHA/почты попроси Тёму выполнить только необходимые клики.
3. Запусти `WDZ_TEST_JWT='<access_token>' npm run security-check` обычным
   member JWT. Токен не печатай, не сохраняй в файлы и не проси вставлять в чат.
4. Проверь логи сервисов. Любая повторяющаяся 5xx, рестарт или ошибка письма —
   стоп, фронт не переключать.
5. После всех проверок удали только созданные этим прогоном тестовые записи и
   файлы (или явно зафиксируй их как принятую self-host дельту). Повторно сними
   counts, чтобы случайный тестовый мусор не маскировал расхождение.
6. Верни `js/config.js` к cloud перед подготовкой отдельного cutover-коммита.

## Фаза D — шаг 8 и приёмка 8.1

Только если фазы B–C полностью зелёные:

1. Отдельным минимальным коммитом переключи в `js/config.js`:
   - Supabase URL и anon key на self-host;
   - `UMAMI_SRC` на `https://stats.wedesignerz.com/script.js`;
   - `UMAMI_WEBSITE_ID` на ID self-host сайта `wedesignerz.com`.
2. Push, дождись зелёного deploy.
3. На проде повтори counts/dates/digests, изображения, полный e2e, member
   `security-check`, живое событие Umami и логи всех сервисов.
4. После зелёной приёмки сделай финальный backup, повторный restore-test и
   проверь мониторинг/алерты шага 9.
5. Cloud не удалять. Sign ups там оставить выключенными.

## Rollback

- До появления новых записей на self-host: вернуть предыдущий cloud-config
  отдельным revert-коммитом и задеплоить.
- Если на self-host уже появились новые записи: простой rollback запрещён;
  сначала backup обеих сторон и план слияния двух дельт.
- `robots.txt`, РКН, T-CONSENT и T-FRONT-VPS в эту задачу не входят.

## Отчёт

Коротко по-русски: commit/deploy SHA, результаты cloud-проверки, freeze-время,
дельта-таблица, e2e/security-check/логи, cutover SHA, backup/restore и любой
ручной шаг Тёмы. Не публикуй ключи, JWT, email и другие ПДн.
