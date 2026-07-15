# T-CUTOVER-02 — отчёт по freeze и live cutover

Дата закрытия: 15 июля 2026.

## Итог

Freeze завершён. Публичный фронт переключён на self-hosted Supabase и Umami
на RU-VPS. Cloud-проект сохранён; новые регистрации в нём остаются выключенными.
Повторный импорт не выполнялся.

## Выполненные фазы

| Фаза | Результат |
| --- | --- |
| A — preflight | Проверки репозитория и production прошли, CSP-deploy зелёный. |
| B — freeze | Cloud sign ups отключены; cloud и self-host сверены без новой бизнес-дельты. |
| C — локальный self-host e2e | Регистрация с Turnstile, письмо, вход, recovery, проект с обложкой, модерация, комментарий, feedback и `security-check` пройдены. |
| D — live cutover | Self-host config опубликован, production e2e и Umami проверены, тестовые записи удалены. |

## Код и deploy

- Preflight: `4a21ce6`.
- Стабилизация e2e/CAPTCHA и cover-preview: `1a54e93`.
- Cutover на self-host: `7b22190`.
- Backup freshness watchdog и итоговый freeze-отчёт: `8f08652`.
- GitHub Pages deploy после cutover зелёный.

## Сверка данных

Итоговый self-host baseline после очистки e2e-данных:

| Сущность | Количество |
| --- | ---: |
| `auth.users` | 3 |
| `profiles` | 3 |
| `projects` | 3 |
| `comments` | 1 |
| `project_upvotes` | 3 |
| `feedback` | 2 |
| `storage.objects` в `covers` | 18 |

Counts, максимальные даты создания и нормализованные отпечатки пересняты после
очистки. Допустимое историческое расхождение Storage сохранено: cloud содержит
19 объектов, self-host — 18, потому что один cloud PNG подтверждён как сирота.
Служебные Auth-изменения `updated_at`, `last_sign_in_at` и `recovery_sent_at`
приняты как ожидаемая Auth-дельта; значимые поля пользователей и identities
совпали.

## Production-приёмка

- Регистрация, подтверждение email, вход и recovery на production прошли.
- Проект с обложкой отправлен, опубликован, прокомментирован; feedback создан.
- Тестовые пользователь, проект, файлы и feedback затем удалены адресно.
- `npm run security-check` с member JWT: 8 из 8 проверок зелёные.
- Живое событие self-host Umami зафиксировано.
- Все контейнеры healthy; в финальном окне не обнаружены fatal/error, restart,
  hook timeout, connection refused или 5xx в Auth, mail bridge, REST, Storage,
  Umami.

## Backup, restore и мониторинг

- Финальный backup `2026-07-15_07-23` загружен в S3: PostgreSQL, Umami и
  Storage-архив. После внедрения watchdog выполнен ещё один успешный backup
  `2026-07-15_08-01`, который создал health-marker.
- Restore-test в отдельных временных БД прошёл: 3 проекта и 1 Umami website;
  Storage-архив успешно прочитан.
- Cron ночного backup включён.
- Внешние Timeweb-мониторы работают для Auth health, Umami heartbeat и
  свежести S3 backup; все три проверяются из двух регионов каждые 5 минут.
- Уведомления мониторинга включены; email-алерты VPS на 90% и 100% диска
  включены.
- Backup-watchdog публикует `/health/backup` только пока успешный backup
  не старше 26 часов; внешний монитор этого endpoint создаёт инцидент при
  просрочке.

## Операционное правило

Простой rollback на cloud больше не выполнять: после появления новых записей
на self-host сначала требуется backup обеих сторон и отдельный план слияния
дельт. Cloud не удалять; после месяца стабильной работы его можно только
поставить на паузу по runbook.
