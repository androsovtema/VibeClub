# T-CONSENT-RECONSENT-FLASH — убрать мелькание consent dialog при каждой загрузке

Ты — Sonnet, исполнитель узкой review-fix задачи We Designerz / VibeClub.
Общайся с пользователем по-русски. Код и имена файлов — по стандарту проекта.

Рабочая папка:

```text
/Users/prosto/Desktop/01_Work/Products/VibeClub
```

## Live-дефект

После успешного явного re-consent сохраняемого admin пользователь подтвердил:
при каждой полной загрузке любой страницы сначала виден dialog
«Подтверди согласие, чтобы продолжить», затем после ответа БД он резко исчезает.

Диагноз подтверждён кодом. Каждый новый document начинает без in-memory
`consentReadyUserId`; `runProcessingConsentCheck()` вызывает
`showProcessingConsentChecking(callbacks)`, а эта функция делает
`openGate('checking')`. В результате до завершения RLS-запроса показываются
тёмный backdrop, общий title и checking-состояние той же re-consent modal.

Live DB исправна: явное действие admin создало current processing v4;
aggregate-only проверка после клика показала две active processing v4,
admin coverage `1 current / 0 missing`, контактов по-прежнему ноль. Не меняй
БД и не пытайся повторно получать consent.

## Жёсткий preflight

