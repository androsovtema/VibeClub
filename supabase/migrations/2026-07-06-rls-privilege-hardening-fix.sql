-- =============================================================================
-- Миграция 2026-07-06 (fix) — исправление функции protect_privileged_columns
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
--
-- Баг предыдущей версии (2026-07-06-rls-privilege-hardening.sql): проверка имени
-- таблицы и обращение к полю были в одном булевом выражении
--   (tg_table_name = 'projects' and new.is_core is distinct from old.is_core ...).
-- SQL НЕ гарантирует короткое замыкание AND — Postgres доставал new.is_core на
-- таблице profiles (и new.role на projects), где такого поля нет:
--   ERROR: record "new" has no field "is_core".
-- Следствие: любое легитимное обновление profiles (bio/skills) и projects (правка
-- своего pending) падало с 400. Атаки при этом «отбивались», но крешем, а не
-- защитой.
--
-- Фикс: имя таблицы — во ВНЕШНЕМ if, поле упоминается только в своей ветке.
-- Идемпотентно (create or replace). Триггеры не пересоздаём — они уже висят
-- на этой функции.
-- =============================================================================

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

-- =============================================================================
-- ГОТОВО. Перепроверка: npm run security-check <email> <пароль>
-- Ожидается:
--   Атака 1 (role → admin)      — отбито «role can only be changed by an admin»
--   Атака 2 (is_core → true)    — отбито «is_core can only be changed by an admin»
--   Контроль (bio)              — обновился (легитимный доступ НЕ сломан)
-- =============================================================================
