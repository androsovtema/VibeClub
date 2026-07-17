# T-CONSENT-RECONSENT — явное processing-согласие для legacy-участника

Ты — Sonnet, исполнитель отдельного P0-legal repo-prep проекта We Designerz /
VibeClub. Общайся с пользователем по-русски. Код, SQL, имена файлов и commit
message — на английском по стандарту проекта.

Рабочая папка:

```text
/Users/prosto/Desktop/01_Work/Products/VibeClub
```

## Почему задача нужна

`T-CONSENT-02` технически принят на self-host production: текущая версия
политики — `privacy-2026-07-16-v4`, signup создаёт серверно датированное
`processing`-согласие v4, журнал/RLS/version gate проверены. Legacy inventory
нашёл одного реального сохраняемого admin с опубликованными проектами без
active `processing` v4. Историческое v2-согласие нельзя молча повысить или
backfill'ить.

Нужен общий, не привязанный к email/UUID/роли UI/API-flow: любой вошедший
пользователь без active processing v4 видит блокирующее предложение прочитать
актуальную политику и явно подтвердить согласие. Только его собственное
действие создаёт новую серверно датированную v4-запись. Старый v2 row остаётся
в audit history.

## Жёсткий preflight

Не начинай реализацию поверх текущего незакоммиченного review-fix. Задачу можно
запускать только когда:

- коррекция `T-AUTH-UX2` уже принята и закоммичена отдельным коммитом;
- `HEAD`, `main` и `origin/main` совпадают;
- `git diff --check` чист;
- в исполняемом JS нет `isAsciiOnly(password...)` и
  `auth.error.invalid_ascii_password`;
- этот промпт уже tracked и входит в архитектурный docs-коммит;
- единственный допустимый owner-owned untracked файл —
  `docs/prompts/T-AUTH-UX2-review-fix-sonnet.md`; его не редактировать, не
  staging'ить и не включать в commit.

