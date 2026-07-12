# Промпт для Sonnet — задача T18 (антиспам и серверные лимиты, P0 до анонса)

> Скопируй всё под чертой в сессию Sonnet. Работать на ветке `main`
> (`git branch --show-current` должно = `main`, репо `androsovtema/VibeClub`).
> Отвечай по-русски.

---

Проект We Designerz — статический сайт-клуб вайбкодеров, без сборки, GitHub Pages,
бэкенд Supabase (защита данных — только RLS, `anon`-ключ публичен). Прочитай:
`CLAUDE.md`, `docs/08-workflow.md`, `supabase/schema.sql`, задачу T18 в
`docs/04-tasks-sonnet.md`. Локально: `python3 -m http.server 8080` →
`http://localhost:8080/index.html` (не `file://`, не `npm run dev`).

## Зачем

RLS защищает права на строки, но не сдерживает злоупотребление. Сейчас все `check`
в `supabase/schema.sql` — только enum/whitelist массивов; ни одного ограничения длины
на text-полях, rate limit отсутствует. Авторизованный пользователь может слать
мегабайтные комментарии в цикле. Вердикт аудита:
`audits/current-review/2026-07-10-verdict.md`.

## Выход

Новая **идемпотентная** миграция `supabase/migrations/2026-07-11-antispam-limits.sql`
(каждый constraint через `drop constraint if exists` + `add constraint`, функции через
`create or replace`) **плюс синхронизация `supabase/schema.sql`** (чистая база должна
получаться такой же). Применять миграцию будет Тёма в SQL Editor — в конце работы дай
ему короткую инструкцию.

### 1. Лимиты длины text-полей (уровень БД)

Единый источник правды — БД; клиентские `maxlength` обязаны совпадать. Таблица
соответствия — в комментарии в начале миграции.

| Таблица.поле | Лимит | Клиент сейчас |
|---|---|---|
| `profiles.display_name` | 60 | `me.html` maxlength=60 ✓ |
| `profiles.bio` | 500 | `me.html` textarea — **добавить maxlength=500** |
| `profiles.telegram` | 60 | `me.html` maxlength=60 ✓ |
| `profiles.website` | 200 | `me.html` maxlength=200 ✓ |
| `profiles.avatar_url` | 500 | ставится кодом |
| `projects.title` | 80 | `submit.html` maxlength=80 ✓ |
| `projects.description` | 5000 | `submit.html` textarea — **добавить maxlength=5000** |
| `projects.project_url` | 300 | добавить maxlength в форму |
| `projects.cover_url` | 500 | ставится кодом (storage URL) |
| `comments.body` | 2000 | `project.html` textarea — **добавить maxlength=2000** |

Формат: `check (поле is null or char_length(поле) <= N)` (для not null — без `is null`).
Именованные constraint'ы (`profiles_bio_len` и т.п.) — чтобы миграция была идемпотентной
и ошибки читались.

Проверь формы редактирования: правка проекта (`submit.js`, route A) и инлайн-правка
комментария (`project.js`, `createEl`/textarea в `startEditComment`) — там тоже нужен
maxlength/обрезка, иначе legit-правка упрётся в БД без внятной ошибки.

### 2. Лимиты массивов

По образцу существующего `projects_images_max`:

- `projects.tags` — ≤ 10 элементов, каждый ≤ 30 символов;
- `projects.tools` — ≤ 10 элементов, каждый ≤ 30 (UI кастом-инпут maxlength=30 ✓);
- `profiles.skills` — ≤ 12 элементов, каждый ≤ 24 (UI maxlength=24 ✓);
- `looking_for`, `open_to` — уже ограничены whitelist-`<@`, счётчик не нужен.

**Важно:** подзапросы в `CHECK` нельзя. Для проверки длины элементов сделай immutable
helper-функцию, например:

```sql
create or replace function public.array_elems_fit(arr text[], max_len int)
returns boolean language sql immutable as $$
  select coalesce(bool_and(char_length(x) <= max_len), true) from unnest(arr) x
$$;
```

(если `bool_and` по unnest внутри sql-функции упрётся — эквивалент через
`not exists (select 1 from unnest(arr) x where char_length(x) > max_len)`).
Клиентские ограничения на количество (10 тегов/тулзов, 12 скиллов) добавь в формы
с инлайн-ошибкой до отправки.

