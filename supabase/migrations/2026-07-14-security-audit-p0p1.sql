-- =============================================================================
-- Security audit 2026-07-14 — закрытие находок зоны «репозиторий» (P0/P1)
-- Источник: audits/current-review/2026-07-14-security-audit.md
-- Зеркалит правки supabase/schema.sql. Идемпотентно, применять к живой БД
-- (cloud И self-hosted — оба бэкенда, см. SEC-12) после теста на staging.
-- =============================================================================

-- ---------- SEC-02: upvotes меняет только доверенный триггер ----------
create or replace function public.sync_project_upvotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
begin
  perform set_config('app.upvote_sync', 'on', true);
  update public.projects
    set upvotes = (select count(*) from public.project_upvotes where project_id = pid)
    where id = pid;
  return null;
end;
$$;

-- ---------- SEC-02 + SEC-11: защита служебных колонок ----------
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
    if new.upvotes is distinct from old.upvotes
       and current_setting('app.upvote_sync', true) is distinct from 'on' then
      raise exception 'upvotes can only be changed via project_upvotes';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'created_at is immutable';
    end if;
    if new.author_id is distinct from old.author_id then
      raise exception 'author_id is immutable';
    end if;
  elsif tg_table_name = 'comments' then
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

drop trigger if exists trg_protect_comments on public.comments;
create trigger trg_protect_comments
  before update on public.comments
  for each row execute function public.protect_privileged_columns();

-- ---------- SEC-03: revoke EXECUTE и от PUBLIC ----------
do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    revoke execute on function public.handle_new_user() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.protect_privileged_columns()') is not null then
    revoke execute on function public.protect_privileged_columns() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.sync_project_upvotes()') is not null then
    revoke execute on function public.sync_project_upvotes() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.enforce_comment_cooldown()') is not null then
    revoke execute on function public.enforce_comment_cooldown() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- ---------- SEC-04: серверные лимиты MIME/размера на bucket covers ----------
update storage.buckets
   set file_size_limit    = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'covers';

-- ---------- SEC-18: убрать анонимный листинг объектов ----------
-- Публичный bucket отдаёт файлы по прямому URL и без SELECT-политики.
drop policy if exists covers_read on storage.objects;
