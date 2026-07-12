-- =============================================================================
-- We Designerz — схема БД + RLS
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
-- Безопасность: anon-ключ публичен, поэтому ВСЯ защита строится на RLS ниже.
-- Идемпотентно в разумных пределах (drop policy if exists перед create).
-- ВАЖНО: `create table if not exists` не добавит колонки в уже созданную БД —
-- на живой базе новые поля накатываются миграциями из supabase/migrations/
-- (последняя: 2026-07-11-antispam-limits.sql — лимиты длины/массивов, cooldown
-- комментариев, hardening триггерных функций).
-- =============================================================================

-- ---------- Расширения ----------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =============================================================================
-- ХЕЛПЕРЫ (нужны до CHECK-ограничений в таблицах ниже)
-- =============================================================================
-- Длина каждого элемента text[] — подзапросы в CHECK запрещены Postgres,
-- поэтому длину элементов массива (tags/tools/skills) проверяем immutable-функцией.
create or replace function public.array_elems_fit(arr text[], max_len int)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(char_length(x) <= max_len), true) from unnest(arr) x
$$;

-- =============================================================================
-- ТАБЛИЦЫ
-- =============================================================================

-- ---------- profiles (расширение auth.users) ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text
                  constraint profiles_display_name_len
                  check (display_name is null or char_length(display_name) <= 60),
  avatar_url    text
                  constraint profiles_avatar_url_len
                  check (avatar_url is null or char_length(avatar_url) <= 500),
  bio           text
                  constraint profiles_bio_len
                  check (bio is null or char_length(bio) <= 500),
  telegram      text check (char_length(telegram) <= 100),
  website       text check (char_length(website) <= 300),
  github        text check (char_length(github) <= 100),
  phone         text check (char_length(phone) <= 30),
  email_public  text check (char_length(email_public) <= 200),
  custom_link_label text check (char_length(custom_link_label) <= 60),
  custom_link_url   text check (char_length(custom_link_url) <= 300),
  role          text not null default 'member'
                  check (role in ('member','core','admin')),
  skills        text[] not null default '{}'
                  constraint profiles_skills_max
                  check (coalesce(array_length(skills, 1), 0) <= 12
                         and public.array_elems_fit(skills, 24)),
  open_to       text[] not null default '{}'
                  check (open_to <@ array['collab','orders','team']::text[]),
  created_at    timestamptz not null default now()
);

-- ---------- projects ----------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles(id) on delete cascade,
  title        text not null
                 constraint projects_title_len
                 check (char_length(title) <= 80),
  description  text
                 constraint projects_description_len
                 check (description is null or char_length(description) <= 5000),
  cover_url    text
                 constraint projects_cover_url_len
                 check (cover_url is null or char_length(cover_url) <= 500),
  images       text[] not null default '{}'
                 constraint projects_images_max
                 check (coalesce(array_length(images, 1), 0) <= 9),
  project_url  text
                 constraint projects_project_url_len
                 check (project_url is null or char_length(project_url) <= 300),
  tags         text[] not null default '{}'
                 constraint projects_tags_max
                 check (coalesce(array_length(tags, 1), 0) <= 10
                        and public.array_elems_fit(tags, 30)),
  tools        text[] not null default '{}'
                 constraint projects_tools_max
                 check (coalesce(array_length(tools, 1), 0) <= 10
                        and public.array_elems_fit(tools, 30)),
  stage        text
                 check (stage is null or stage in
                   ('idea','prototype','mvp','users','commercial')),
  looking_for  text[] not null default '{}'
                 check (looking_for <@ array[
                   'feedback','testers','designer','developer',
                   'cofounder','client','investor']::text[]),
  status       text not null default 'pending'
                 check (status in ('pending','published','rejected')),
  is_core      boolean not null default false,
  upvotes      integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists projects_status_created_idx
  on public.projects (status, created_at desc);
create index if not exists projects_author_idx on public.projects (author_id);

-- ---------- comments ----------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null
                constraint comments_body_len
                check (char_length(body) <= 2000),
  kind        text
                check (kind is null or kind in
                  ('ux','idea','bug','market','contact','collab')),
  status      text not null default 'published'
                check (status in ('published','hidden')),
  created_at  timestamptz not null default now()
);
create index if not exists comments_project_idx on public.comments (project_id, created_at);
create index if not exists comments_author_idx on public.comments (author_id);