Покажи:

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse main
git rev-parse origin/main
git diff --check
```

Если correction-файлы ещё modified, есть другой неожиданный diff или Git-база
не совпадает — не делай `reset`, `checkout`, `stash` или чистку. Остановись и
отчитайся.

## Сначала прочитай полностью

1. `AGENTS.md`, `docs/08-workflow.md`, `docs/README.md`.
2. `T-CONSENT`, `T-CONSENT-RECONSENT` и `T-AUTH-UX2` в
   `docs/04-tasks-sonnet.md`.
3. `docs/14-ru-compliance.md`, но не меняй юридические выводы самостоятельно.
4. `docs/prompts/terra/T-CONSENT-02-live-apply.md` — только как историю уже
   завершённого live apply, не запускай её снова.
5. `js/app.js`, `js/auth.js`, `js/consent.js`, `js/ui/authModal.js`,
   `js/i18n/ru.js`, `js/util.js`.
6. `supabase/schema.sql`, обе T-CONSENT migrations,
   `scripts/check-consent-version.mjs`, `scripts/security-check.mjs`.
7. Auth/modal/hidden-guard стили в `styles.css`.

Перед SQL-командами проверь `supabase --help` и нужную подкоманду через
`--help`; CLI-команды не угадывай.

## Границы repo-prep

Разрешено менять только:

- новый файл migration, созданный Supabase CLI;
- `supabase/schema.sql`;
- `js/consent.js`;
- `js/app.js`;
- новый `js/ui/reconsentModal.js`;
- `js/i18n/ru.js`;
- `styles.css`;
- `scripts/check-consent-version.mjs`;
- `scripts/security-check.mjs`;
- `docs/04-tasks-sonnet.md`.

Не менять без остановки и отдельного согласования:

- исторические migrations `20260715091536_t_consent_01_user_consents.sql` и
  `20260715173135_t_consent_v4_upgrade.sql`;
- `js/auth.js`, signup metadata, password/CAPTCHA logic;
- HTML-страницы — общий `js/app.js` уже подключён ко всем 18 публичным HTML;
- `privacy.html` и утверждённую версию/формулировку политики;
- `js/config.js`, anon key, `package.json`, lockfile;
- существующие RLS-политики, contact RPC/trigger, project/admin logic;
- VPS, production/self-host DB, cloud Supabase, DNS, Caddy, Storage, Umami,
  GitHub Actions, `robots.txt`;
- остальные статусные документы до независимого review.

Не добавляй зависимости или тестовый фреймворк. Не делай commit, push, deploy
или live migration. Не логируй и не вставляй в отчёт JWT, refresh token, email,
ФИО, UUID, контакты или иные PII.

## 1. Новая узкая processing RPC

Создай migration штатной командой:

```bash
supabase migration new t_consent_reconsent
```

Не придумывай timestamp вручную. Migration должна быть атомарной
(`begin`/`commit`) и добавлять одну функцию:

```sql
public.grant_processing_consent(submitted_policy_version text) returns uuid
```

Контракт функции:

1. `language plpgsql`, `security definer`, `set search_path = ''`; все объекты
   полностью квалифицированы схемой.
2. Получить caller только через `(select auth.uid())`. Если caller отсутствует,
   бросить `consent_auth_required` до изменений.
3. Потребовать точное совпадение `submitted_policy_version` с
   `public.current_privacy_policy_version()`. `NULL`, v2 и произвольная версия
   должны падать с `consent_policy_version_invalid` до изменений.
4. Взять row lock на `public.profiles` текущего caller, чтобы параллельные
   вызовы одного пользователя сериализовались. Если профиль отсутствует —
   безопасно остановиться, не создавать orphan consent.
5. Точный processing scope:

```json
{"purpose":"club_account_and_services"}
```

6. Если уже есть active processing row текущей версии с точным scope — вернуть
   его `id` без изменения `granted_at`, без нового row и без отзыва.
7. Иначе атомарно поставить `revoked_at = now()` только active processing row
   этого caller, затем вставить один новый active processing row текущей версии
   с точным scope. `granted_at` задаёт серверный default; клиент не передаёт
   время, `user_id`, scope или consent type.
8. Исторические rows не удалять и не переписывать: у v2 допустимо только
   появление `revoked_at` в момент явного нового согласия. Других пользователей
   функция не касается.
9. `subject_full_name` и `subject_contact` для processing не заполнять: текущий
   signup-контракт идентифицирует субъекта через authenticated `user_id`; ФИО и
   email snapshot относятся к отдельному dissemination-consent и не должны
   смешиваться с этой задачей.
10. Отозвать EXECUTE у `PUBLIC` и `anon`, выдать только `authenticated` для
    точной сигнатуры. Функция всё равно обязана проверять `auth.uid()`.

Не создавай admin-specific SQL, списки UUID/email, backfill, service-role
скрипты или обход через metadata. Не меняй уникальный индекс и RLS таблицы.

Синхронизируй финальное определение функции и ACL в `supabase/schema.sql`.

## 2. Общий fail-closed UI-гейт

Добавь `js/ui/reconsentModal.js` и подключи его из `js/app.js`.

Гейт применяется к любому authenticated user, а не к роли admin и не к
конкретному идентификатору. Проверка текущего состояния читает только
собственные строки через существующий RLS:

- `consent_type = processing`;
- `policy_version = PRIVACY_POLICY_VERSION`;
- `revoked_at is null`;
- scope точно равен processing scope.

В `js/consent.js` добавь единый экспорт purpose/проверки scope, чтобы frontend,
security-check и UI не дублировали литерал хаотично. Версия остаётся
`privacy-2026-07-16-v4`.

Поведение:

- пока состояние authenticated user проверяется, account UI не должен считаться
  доступным; при сетевой ошибке fail closed, показать retry и «Выйти», а не
  считать согласие существующим;
- если active v4 processing row с точным scope есть — модалка не появляется;
- если его нет — открыть недисмиссабельную modal/overlay поверх страницы;
- backdrop и Escape не закрывают гейт; обязательный безопасный выход — кнопка
  «Выйти»;
- ссылка на `privacy.html` открывается в новой вкладке с
  `target="_blank" rel="noopener noreferrer"`, чтобы политику можно было
  прочитать, не обходя гейт;
- checkbox по умолчанию пуст; primary disabled, пока checkbox не отмечен;
- submit повторно проверяет checkbox и вызывает только
  `grant_processing_consent({ submitted_policy_version:
  PRIVACY_POLICY_VERSION })`;
- loading защищает от повторного submit; `try/catch/finally` всегда возвращает
  контролы из loading;
- `consent_policy_version_invalid` показывает просьбу перезагрузить страницу;
  остальные ошибки не закрывают modal и не теряют checkbox без причины;
- после успеха повторно подтвердить active row текущей версии или принять
  успешный RPC id как результат атомарной функции, закрыть гейт, вернуть scroll
  и focus, показать короткий success toast;
- при signout или смене user закрыть старый гейт, сбросить состояние и не дать
  позднему async-ответу предыдущей сессии открыть modal новому пользователю;
- initial `getCurrentUser()` и `onAuthChange()` не должны запускать гонку или
  дублировать modal/RPC; дедуплицируй проверку по user id/generation;
- `PASSWORD_RECOVERY` имеет приоритет: reset-password modal нельзя перекрыть
  re-consent overlay. Отложи гейт до успешного reset/следующей обычной страницы;
  одновременно две modal не показывай;
- новая signup-сессия уже имеет processing v4 и проходит проверку без новой
  модалки; magic-link/signin legacy-пользователя должен попасть в гейт.

Не превращай processing consent в authorization claim и не используй
`user_metadata`/JWT metadata как доказательство согласия. Источник правды —
`public.user_consents` и серверная RPC.

## 3. Текст и доступность

Не меняй утверждённый checkbox-текст регистрации. В re-consent modal переиспользуй
его смысл и ссылку на политику. Допустимый draft:

- title: `Подтверди согласие, чтобы продолжить`;
- text: `Твой аккаунт создан до текущей версии политики. Прочитай её и подтверди согласие на обработку персональных данных.`;
- checkbox: `Даю согласие на обработку моих персональных данных на условиях политики конфиденциальности.`;
- primary: `Подтвердить и продолжить`;
- secondary: `Выйти`;
- retry: `Повторить проверку`;
- success: `Согласие сохранено.`

Все строки положи в `js/i18n/ru.js`. Не повышай версию политики: этот UI не
меняет текст политики, а получает согласие на уже утверждённую v4. В статусе
зафиксируй, что draft требует финального текстового подтверждения Тёмы перед
live apply, но repo-review может проверить механику раньше.

Доступность:

- `role="dialog"`, `aria-modal="true"`, связанный title;
- focus trap; при открытии focus на checkbox или ссылку на политику;
- после успеха focus возвращается разумно;
- keyboard-only работает; disabled/checked/loading озвучиваются нативно;
- body scroll lock использует существующие `lockScroll`/`unlockScroll`;
- если overlay использует `display:flex`, обязательно добавь
  `.reconsent-overlay[hidden] { display: none; }`;
- визуальный слой не ломает `.captcha-host { z-index: 3100; }` и auth modal.

## 4. Проверки, которые нужно расширить

### Offline check

Расширь `scripts/check-consent-version.mjs`, чтобы `npm run check` дополнительно
проверял:

- исторические v2 и v4-upgrade migrations по-прежнему неизменны;
- существует ровно одна migration с суффиксом
  `_t_consent_reconsent.sql`;
- и migration, и `supabase/schema.sql` содержат единственную точную сигнатуру
  `grant_processing_consent(text)`;
- нет безаргументного/другого overload;
- ACL закрывает `PUBLIC`/`anon` и разрешает `authenticated`;
- frontend по-прежнему передаёт `PRIVACY_POLICY_VERSION`.

### `security-check.mjs`

Production security-check запускается только позже, после отдельного live apply.
Сейчас обнови контракт для member JWT без PII:

- anon не исполняет processing RPC;
- v2/NULL/tampered version отклонены и не меняют active row;
- member с уже active v4 получает тот же id, без нового row и без изменения
  server timestamp;
- member видит только свои consent rows;
- текущие dissemination/contact/security проверки не регрессируют;
- скрипт не печатает JWT, email, полный UUID, ФИО или контакты.

Не запускай будущий security-check против production до применения migration:
RPC там ещё нет, такой красный результат ничего не докажет.

### Изолированный PostgreSQL 16

Обязателен локальный/временный PostgreSQL 16 прогон, без production данных:

1. baseline schema + v4 upgrade + новая migration применяются чисто;
2. создать synthetic profile/user A с active processing v2 и synthetic user B
   как контроль;
3. anon/NULL auth, NULL/v2/tampered version не меняют ни одного row;
4. current v4 вызов A сохраняет исходный v2 row и его `granted_at`, ставит ему
   `revoked_at`, создаёт ровно один active v4 с серверной датой и точным scope;
5. повторный current v4 вызов возвращает тот же id и не меняет `granted_at`;
6. rows B неизменны;
7. прямые INSERT/UPDATE/DELETE через browser roles по-прежнему закрыты;
8. ACL: `PUBLIC`/`anon` без EXECUTE, `authenticated` с EXECUTE;
9. migration и schema дают одинаковый финальный объект.

Используй только synthetic значения и не выводи идентификаторы в отчёт.

## 5. Local browser QA без production submit

Запуск:

```bash
python3 -m http.server 8080
```

Проверь desktop 1280 и реальный viewport 375×812. Не используй `file://` и не
вызывай production RPC/Auth/Turnstile.