Перед работой:

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse main
git rev-parse origin/main
git diff --check
npm run check
```

Ожидается чистая база, где `HEAD=main=origin/main`; единственный допустимый
owner-owned untracked файл —
`docs/prompts/T-AUTH-UX2-review-fix-sonnet.md`. Не редактируй и не staging'и
его. Если есть другой неожиданный diff — остановись, ничего не сбрасывай и не
stash'и.

Полностью прочитай `AGENTS.md`, `docs/08-workflow.md`, раздел
`T-CONSENT-RECONSENT` в `docs/04-tasks-sonnet.md`, затем:

- `js/app.js`;
- `js/ui/reconsentModal.js`;
- `js/consent.js`;
- `js/ui/authModal.js`;
- scroll-lock helpers в `js/util.js`;
- re-consent/auth/captcha стили в `styles.css`;
- `scripts/check-consent-version.mjs`.

## Цель

Проверка current processing v4 по-прежнему выполняется при каждой новой
authenticated page load и остаётся fail-closed, но визуально работает так:

- страница рендерится без тёмного backdrop и без consent dialog;
- пока RLS-запрос не завершён, account UI технически не принимает pointer или
  keyboard actions;
- если current consent найден — silent guard снимается без мелькания, смены
  scroll position или focus jump;
- только если consent отсутствует — открывается существующий обязательный
  re-consent dialog;
- при сетевой/DB-ошибке по-прежнему открывается fail-closed error/retry dialog;
- recovery, signout, смена user и stale async response остаются безопасными.

Не заменяй DB-проверку localStorage/sessionStorage/JWT/user metadata. Нельзя
кэшировать согласие как источник правды: current row может быть отозван или
сменится версия политики.

## Требуемая архитектура silent pending

Сохрани публичный экспорт `showProcessingConsentChecking()`, чтобы `js/app.js`
не требовал лишнего рефакторинга, но он больше не должен вызывать
`openGate('checking')` и не должен показывать `[role="dialog"]`.

Реализуй отдельный невидимый pending guard в `js/ui/reconsentModal.js`:

1. Прозрачный fixed shield выше account/auth UI и ниже CAPTCHA/re-consent modal.
   Он блокирует pointer interaction, но не затемняет страницу и не анимируется.
2. На время pending ставь `document.body.inert = true` и `aria-busy="true"`,
   чтобы keyboard interaction тоже была закрыта. Сохрани исходные значения и
   снимай только собственное состояние.
3. Pending не использует `lockScroll()`, не двигает focus и не меняет scroll.
4. При current consent `hideProcessingConsentGate()` обязана снять pending,
   даже если modal ещё не создавалась или уже hidden.
5. Перед переходом в required/error modal сначала полностью сними pending,
   затем открой обычный dialog: его checkbox/retry должны быть focusable, а
   body не должен остаться inert.
6. Signout, PASSWORD_RECOVERY, privacy page, null user, generation reset и
   смена user всегда очищают pending guard. Поздний ответ старой сессии не
   должен вернуть shield или dialog.
7. Если shield использует `display`, добавь обязательный `[hidden]` guard.
8. Слои: auth modal остаётся `3000`, silent shield используй около `3040`,
   re-consent dialog `3050`, `.captcha-host` остаётся `3100`.

Допустима эквивалентная реализация, если она доказывает одновременно отсутствие
видимого flash и fail-closed pointer/keyboard behavior. Не скрывай весь body и
не показывай пустой/белый экран вместо страницы.

## Границы

Разрешено менять только:

- `js/ui/reconsentModal.js`;
- `js/app.js` — только если действительно нужен узкий lifecycle-hook;
- `styles.css`;
- `scripts/check-consent-version.mjs` — если добавляешь статический regression
  guard;
- correction note внутри `T-CONSENT-RECONSENT` в
  `docs/04-tasks-sonnet.md`.

Не менять:

- SQL migrations, `supabase/schema.sql`, RLS, ACL и production DB;
- auth/signup/password/CAPTCHA API-код и тексты согласия;
- HTML-страницы, privacy policy/version;
- зависимости, package/lockfiles;
- VPS, GitHub Actions, DNS, Caddy, Storage, Umami, robots;
- другие статусные документы.

Не делать commit, push, deploy или live submit. Не выводить email, UUID, JWT,
имена или контакты.

## Обязательная проверка

Локальный сайт запускать только через `python3 -m http.server 8080`.
Для изолированного UI допускается временная QA-страница, которая вызывает
экспортированные modal-функции; перед отчётом удалить её.

Desktop 1280 и реальный viewport 375×812:

1. Silent checking не показывает dialog, title, backdrop или checking-текст.
2. Контент страницы виден сразу; horizontal overflow отсутствует.
3. Во время искусственно задержанной проверки pointer click и keyboard action
   по account UI не проходят; `body.inert`/`aria-busy` выставлены.
4. Current-consent result снимает shield/inert/aria-busy без focus/scroll jump.
5. Missing result открывает прежний required dialog с пустым checkbox и
   disabled primary.
6. Error result открывает retry/signout и остаётся fail-closed.
7. Escape/backdrop не закрывают required/error dialog.
8. Recovery не перекрывается silent guard или re-consent dialog.
9. Signout/user change очищают guard; stale response ничего не возвращает.
10. Scroll lock после required/error success/close не остаётся зависшим.
11. `.captcha-host` остаётся выше обоих re-consent слоёв.
12. Консоль без новых errors/warnings.

После этого:

```bash
npm run check
node --check js/app.js
node --check js/ui/reconsentModal.js
node --check scripts/check-consent-version.mjs
git diff --check
git diff --stat
git status --short
git diff --name-only
```

## Docs/status

В `docs/04-tasks-sonnet.md` добавь только новую correction note, не переписывая
предыдущие live-записи:

- root cause видимого checking dialog;
- silent pending/fail-closed решение;
- desktop/mobile/keyboard результаты;
- production/DB не менялись;
- статус: `FLASH REVIEW-FIX ВЫПОЛНЕН SONNET, ОЖИДАЕТ НЕЗАВИСИМОГО РЕВЬЮ`.

Не закрывай `T-CONSENT` и legal gate до независимого review, deploy и живой
проверки Тёмой на authenticated admin session.

## Отчёт

Коротко по-русски: root cause, точные файлы, как сохранён fail-closed без flash,
проверки 1280/375/keyboard/recovery, команды, точный `git status`, и явное
подтверждение, что commit/push/deploy/production не выполнялись.
