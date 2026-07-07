-- =============================================================================
-- Миграция 2026-07-07 — редактирование своих проектов в любом статусе (route A)
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
--
-- Проблема: политика projects_update_own_pending пускала автора править проект
-- только пока он pending. Опубликованный проект автор отредактировать не мог.
--
-- Решение: автор правит свой проект (текст/обложку/теги) независимо от статуса,
-- но НЕ может менять status и is_core — это остаётся за админом. Смену этих
-- полей перехватывает триггер protect_privileged_columns (BEFORE UPDATE).
-- Идемпотентно (create or replace / drop if exists).
-- =============================================================================

-- 1. Расширяем защиту привилегий: смена status не-админом запрещена.
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
    if new.status is distinct from old.status and not public.is_admin() then
      raise exception 'status can only be changed by an admin';
    end if;
  end if;

  return new;
end;
$$;

-- 2. Политика обновления: автор правит свой проект в любом статусе.
drop policy if exists projects_update_own_pending on public.projects;
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- =============================================================================
-- ГОТОВО. Перепроверка (npm run security-check <email> <пароль>):
--   Атака role → admin    — отбито
--   Атака is_core → true  — отбито
--   Контроль bio          — обновился
-- Дополнительно вручную из консоли под обычной учёткой:
--   update своего published (title/description) — проходит
--   update({ status: 'published' }) на своём pending — отбито
--     «status can only be changed by an admin»
-- =============================================================================
