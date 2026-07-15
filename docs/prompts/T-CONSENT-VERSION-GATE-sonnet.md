# T-CONSENT-VERSION-GATE — неизменяемая migration и проверка версии в grant RPC

Ты — Sonnet, исполнитель небольшой P0-legal задачи We Designerz. Работай в
текущем репозитории и общайся с пользователем по-русски.

## Почему T-CONSENT-02 остановлена

Read-only проверка 2026-07-16 подтвердила: production и live frontend уже
работают на `privacy-2026-07-15-v2`; таблица/RLS/RPC существуют, журнал содержит
исторические v2 rows. При этом в незакоммиченном diff исходная, уже применённая
migration `20260715091536_t_consent_01_user_consents.sql` переписана на v4.
Применённую migration нельзя менять и запускать повторно как новый апгрейд.

Второй дефект: `grant_profile_dissemination(subject_full_name text)` сам ставит
текущую серверную версию и не проверяет версию текста, которую видел браузер.
После переключения БД старый закэшированный UI v2 может создать row, ошибочно
помеченный v4. Signup от этого уже защищён: frontend передаёт версию, а
`handle_new_user()` проверяет точное совпадение.

## Жёсткие границы

- Только repo-работа. Не подключайся к VPS, не меняй production/cloud, не делай
  commit, push или deploy.
- Сначала покажи `git status --short`. Ничего не reset/stash/checkout; сохрани
  весь существующий T-CONSENT-UX/AUTH/docs diff.
- Не меняй утверждённые юридические тексты и версию
  `privacy-2026-07-16-v4`.
- Не создавай backfill и не переписывай исторические consent rows.
- Не меняй `js/auth.js`, signup metadata, `js/config.js`, CSP, DNS, Caddy,
  Umami или `robots.txt`.

## Сначала прочитай

1. `AGENTS.md`, `CLAUDE.md`, `docs/08-workflow.md`.
2. T-CONSENT/T-CONSENT-UX/T-CONSENT-AUTH в `docs/04-tasks-sonnet.md`.
3. `docs/prompts/terra/T-CONSENT-02-live-apply.md`.
4. `js/consent.js`, `js/me.js`, `scripts/check-consent-version.mjs`,
   `scripts/security-check.mjs`.
5. Исходную migration и соответствующий блок `supabase/schema.sql`.

## 1. Восстанови историческую migration v2

Верни в
`supabase/migrations/20260715091536_t_consent_01_user_consents.sql` точный
literal `privacy-2026-07-15-v2`, как в commit `e1d86dc`. Не откатывай другие
файлы и не переписывай migration целиком: исправь только ошибочно изменённую
версию. После задачи этот файл снова описывает реально применённую историю v2.

## 2. Создай отдельную v4 upgrade-migration

Сначала проверь `supabase --help` и `supabase migration new --help`, затем создай
файл штатной командой:

```bash
supabase migration new t_consent_v4_upgrade
```

Не придумывай timestamp вручную. Новая migration должна быть атомарной
(`begin`/`commit`) и делать только upgrade поверх live v2:

1. обновить `public.current_privacy_policy_version()` до
   `privacy-2026-07-16-v4`, сохранить `search_path = ''` и закрытый EXECUTE;
2. удалить старые overload'ы `grant_profile_dissemination()` и
   `grant_profile_dissemination(text)`;
3. создать единственную сигнатуру
   `grant_profile_dissemination(subject_full_name text, submitted_policy_version text)`;
4. после проверки `auth.uid()` потребовать точное совпадение
   `submitted_policy_version` с `current_privacy_policy_version()`, иначе бросить
   машинную ошибку `consent_policy_version_invalid` до любых изменений;
5. сохранить существующую нормализацию ФИО, получение подтверждённой почты из
   `auth.users`, per-user lock, идемпотентность, scope и server timestamp;
6. revoke EXECUTE от `PUBLIC` и `anon`, grant `authenticated` для новой
   двухаргументной сигнатуры. Стандартный привилегированный `service_role`
   может остаться в ACL через Supabase default privileges; frontend его не
   использует, а функция всё равно требует `auth.uid()`.

Не пересоздавай таблицу, RLS, trigger контактов и `handle_new_user()`, не очищай
контакты повторно и не трогай существующие rows: эти объекты уже live на v2, а
signup автоматически начнёт принимать v4 через серверную функцию версии.

## 3. Синхронизируй schema и frontend

- В `supabase/schema.sql` должна остаться только новая двухаргументная grant
  function с той же проверкой и ACL; финальная schema использует v4.
- В `js/me.js` передавай в RPC и `subject_full_name`, и
  `submitted_policy_version: PRIVACY_POLICY_VERSION`.
- Для `consent_policy_version_invalid` покажи понятную ошибку: текст согласия
  обновился, нужно перезагрузить страницу и повторить. Добавь i18n-строку в
  существующем стиле; другие UX-тексты не меняй.
- Старый закэшированный вызов с одним аргументом после schema reload обязан
  падать безопасно из-за отсутствующей сигнатуры и не создавать row.

## 4. Обнови проверки

- `scripts/security-check.mjs`: валидный grant передаёт текущую версию; перед
  ним отдельный вызов с устаревшей/подменённой версией должен быть отбит и не
  создавать active dissemination row.
- `scripts/check-consent-version.mjs` больше не должен ожидать единственную
  T-CONSENT migration. Он обязан проверять:
  - историческая `20260715091536...` содержит только v2;
  - `js/consent.js`, новая v4 upgrade-migration и `supabase/schema.sql`
    содержат одну и ту же текущую v4;
  - найдена ровно одна migration с суффиксом `_t_consent_v4_upgrade.sql`.
- Обнови `docs/prompts/terra/T-CONSENT-02-live-apply.md`: подставь точный путь
  созданной upgrade-migration вместо placeholder и сохрани запрет повторно
  запускать v2.
- В `docs/04-tasks-sonnet.md`, `08-workflow.md`, `docs/prompts/terra/README.md`
  отметь задачу выполненной только после фактического ревью; сейчас не ставь
  «принято» самостоятельно.

## Проверки

```bash
npm run check
git diff --check
node --check js/me.js
node --check scripts/check-consent-version.mjs
node --check scripts/security-check.mjs
```

Если доступен изолированный локальный PostgreSQL 16, проверь v2 baseline → v4
upgrade, stale/tampered/current version, идемпотентный grant/revoke, ACL и
сохранность исторических rows. Не запускай будущий `security-check` против
production v2: локальный код уже будет ожидать новую RPC-сигнатуру.

## Приёмка

- применённая v2 migration снова неизменна и не используется для upgrade;
- новая migration создана Supabase CLI и содержит только v2 → v4 upgrade;
- grant без версии или с v2/tampered version не создаёт consent row;
- среди браузерных ролей `anon` не исполняет RPC, `authenticated` исполняет;
- grant с v4 работает и по-прежнему серверно датируется;
- signup/`js/auth.js` не изменены;
- исторические rows не переписываются;
- проверки зелёные;
- commit/push/deploy/VPS/production не затронуты.

В финале коротко перечисли файлы, тесты и всё, что сознательно осталось на
`T-CONSENT-02`.
