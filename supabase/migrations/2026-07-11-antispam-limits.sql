-- =============================================================================
-- Миграция 2026-07-11 — антиспам и серверные лимиты (T18, P0 до анонса)
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
-- Идемпотентно: каждый constraint — drop constraint if exists + add constraint,
-- функции — create or replace, индексы/триггеры — if not exists / drop+create.
--
-- Соответствие лимитов БД ↔ клиента (единый источник правды — БД):
--   profiles.display_name   <= 60    me.html/submit не трогает — уже maxlength=60
--   profiles.bio             <= 500   me.html — добавлен maxlength=500
--   profiles.avatar_url      <= 500   ставится кодом (storage URL)
--   profiles.skills          <= 12 элементов, каждый <= 24 (UI cap 10, ниже лимита БД)
--   projects.title           <= 80    submit.html — maxlength=80 (было)
--   projects.description     <= 5000  submit.html — добавлен maxlength=5000
--   projects.project_url     <= 300   submit.html — добавлен maxlength=300
--   projects.cover_url       <= 500   ставится кодом (storage URL)
--   projects.tags            <= 10 элементов по <= 30 (фиксированный список категорий)
--   projects.tools           <= 10 элементов по <= 30 (UI custom-инпут maxlength=30 + счётчик)
--   comments.body             <= 2000 project.html — добавлен maxlength=2000
-- telegram/website/github/phone/email_public/custom_link_* — уже ограничены
-- миграцией 2026-07-12-profile-contacts.sql, здесь не трогаем.
-- =============================================================================

-- =============================================================================
-- 1. Хелпер: длина каждого элемента text[] (подзапросы в CHECK запрещены)
-- =============================================================================
create or replace function public.array_elems_fit(arr text[], max_len int)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(char_length(x) <= max_len), true) from unnest(arr) x
$$;

-- =============================================================================
-- 2. Лимиты длины text-полей
-- =============================================================================
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 60);

alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len
  check (bio is null or char_length(bio) <= 500);

alter table public.profiles drop constraint if exists profiles_avatar_url_len;
alter table public.profiles add constraint profiles_avatar_url_len
  check (avatar_url is null or char_length(avatar_url) <= 500);

alter table public.projects drop constraint if exists projects_title_len;
alter table public.projects add constraint projects_title_len
  check (char_length(title) <= 80);

alter table public.projects drop constraint if exists projects_description_len;
alter table public.projects add constraint projects_description_len
  check (description is null or char_length(description) <= 5000);

alter table public.projects drop constraint if exists projects_project_url_len;
alter table public.projects add constraint projects_project_url_len
  check (project_url is null or char_length(project_url) <= 300);

alter table public.projects drop constraint if exists projects_cover_url_len;
alter table public.projects add constraint projects_cover_url_len
  check (cover_url is null or char_length(cover_url) <= 500);

alter table public.comments drop constraint if exists comments_body_len;
alter table public.comments add constraint comments_body_len
  check (char_length(body) <= 2000);

-- =============================================================================
-- 3. Лимиты массивов (по образцу существующего projects_images_max)
-- =============================================================================
alter table public.projects drop constraint if exists projects_tags_max;
alter table public.projects add constraint projects_tags_max
  check (coalesce(array_length(tags, 1), 0) <= 10 and public.array_elems_fit(tags, 30));

alter table public.projects drop constraint if exists projects_tools_max;
alter table public.projects add constraint projects_tools_max
  check (coalesce(array_length(tools, 1), 0) <= 10 and public.array_elems_fit(tools, 30));

alter table public.profiles drop constraint if exists profiles_skills_max;
alter table public.profiles add constraint profiles_skills_max
  check (coalesce(array_length(skills, 1), 0) <= 12 and public.array_elems_fit(skills, 24));

-- =============================================================================
-- 4. Cooldown на комментарии: 1/20сек и 30/час на автора (апвоуты не трогаем)
-- =============================================================================
create or replace function public.enforce_comment_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_at timestamptz;
  hourly_count integer;
begin
  select max(created_at) into last_at
    from public.comments
    where author_id = new.author_id;

  if last_at is not null and now() - last_at < interval '20 seconds' then
    raise exception 'comment_cooldown';
  end if;

  select count(*) into hourly_count
    from public.comments
    where author_id = new.author_id
      and created_at > now() - interval '1 hour';

  if hourly_count >= 30 then
    raise exception 'comment_hourly_limit';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_comment_cooldown on public.comments;
create trigger trg_comment_cooldown
  before insert on public.comments
  for each row execute function public.enforce_comment_cooldown();

-- =============================================================================
-- 5. Hardening по Supabase Advisors (2026-07-11)
-- =============================================================================
-- Revoke EXECUTE на триггерные SECURITY DEFINER функции от anon/authenticated —
-- триггеры продолжат работать (EXECUTE проверяется у владельца триггера, не
-- у вызывающего), но функции перестанут торчать в /rest/v1/rpc/... .
-- is_admin() НЕ трогаем: она вызывается в RLS-политиках от имени запрашивающего
-- пользователя, revoke сломает админские политики.
-- rls_auto_enable — обёрнут в to_regprocedure: на некоторых базах его может не
-- быть, прямой revoke на несуществующую функцию упал бы ошибкой.
do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    revoke execute on function public.handle_new_user() from anon, authenticated;
  end if;
  if to_regprocedure('public.protect_privileged_columns()') is not null then
    revoke execute on function public.protect_privileged_columns() from anon, authenticated;
  end if;
  if to_regprocedure('public.sync_project_upvotes()') is not null then
    revoke execute on function public.sync_project_upvotes() from anon, authenticated;
  end if;
  if to_regprocedure('public.enforce_comment_cooldown()') is not null then
    revoke execute on function public.enforce_comment_cooldown() from anon, authenticated;
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end $$;

-- Два индекса на FK без покрытия (perf-advisor)
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists upvotes_user_idx on public.project_upvotes (user_id);

-- =============================================================================
-- ГОТОВО. Проверка:
--  - update/insert из консоли браузера под обычной учёткой со значением длиннее
--    лимита (например title длиной 100 символов) — отбивает check;
--  - insert массива tags/tools длиннее 10 элементов или skills длиннее 12 —
--    отбивает check;
--  - подряд 2 инсерта в comments быстрее 20 сек — второй падает с
--    'comment_cooldown'; 31-й инсерт за час — с 'comment_hourly_limit'
--    (проверять точный часовой лимит можно временным занижением константы
--    в тестовом прогоне — в файле оставлено 30);
--  - обычный сабмит/коммент/апвоут/правка профиля работают без изменений;
--  - повторный прогон миграции целиком — без ошибок (идемпотентно).
-- =============================================================================
