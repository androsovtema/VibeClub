-- =============================================================================
-- Миграция 2026-07-06 — закрытие эскалации привилегий (OWASP-ревью, T-SEC1)
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
--
-- Находка 1 (HIGH): profiles_update_self разрешает обновить СВОЮ строку,
--   но RLS не ограничивает колонки — любой залогиненный мог сделать
--   update({ role: 'admin' }) на себе и получить полный доступ к модерации
--   (is_admin() читает эту же колонку).
-- Находка 2 (LOW): projects_update_own_pending аналогично позволяла автору
--   выставить себе is_core (публичный бейдж «команда We Designerz»)
--   на pending-проекте; при одобрении флаг уезжал в паблик.
--
-- Фикс: BEFORE UPDATE триггеры, запрещающие менять привилегированные колонки
-- (profiles.role, projects.is_core) всем, кроме админа. Прямой SQL из
-- SQL Editor / service_role (auth.uid() is null) — пропускается, поэтому
-- бутстрап первого админа по-прежнему возможен, но ТОЛЬКО из SQL Editor,
-- не из браузерной консоли.
-- Идемпотентно: create or replace + drop trigger if exists.
-- =============================================================================

-- ВНИМАНИЕ: имя таблицы — во внешнем if (см. фикс-миграцию 2026-07-06-…-fix.sql):
-- SQL не гарантирует короткое замыкание AND, `new.is_core` на profiles кидает
-- «record new has no field is_core». Не сливать tg_table_name и поле в одно AND.
create or replace function public.protect_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Прямой SQL (SQL Editor, service_role): auth.uid() is null — не ограничиваем.
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

-- =============================================================================
-- ГОТОВО. Проверка (из браузерной консоли под ОБЫЧНОЙ учёткой):
--   await supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)
--     → error «role can only be changed by an admin», role в БД не изменился.
--   await supabase.from('projects').update({ is_core: true }).eq('id', myPendingId)
--     → error «is_core can only be changed by an admin».
--   Обычное редактирование профиля (bio/skills) и pending-проекта — работает.
--   Админ через admin.html: publish/reject и тумблер is_core — работают
--     (is_admin() = true, триггер пропускает).
-- Бутстрап админа теперь только из SQL Editor:
--   update public.profiles set role='admin' where id = '<uuid из auth.users>';
-- =============================================================================
