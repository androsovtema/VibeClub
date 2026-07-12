-- =============================================================================
-- Миграция 2026-07-12 — таблица feedback (T22, «Нашли проблему?»)
-- Применять в Supabase: SQL Editor → New query → вставить всё → Run.
--
-- Единственный канал репорта багов/фидбека до этого — личный чат с Тёмой.
-- Добавляет встроенный путь: любой человек, включая гостя без аккаунта
-- (важный кейс — у него могла сломаться сама регистрация), описывает
-- проблему прямо на сайте, Тёма разбирает список в /admin.html.
--
-- Идемпотентно: create table if not exists + drop policy if exists перед create.
-- =============================================================================

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

alter table public.feedback enable row level security;

-- Отправить может кто угодно (гость или залогиненный), но за себя:
-- либо user_id = null (аноним), либо свой собственный auth.uid() — чужой
-- uid подставить нельзя.
drop policy if exists feedback_insert_anyone on public.feedback;
create policy feedback_insert_anyone on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Читать и разбирать список может только админ.
drop policy if exists feedback_select_admin on public.feedback;
create policy feedback_select_admin on public.feedback
  for select using (public.is_admin());

-- Менять (закрывать, status → 'done') может только админ. Колонки не
-- ограничиваем отдельным триггером — вся строка доступна на update только
-- через политику is_admin(), как остальным admin-only update в схеме.
drop policy if exists feedback_update_admin on public.feedback;
create policy feedback_update_admin on public.feedback
  for update using (public.is_admin()) with check (public.is_admin());

-- Удалять нельзя никому — политики delete нет.

-- =============================================================================
-- ГОТОВО. Проверка:
--   - аноним/участник insert с user_id=null или своим uid — проходит;
--   - insert с чужим user_id — отбивает RLS;
--   - не-админ select — 0 строк, update чужого status — 0 строк затронуто;
--   - админ (public.is_admin()) видит и обновляет status.
-- =============================================================================
