-- =============================================================================
-- T-CONSENT-RECONSENT — explicit processing consent for legacy users
-- Adds one authenticated, version-gated RPC. It does not backfill users: the
-- only write path is an explicit call made in the signed-in user's session.
-- =============================================================================

begin;

-- Remove a hypothetical obsolete no-arg overload so PostgREST cannot expose a
-- version-less bypass after restores or partial local experiments.
drop function if exists public.grant_processing_consent();

create or replace function public.grant_processing_consent(
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
begin
  if caller_id is null then
    raise exception using
      errcode = '28000',
      message = 'consent_auth_required';
  end if;

  -- Reject a stale, missing or tampered browser version before any write.
  if submitted_policy_version is distinct from public.current_privacy_policy_version() then
    raise exception using
      errcode = 'P0001',
      message = 'consent_policy_version_invalid';
  end if;

  -- Serialize re-consent for one user. A profile must already exist because
  -- handle_new_user() creates it atomically with the Auth account.
  perform 1
    from public.profiles
   where id = caller_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'consent_profile_missing';
  end if;

  select uc.id
    into consent_id
    from public.user_consents as uc
   where uc.user_id = caller_id
     and uc.consent_type = 'processing'
     and uc.policy_version = public.current_privacy_policy_version()
     and uc.revoked_at is null
     and uc.scope = jsonb_build_object(
       'purpose', 'club_account_and_services'
     )
   for update;

  -- Current consent is idempotent: preserve its original server timestamp.
  if consent_id is not null then
    return consent_id;
  end if;

  -- Preserve every historical row. The previously active consent becomes
  -- historical only at the moment of the user's explicit v4 confirmation.
  update public.user_consents
     set revoked_at = now()
   where user_id = caller_id
     and consent_type = 'processing'
     and revoked_at is null;

  insert into public.user_consents (
    user_id, consent_type, policy_version, scope
  ) values (
    caller_id,
    'processing',
    public.current_privacy_policy_version(),
    jsonb_build_object('purpose', 'club_account_and_services')
  )
  returning id into consent_id;

  return consent_id;
end;
$$;

revoke execute on function public.grant_processing_consent(text)
  from public, anon;
grant execute on function public.grant_processing_consent(text)
  to authenticated;

commit;