-- ---------- project_upvotes (уникальный лайк на пользователя) ----------
create table if not exists public.project_upvotes (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists upvotes_user_idx on public.project_upvotes (user_id);

-- ---------- feedback («Нашли проблему?», T22) ----------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  page        text not null check (char_length(page) <= 300),
  message     text not null check (char_length(message) between 10 and 2000),
  contact     text check (char_length(contact) <= 200),
  status      text not null default 'new' check (status in ('new','done'))
);
create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);

-- =============================================================================
-- ФУНКЦИИ И ТРИГГЕРЫ
-- =============================================================================

-- ---------- Проверка админа (SECURITY DEFINER — минует RLS, без рекурсии) ----------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- При регистрации в auth.users создаём profiles ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Пересчёт счётчика upvotes ----------
create or replace function public.sync_project_upvotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
begin
  update public.projects
    set upvotes = (select count(*) from public.project_upvotes where project_id = pid)
    where id = pid;
  return null;
end;
$$;

drop trigger if exists trg_upvotes_sync on public.project_upvotes;
create trigger trg_upvotes_sync
  after insert or delete on public.project_upvotes
  for each row execute function public.sync_project_upvotes();

-- ---------- Защита привилегированных колонок (T-SEC1, OWASP-ревью 2026-07-06) ----------
-- RLS ограничивает строки, но не колонки: без этого триггера любой залогиненный
-- мог выставить себе profiles.role='admin' (эскалация до модератора) или
-- projects.is_core=true (бейдж «команда»). Прямой SQL из SQL Editor /
-- service_role (auth.uid() is null) пропускается — бутстрап админа возможен
-- только оттуда, не из браузерной консоли.
-- ВНИМАНИЕ: имя таблицы — во внешнем if. Поле упоминается только в своей ветке:
-- SQL не гарантирует короткое замыкание AND, и `new.is_core` на таблице profiles
-- (или `new.role` на projects) кидает «record new has no field …». Не сливать
-- проверку tg_table_name и обращение к полю в одно выражение.
create or replace function public.protect_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    if new.role is distinct from old.role and not public.is_admin() then
      raise exception 'role can only be changed by an admin';
    end if;
  elsif tg_table_name = 'projects' then
    if new.is_core is distinct from old.is_core and not public.is_admin() then
      raise exception 'is_core can only be changed by an admin';
    end if;
    if new.status is distinct from old.status and not public.is_admin() then
      raise exception 'status can only be changed by an admin';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profiles_role on public.profiles;
create trigger trg_protect_profiles_role
  before update on public.profiles
  for each row execute function public.protect_privileged_columns();

drop trigger if exists trg_protect_projects_is_core on public.projects;
create trigger trg_protect_projects_is_core
  before update on public.projects
  for each row execute function public.protect_privileged_columns();

-- ---------- Cooldown на комментарии (T18, антиспам) ----------
-- Не чаще 1/20сек и 30/час на автора. Апвоуты намеренно не троттлим — составной
-- PK уже запрещает повторный голос, а cooldown там ухудшил бы обычный UX.
-- Сообщение исключения — машиночитаемый маркер (comment_cooldown /
-- comment_hourly_limit), клиент распознаёт его в error.message и показывает
-- человеко-читаемый текст.
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

-- ---------- Hardening: закрыть триггерные функции от прямого REST-вызова ----------
-- Supabase Advisors (2026-07-11): SECURITY DEFINER-функции без явного revoke
-- торчат в /rest/v1/rpc/... для anon/authenticated. Триггеры продолжают
-- работать — EXECUTE проверяется у владельца триггера, не у вызывающего.
-- is_admin() НЕ трогаем: вызывается в RLS-политиках от имени запрашивающего
-- пользователя, revoke сломает админские политики.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.protect_privileged_columns() from anon, authenticated;
revoke execute on function public.sync_project_upvotes() from anon, authenticated;
revoke execute on function public.enforce_comment_cooldown() from anon, authenticated;

-- =============================================================================
-- RLS — ВКЛЮЧЕНИЕ
-- =============================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.comments        enable row level security;
alter table public.project_upvotes enable row level security;
alter table public.feedback        enable row level security;

-- =============================================================================
-- RLS — ПОЛИТИКИ: profiles
-- =============================================================================
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- =============================================================================
-- RLS — ПОЛИТИКИ: projects
-- =============================================================================
drop policy if exists projects_select_published on public.projects;
create policy projects_select_published on public.projects
  for select using (status = 'published');

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select using (author_id = auth.uid());

