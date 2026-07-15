-- =============================================================================
-- We Designerz — схема БД + RLS
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
-- Безопасность: anon-ключ публичен, поэтому ВСЯ защита строится на RLS ниже.
-- Идемпотентно в разумных пределах (drop policy if exists перед create).
-- ВАЖНО: `create table if not exists` не добавит колонки в уже созданную БД —
-- на живой базе новые поля накатываются миграциями из supabase/migrations/
-- (последняя: 20260715091536_t_consent_01_user_consents.sql — приватный журнал
-- согласий, signup-доказательство и DB-гейт публичных контактов).
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

-- Разрешённая версия политики для signup и публикации контактов. Закрыта от
-- RPC ниже; синхронизацию literal с js/consent.js проверяет npm run check.
create or replace function public.current_privacy_policy_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'privacy-2026-07-15-v2'::text
$$;

revoke execute on function public.current_privacy_policy_version()
  from public, anon, authenticated;

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

-- ---------- приватный журнал согласий (T-CONSENT) ----------
create table if not exists public.user_consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  consent_type   text not null
                   constraint user_consents_type_check
                   check (consent_type in ('processing', 'dissemination')),
  policy_version text not null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  scope          jsonb not null default '{}'::jsonb,
  subject_full_name text,
  subject_contact   text,
  constraint user_consents_revocation_time_check
    check (revoked_at is null or revoked_at >= granted_at),
  constraint user_consents_scope_object_check
    check (jsonb_typeof(scope) = 'object'),
  constraint user_consents_dissemination_identity_check
    check (
      consent_type <> 'dissemination'
      or (
        subject_full_name is not null
        and subject_contact is not null
        and char_length(subject_full_name) between 3 and 200
        and btrim(subject_full_name)
          ~ '^[^[:space:]]+([[:space:]]+[^[:space:]]+)+$'
        and char_length(subject_contact) between 3 and 320
      )
    )
);
create index if not exists user_consents_user_idx
  on public.user_consents (user_id);
create unique index if not exists user_consents_one_active_type_idx
  on public.user_consents (user_id, consent_type)
  where revoked_at is null;

revoke all on table public.user_consents from anon, authenticated;
grant select on table public.user_consents to authenticated;

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

-- ---------- При регистрации создаём profiles + processing-consent ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'privacy_policy_version', '')
       <> public.current_privacy_policy_version() then
    raise exception using
      errcode = 'P0001',
      message = 'processing_consent_version_invalid';
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_consents (
    user_id, consent_type, policy_version, scope
  ) values (
    new.id,
    'processing',
    public.current_privacy_policy_version(),
    jsonb_build_object('purpose', 'club_account_and_services')
  )
  on conflict (user_id, consent_type) where revoked_at is null do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPC: выдать/отозвать dissemination-consent ----------