Для UI-проверки разрешено экспортировать узкую функцию открытия modal и вызвать
её локально без submit. Не добавляй debug-query или mock-mode в production код.

Проверить:

- current-consent state не показывает гейт;
- missing/error state fail closed;
- checkbox 0/1 корректно управляет primary;
- Enter не обходит disabled;
- Escape/backdrop не закрывают modal;
- policy link, retry и signout доступны с клавиатуры;
- loading не допускает двойной submit;
- 375 px: `scrollWidth === clientWidth === 375`, нет обрезки текста/кнопок;
- `[hidden]` реально скрывает overlay;
- scroll lock не конфликтует с auth modal/menu;
- reset-password приоритет не регрессировал;
- `.captcha-host` остаётся `z-index: 3100`;
- консоль чистая.

## Обязательные команды

```bash
npm run check
git diff --check
node --check js/app.js
node --check js/ui/reconsentModal.js
node --check js/consent.js
node --check js/i18n/ru.js
node --check scripts/check-consent-version.mjs
node --check scripts/security-check.mjs
git diff --stat
git status --short
git diff --name-only
```

В `git diff --name-only` — только разрешённые tracked-файлы. Owner-owned
`T-AUTH-UX2-review-fix-sonnet.md` остаётся untracked и не входит в diff.