### 3. Cooldown на комментарии (только на них)

Серверный, БД-триггер `before insert on public.comments`:

- не чаще **1 комментария в 20 секунд** на пользователя;
- не больше **30 комментариев в час** на пользователя.

Функция триггера — `security definer`, `set search_path = public` (по образцу
существующей `protect_privileged_columns` в `schema.sql`). При нарушении —
`raise exception` с машиночитаемым текстом, например `comment_cooldown` /
`comment_hourly_limit`, чтобы клиент мог распознать.

Клиент (`js/project.js`, отправка и сохранение правки комментария): ошибку с этими
маркерами показывать человеко-читаемо в существующем инлайн-элементе ошибки
(«Подожди немного между комментариями» / «Слишком много комментариев за час,
вернись позже»), без необработанного падения в консоль.

**Апвоуты не трогаем** — составной PK уже запрещает повторный голос; cooldown там
ухудшит UX и не остановит мультиаккаунты.

### 4. Мелкое hardening по Supabase Advisors (в ту же миграцию)

Проверка живой базы (2026-07-11) дала варнинги линтера Supabase — почини заодно:

- **Revoke EXECUTE на триггерные функции** от `anon` и `authenticated`:
  `handle_new_user`, `protect_privileged_columns`, `sync_project_upvotes`,
  `rls_auto_enable`. Сейчас они торчат в REST API (`/rest/v1/rpc/...`) как
  SECURITY DEFINER. Прямой вызов триггерной функции Postgres и так отбивает,
  но незачем светить их в API. Триггеры продолжат работать: право EXECUTE
  проверяется у владельца триггера, не у вызывающего.
  **`is_admin()` НЕ трогать** — она вызывается в RLS-политиках от имени
  запрашивающего пользователя; revoke сломает админские политики.
- **Два индекса на FK без покрытия** (perf-advisor):
  `create index if not exists comments_author_idx on public.comments (author_id);`
  `create index if not exists upvotes_user_idx on public.project_upvotes (user_id);`

НЕ чинить в этой задаче (осознанно отложено): `auth_rls_initplan` /
`multiple_permissive_policies` (переписывание RLS-политик под
`(select auth.uid())` — отдельная задача при живой нагрузке, сейчас строк
единицы), листинг публичного бакета `covers` (обложки и так публичны).

### 5. Подтверждение почты — НЕ код, только документация

Это конфигурация Supabase Auth руками Тёмы: перед продом включить **Confirm Email**,
выключить тестовый **Auto Confirm**. В код ничего не добавлять; **не** проверять
`email_confirmed_at` через `auth.jwt()` в RLS (claim не гарантирован). Твоя часть:
проверь, что этот шаг явно есть в чек-листе `docs/05-launch.md`, при отсутствии —
добавь пункт.

## Чего НЕ делать

- Не менять RLS-политики и `protect_privileged_columns` (закрыто в T-SEC1).
- Не вводить капчи, Edge Functions, внешние сервисы.
- Не throttle'ить апвоуты и сабмиты проектов (модерация pending уже фильтрует).
- Ничего сверх задачи.

## Приёмка

- Превышение длины отбивается **и БД** (insert/update из консоли браузера под обычной
  учёткой — покажи, каким сниппетом проверял), **и формой** (maxlength + инлайн-ошибка).
- Серия быстрых комментариев упирается в серверный cooldown с внятной ошибкой в UI;
  31-й комментарий за час — то же (проверку часового лимита можно показать через
  временное занижение лимита в локальном тесте, но в миграции — 30).
- Легитимные сценарии не сломаны: сабмит проекта, правка проекта, коммент,
  правка/удаление коммента, апвоут без задержки, сохранение профиля в `me.html`.
- `schema.sql` и миграция дают одинаковый результат (constraint'ы совпадают).
- `npm run security-check` зелёный; линтеры 0 ошибок.
- Мобилка 375px: инлайн-ошибки форм не ломают layout.

Коммит один: `feat(T18): антиспам — лимиты длины/массивов в БД, cooldown комментариев`.
В конце — короткая инструкция Тёме: как применить миграцию в SQL Editor и что
включить/выключить в Auth-настройках перед продом.