drop function if exists public.grant_profile_dissemination();
create or replace function public.grant_profile_dissemination(subject_full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  consent_id uuid;
  normalized_full_name text := regexp_replace(
    btrim(subject_full_name), '[[:space:]]+', ' ', 'g'
  );
  verified_contact text;
begin
  if caller_id is null then
    raise exception using
      errcode = '28000',
      message = 'consent_auth_required';
  end if;

  if nullif(normalized_full_name, '') is null
     or char_length(normalized_full_name) not between 3 and 200
     or normalized_full_name
       !~ '^[^[:space:]]+([[:space:]]+[^[:space:]]+)+$' then
    raise exception using
      errcode = '22023',
      message = 'consent_subject_full_name_invalid';
  end if;

  select lower(u.email)
    into verified_contact
    from auth.users as u
   where u.id = caller_id;

  if nullif(btrim(verified_contact), '') is null then
    raise exception using
      errcode = '22023',
      message = 'consent_subject_contact_missing';
  end if;

  perform 1 from public.profiles where id = caller_id for update;

  select uc.id into consent_id
    from public.user_consents as uc
   where uc.user_id = caller_id
     and uc.consent_type = 'dissemination'
     and uc.policy_version = public.current_privacy_policy_version()
     and uc.revoked_at is null
     and uc.subject_full_name = normalized_full_name
     and uc.subject_contact = verified_contact
     and uc.scope = jsonb_build_object(
       'fields', jsonb_build_array(
         'telegram', 'website', 'github', 'phone', 'email_public',
         'custom_link_label', 'custom_link_url'
       ),
       'purpose', 'public_profile'
     )
   for update;

  if consent_id is not null then
    return consent_id;
  end if;

  update public.user_consents
     set revoked_at = now()
   where user_id = caller_id
     and consent_type = 'dissemination'
     and revoked_at is null;

  insert into public.user_consents (
    user_id, consent_type, policy_version, scope,
    subject_full_name, subject_contact
  ) values (
    caller_id,
    'dissemination',
    public.current_privacy_policy_version(),
    jsonb_build_object(
      'fields', jsonb_build_array(
        'telegram', 'website', 'github', 'phone', 'email_public',
        'custom_link_label', 'custom_link_url'
      ),
      'purpose', 'public_profile'
    ),
    normalized_full_name,
    verified_contact
  )
  returning id into consent_id;

  return consent_id;
end;
$$;

revoke execute on function public.grant_profile_dissemination(text)
  from public, anon;
grant execute on function public.grant_profile_dissemination(text)
  to authenticated;

create or replace function public.revoke_profile_dissemination()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception using
      errcode = '28000',
      message = 'consent_auth_required';
  end if;

  -- Сериализуем revoke с grant для одного пользователя.
  perform 1 from public.profiles where id = caller_id for update;

  update public.user_consents
     set revoked_at = now()
   where user_id = caller_id
     and consent_type = 'dissemination'
     and revoked_at is null;

  update public.profiles
     set telegram = null,
         website = null,
         github = null,
         phone = null,
         email_public = null,
         custom_link_label = null,
         custom_link_url = null
   where id = caller_id;
end;
$$;

revoke execute on function public.revoke_profile_dissemination()
  from public, anon;
grant execute on function public.revoke_profile_dissemination()
  to authenticated;

-- ---------- DB-гейт публичных контактов ----------
create or replace function public.protect_profile_contacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if nullif(btrim(new.telegram), '') is null
     and nullif(btrim(new.website), '') is null
     and nullif(btrim(new.github), '') is null
     and nullif(btrim(new.phone), '') is null
     and nullif(btrim(new.email_public), '') is null
     and nullif(btrim(new.custom_link_label), '') is null
     and nullif(btrim(new.custom_link_url), '') is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_consents as uc
     where uc.user_id = new.id
       and uc.consent_type = 'dissemination'
       and uc.policy_version = public.current_privacy_policy_version()
       and uc.revoked_at is null
       and uc.scope = jsonb_build_object(
         'fields', jsonb_build_array(
           'telegram', 'website', 'github', 'phone', 'email_public',
           'custom_link_label', 'custom_link_url'
         ),
         'purpose', 'public_profile'
       )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'dissemination_consent_required';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_contacts on public.profiles;
create trigger trg_protect_profile_contacts
  before insert or update of
    telegram, website, github, phone, email_public,
    custom_link_label, custom_link_url
  on public.profiles
  for each row execute function public.protect_profile_contacts();

-- Существующие контакты нельзя считать согласованными задним числом. На live
-- это выполняется только migration T-CONSENT-02 после backup и подсчёта строк.
update public.profiles
   set telegram = null,
       website = null,
       github = null,
       phone = null,
       email_public = null,
       custom_link_label = null,
       custom_link_url = null
 where (
       nullif(btrim(telegram), '') is not null
    or nullif(btrim(website), '') is not null
    or nullif(btrim(github), '') is not null
    or nullif(btrim(phone), '') is not null
    or nullif(btrim(email_public), '') is not null
    or nullif(btrim(custom_link_label), '') is not null
    or nullif(btrim(custom_link_url), '') is not null
 )
   and not exists (
     select 1
       from public.user_consents as uc
      where uc.user_id = profiles.id
        and uc.consent_type = 'dissemination'
        and uc.policy_version = public.current_privacy_policy_version()
        and uc.revoked_at is null
        and uc.scope = jsonb_build_object(
          'fields', jsonb_build_array(
            'telegram', 'website', 'github', 'phone', 'email_public',
            'custom_link_label', 'custom_link_url'
          ),
          'purpose', 'public_profile'
        )
   );

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
  -- Транзакционный флаг: разрешает protect_privileged_columns менять
  -- projects.upvotes именно из этого доверенного триггера. Прямой UPDATE
  -- upvotes из браузера флага не ставит и будет отбит (SEC-02).
  perform set_config('app.upvote_sync', 'on', true);
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
    -- Служебное поле: клиент не должен переписывать дату создания (SEC-11).
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is immutable';
    end if;
  elsif tg_table_name = 'projects' then
    if new.is_core is distinct from old.is_core and not public.is_admin() then
      raise exception 'is_core can only be changed by an admin';
    end if;
    if new.status is distinct from old.status and not public.is_admin() then
      raise exception 'status can only be changed by an admin';
    end if;
    -- upvotes меняет только доверенный триггер sync_project_upvotes, который
    -- выставляет транзакционный флаг app.upvote_sync. Прямая накрутка из REST
    -- отбивается (SEC-02).
    if new.upvotes is distinct from old.upvotes
       and current_setting('app.upvote_sync', true) is distinct from 'on' then
      raise exception 'upvotes can only be changed via project_upvotes';
    end if;
    -- Неизменяемые служебные поля (SEC-11).
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is immutable';
    end if;
    if new.author_id is distinct from old.author_id then
      raise exception 'author_id is immutable';
    end if;
  elsif tg_table_name = 'comments' then
    -- Автор правит только текст своего комментария. Перепривязку к другому
    -- проекту, смену автора/даты и статус (модерация) блокируем (SEC-11).
    if new.project_id is distinct from old.project_id then
      raise exception 'project_id is immutable';
    end if;
    if new.author_id is distinct from old.author_id then
      raise exception 'author_id is immutable';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is immutable';
    end if;
    if new.status is distinct from old.status and not public.is_admin() then
      raise exception 'comment status can only be changed by an admin';
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

drop trigger if exists trg_protect_comments on public.comments;
create trigger trg_protect_comments
  before update on public.comments
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
-- SEC-03: revoke и от PUBLIC тоже. Default privileges выдают EXECUTE роли
-- PUBLIC, поэтому revoke только у anon/authenticated не закрывает вызов через
-- PostgREST. is_admin() намеренно не трогаем (вызывается в RLS-политиках).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_privacy_policy_version() from public, anon, authenticated;
revoke execute on function public.protect_profile_contacts() from public, anon, authenticated;
revoke execute on function public.protect_privileged_columns() from public, anon, authenticated;
revoke execute on function public.sync_project_upvotes() from public, anon, authenticated;
revoke execute on function public.enforce_comment_cooldown() from public, anon, authenticated;

-- =============================================================================
-- RLS — ВКЛЮЧЕНИЕ
-- =============================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.comments        enable row level security;
alter table public.project_upvotes enable row level security;
alter table public.feedback        enable row level security;
alter table public.user_consents   enable row level security;

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
-- RLS — ПОЛИТИКИ: user_consents (приватный журнал)
-- =============================================================================
drop policy if exists user_consents_select_self on public.user_consents;
create policy user_consents_select_self on public.user_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_consents from anon, authenticated;
grant select on table public.user_consents to authenticated;

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
-- SEC-05: только авторизованные и только со своим auth.uid() — honeypot и
-- cooldown в JS обходятся прямым REST, анонимный insert был открыт для спама.
drop policy if exists feedback_insert_anyone on public.feedback;
drop policy if exists feedback_insert_auth on public.feedback;
create policy feedback_insert_auth on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid());

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
-- SEC-04: серверные лимиты на bucket (браузерная проверка обходится прямым API).
-- Тип — только изображения, размер — 10 МБ. on conflict обновляет уже созданный.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SEC-18: НЕ даём anon SELECT-политику — иначе список объектов bucket утекает
-- через storage API. Публичный bucket всё равно отдаёт файлы по прямому URL без
-- SELECT-политики, поэтому обложки продолжают грузиться, а листинг закрыт.
drop policy if exists covers_read on storage.objects;

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
