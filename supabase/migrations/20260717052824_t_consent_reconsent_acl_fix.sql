-- Supabase default privileges can grant service_role explicit EXECUTE even
-- after PUBLIC/anon are revoked. The browser flow needs only authenticated.
begin;

revoke execute on function public.grant_processing_consent(text)
  from public, anon, service_role;
grant execute on function public.grant_processing_consent(text)
  to authenticated;

commit;
