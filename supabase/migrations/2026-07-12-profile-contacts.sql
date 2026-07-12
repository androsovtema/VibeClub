-- =============================================================================
-- Миграция 2026-07-12 — контакты профиля (T23 + своя ссылка)
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
--
-- Было: telegram, website. Добавляем github, phone, email_public — фиксированный
-- набор колонок (решение из T23: не jsonb-список), плюс одну пару для
-- произвольной ссылки (custom_link_label + custom_link_url) — юзер вписывает
-- название и URL своей ссылки (личный сайт, портфолио и т.п.), максимум одну.
-- email_public — отдельная колонка: логин-почту из auth.users публиковать без
-- явного согласия нельзя, ничего оттуда не автозаполняется.
--
-- Идемпотентно: add column if not exists, ограничения длины через do $$ …
-- с проверкой pg_constraint (add constraint if not exists не существует).
-- =============================================================================

alter table public.profiles
  add column if not exists github             text check (char_length(github) <= 100),
  add column if not exists phone              text check (char_length(phone) <= 30),
  add column if not exists email_public       text check (char_length(email_public) <= 200),
  add column if not exists custom_link_label  text check (char_length(custom_link_label) <= 60),
  add column if not exists custom_link_url    text check (char_length(custom_link_url) <= 300);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_telegram_len'
  ) then
    alter table public.profiles
      add constraint profiles_telegram_len check (char_length(telegram) <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_website_len'
  ) then
    alter table public.profiles
      add constraint profiles_website_len check (char_length(website) <= 300);
  end if;
end $$;

-- RLS не трогаем: profiles_update_own уже пускает владельца к своим колонкам,
-- protect_privileged_columns охраняет только role/is_core.

-- =============================================================================
-- ГОТОВО. Проверка:
--   - select github, phone, email_public, custom_link_label, custom_link_url
--     from public.profiles limit 1; — колонки есть, значения null;
--   - update своего профиля с длинными значениями (> лимита) — отбивает check;
--   - повторный прогон миграции — без ошибок (идемпотентно).
-- =============================================================================