## Что записать в `docs/04-tasks-sonnet.md`

После реализации добавь correction/status note внутри
`T-CONSENT-RECONSENT`:

- точное имя новой migration и RPC;
- общий user-based, не admin-specific flow;
- fail-closed/error/recovery границы;
- результаты offline, PostgreSQL 16 и browser 1280/375 проверок;
- статус только `REPO-PREP ВЫПОЛНЕН SONNET, ОЖИДАЕТ НЕЗАВИСИМОГО РЕВЬЮ`;
- явно: production не менялся, legacy admin не вызывал RPC, live apply не
  выполнен, legal gate и уведомление РКН всё ещё заблокированы;
- draft UX-текста ожидает финального подтверждения Тёмы перед live.

Не обновляй `README`, `05-launch`, `08-workflow`, `09-growth-plan`,
`14-ru-compliance`, `16-security-status` до независимого review/live apply.

## Итоговая приёмка repo-prep

- нет user-specific идентификаторов или backfill;
- только явное действие authenticated user создаёт active processing v4;
- v2 сохраняется в истории, другие пользователи не затронуты;
- stale/NULL/tampered version ничего не меняют;
- повторный current вызов идемпотентен;
- RLS/ACL журнала не ослаблены;
- общий UI fail closed, доступен с клавиатуры и не конфликтует с recovery;
- signup/auth/password/CAPTCHA/dissemination не регрессировали;
- проверки зелёные;
- commit/push/deploy/VPS/production не затронуты;
- legal closure остаётся открытым до отдельного review, live apply и реального
  явного согласия legacy admin.
