-- =============================================================================
-- T-CONSENT-VERSION-GATE — upgrade live v2 baseline to privacy-2026-07-16-v4
-- Applies on top of the already-live T-CONSENT-01 schema (table/RLS/trigger
-- stay untouched). Only the server-side policy version and the dissemination
-- grant RPC change: the RPC now requires the exact version the frontend saw.
-- =============================================================================

begin;

create or replace function public.current_privacy_policy_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'privacy-2026-07-16-v4'::text
$$;

revoke execute on function public.current_privacy_policy_version()
  from public, anon, authenticated;

-- Old overloads accepted no version or trusted the server's current version
-- implicitly. Drop both so a stale cached client cannot call an obsolete
-- signature and silently create a consent row under the wrong policy text.
drop function if exists public.grant_profile_dissemination();
drop function if exists public.grant_profile_dissemination(text);

create or replace function public.grant_profile_dissemination(
  subject_full_name text,
  submitted_policy_version text
)
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

  -- Reject before any change if the browser's text version drifted from the
  -- server's current version (stale cache after a policy upgrade).
  if submitted_policy_version is distinct from public.current_privacy_policy_version() then
    raise exception using
      errcode = 'P0001',
      message = 'consent_policy_version_invalid';
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

  -- Serialize grant/revoke for one user and keep history append-only.
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

revoke execute on function public.grant_profile_dissemination(text, text)
  from public, anon;
grant execute on function public.grant_profile_dissemination(text, text)
  to authenticated;

commit;