drop policy if exists projects_select_admin on public.projects;
create policy projects_select_admin on public.projects
  for select using (public.is_admin());

-- Вставлять можно только свой проект и только в статусе pending (нельзя самопубликоваться)
drop policy if exists projects_insert_own_pending on public.projects;
create policy projects_insert_own_pending on public.projects
  for insert with check (author_id = auth.uid() and status = 'pending');

-- Автор правит свой проект в любом статусе (текст/обложку/теги). Смену status и
-- is_core перехватывает триггер protect_privileged_columns (только админ).
drop policy if exists projects_update_own_pending on public.projects;
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Админ может всё (публикация/отклонение/is_core)
drop policy if exists projects_update_admin on public.projects;
create policy projects_update_admin on public.projects
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists projects_delete_own_or_admin on public.projects;
create policy projects_delete_own_or_admin on public.projects
  for delete using (author_id = auth.uid() or public.is_admin());

-- =============================================================================
-- RLS — ПОЛИТИКИ: comments
-- =============================================================================
-- Публичные комменты под опубликованными проектами видят все; свои и админ — всегда
drop policy if exists comments_select_public on public.comments;
create policy comments_select_public on public.comments
  for select using (
    (status = 'published'
      and exists (select 1 from public.projects p
                  where p.id = project_id and p.status = 'published'))
    or author_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert with check (author_id = auth.uid());

drop policy if exists comments_update_own_or_admin on public.comments;
create policy comments_update_own_or_admin on public.comments
  for update using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists comments_delete_own_or_admin on public.comments;
create policy comments_delete_own_or_admin on public.comments
  for delete using (author_id = auth.uid() or public.is_admin());

-- =============================================================================
-- RLS — ПОЛИТИКИ: project_upvotes
-- =============================================================================
drop policy if exists upvotes_select_all on public.project_upvotes;
create policy upvotes_select_all on public.project_upvotes
  for select using (true);

drop policy if exists upvotes_insert_self on public.project_upvotes;
create policy upvotes_insert_self on public.project_upvotes
  for insert with check (user_id = auth.uid());

drop policy if exists upvotes_delete_self on public.project_upvotes;
create policy upvotes_delete_self on public.project_upvotes
  for delete using (user_id = auth.uid());

-- =============================================================================
-- RLS — ПОЛИТИКИ: feedback
-- =============================================================================
-- Отправить может кто угодно (гость или залогиненный), но за себя: либо
-- user_id = null (аноним), либо свой собственный auth.uid() — чужой uid
-- подставить нельзя.
drop policy if exists feedback_insert_anyone on public.feedback;
create policy feedback_insert_anyone on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Читать и разбирать список может только админ.
drop policy if exists feedback_select_admin on public.feedback;
create policy feedback_select_admin on public.feedback
  for select using (public.is_admin());

-- Менять (закрывать, status → 'done') может только админ.
drop policy if exists feedback_update_admin on public.feedback;
create policy feedback_update_admin on public.feedback
  for update using (public.is_admin()) with check (public.is_admin());

-- Удалять нельзя никому — политики delete нет.

-- =============================================================================
-- STORAGE — bucket для обложек
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- Читать обложки может кто угодно (bucket публичный)
drop policy if exists covers_read on storage.objects;
create policy covers_read on storage.objects
  for select using (bucket_id = 'covers');

-- Загружать/менять/удалять — только авторизованные, в своей папке (первый сегмент = uid)
drop policy if exists covers_insert_auth on storage.objects;
create policy covers_insert_auth on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists covers_update_own on storage.objects;
create policy covers_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists covers_delete_own on storage.objects;
create policy covers_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- ГОТОВО. Проверка (критерии T0):
--  - аноним не может вставить projects со status='published';
--  - аноним не может писать в чужой profiles;
--  - авторизованный вставляет проект только с author_id=свой uid и status='pending'.
-- Как назначить себя админом (после первой регистрации), выполнить разово
-- ИЗ SQL EDITOR (из браузера отобьёт триггер trg_protect_profiles_role):
--   update public.profiles set role='admin' where id = '<uuid из auth.users>';
--   (uuid смотреть: select id, email from auth.users;)
-- =============================================================================
