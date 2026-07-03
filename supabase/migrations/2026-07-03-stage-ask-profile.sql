-- =============================================================================
-- Миграция 2026-07-03 — продуктовый слой роста (docs/09-growth-plan.md)
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
-- Добавляет: стадию проекта, запрос «что ищу», категорию комментария,
-- навыки и «открыт к…» в профиле. RLS-политик не меняет (колонки покрыты
-- существующими row-level политиками).
-- Идемпотентно: add column if not exists + drop constraint if exists.
-- =============================================================================

-- ---------- projects: стадия и запрос ----------
alter table public.projects
  add column if not exists stage text,
  add column if not exists looking_for text[] not null default '{}';

alter table public.projects
  drop constraint if exists projects_stage_check;
alter table public.projects
  add constraint projects_stage_check
  check (stage is null or stage in
    ('idea','prototype','mvp','users','commercial'));

alter table public.projects
  drop constraint if exists projects_looking_for_check;
alter table public.projects
  add constraint projects_looking_for_check
  check (looking_for <@ array[
    'feedback','testers','designer','developer','cofounder','client','investor'
  ]::text[]);

-- ---------- comments: категория фидбека ----------
alter table public.comments
  add column if not exists kind text;

alter table public.comments
  drop constraint if exists comments_kind_check;
alter table public.comments
  add constraint comments_kind_check
  check (kind is null or kind in
    ('ux','idea','bug','market','contact','collab'));

-- ---------- profiles: навыки и «открыт к…» ----------
alter table public.profiles
  add column if not exists skills text[] not null default '{}',
  add column if not exists open_to text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_open_to_check;
alter table public.profiles
  add constraint profiles_open_to_check
  check (open_to <@ array['collab','orders','team']::text[]);

-- =============================================================================
-- ГОТОВО. Проверка:
--   select stage, looking_for from public.projects limit 1;
--   select kind from public.comments limit 1;
--   select skills, open_to from public.profiles limit 1;
-- Словарь значений (единый источник для фронта — см. T12/T13/T14):
--   stage:       idea | prototype | mvp | users | commercial
--   looking_for: feedback | testers | designer | developer | cofounder | client | investor
--   kind:        ux | idea | bug | market | contact | collab
--   open_to:     collab | orders | team
-- =============================================================================
