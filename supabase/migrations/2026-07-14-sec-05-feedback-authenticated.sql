-- =============================================================================
-- SEC-05: feedback только для авторизованных
-- Honeypot и cooldown живут в JS (js/ui/feedbackModal.js) — прямой REST их
-- обходит, а политика feedback_insert_anyone пускала роль anon: любой бот мог
-- спамить таблицу без ограничений. Временная мера из аудита: insert только
-- authenticated со своим uid. Зеркалит supabase/schema.sql. Идемпотентно,
-- применять к обоим бэкендам (cloud + self-hosted, SEC-12).
-- =============================================================================

drop policy if exists feedback_insert_anyone on public.feedback;
drop policy if exists feedback_insert_auth on public.feedback;
create policy feedback_insert_auth on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid());
