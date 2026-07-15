-- =============================================================================
-- T-CONSENT-01 — серверный журнал согласий и защита публичных контактов
-- Repo prep: применять к production только отдельной задачей T-CONSENT-02 после
-- backup и подсчёта профилей, чьи контакты будут очищены.
-- =============================================================================

begin;

-- Единая разрешённая версия политики на стороне БД. Функция закрыта от RPC;
-- literal синхронизируется с js/consent.js статической проверкой.
create or replace function public.current_privacy_policy_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'privacy-2026-07-15-v2'::text
$$;

revoke execute on function public.current_privacy_policy_version()
  from public, anon, authenticated;

create table if not exists public.user_consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  consent_type   text not null
                   constraint user_consents_type_check
                   check (consent_type in ('processing', 'dissemination')),
  policy_version text not null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  scope          jsonb not null default '{}'::jsonb,
  subject_full_name text,
  subject_contact   text,
  constraint user_consents_revocation_time_check
    check (revoked_at is null or revoked_at >= granted_at),
  constraint user_consents_scope_object_check
    check (jsonb_typeof(scope) = 'object'),
  constraint user_consents_dissemination_identity_check
    check (
      consent_type <> 'dissemination'
      or (
        subject_full_name is not null
        and subject_contact is not null
        and char_length(subject_full_name) between 3 and 200
        and btrim(subject_full_name)
          ~ '^[^[:space:]]+([[:space:]]+[^[:space:]]+)+$'
        and char_length(subject_contact) between 3 and 320
      )
    )
);

create index if not exists user_consents_user_idx
  on public.user_consents (user_id);

create unique index if not exists user_consents_one_active_type_idx
  on public.user_consents (user_id, consent_type)
  where revoked_at is null;

alter table public.user_consents enable row level security;

drop policy if exists user_consents_select_self on public.user_consents;
create policy user_consents_select_self on public.user_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Таблица доступна участнику только для чтения собственных строк. Все записи и
-- изменения выполняют закрытый signup-триггер и две узкие RPC ниже.
revoke all on table public.user_consents from anon, authenticated;
grant select on table public.user_consents to authenticated;

-- Регистрация атомарно создаёт профиль и processing-consent. Metadata здесь —
-- только входной сигнал: сервер принимает одну точную версию и дальше не
-- использует raw_user_meta_data для авторизации.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'privacy_policy_version', '')
       <> public.current_privacy_policy_version() then
    raise exception using
      errcode = 'P0001',
      message = 'processing_consent_version_invalid';
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_consents (
    user_id, consent_type, policy_version, scope
  ) values (
    new.id,
    'processing',
    public.current_privacy_policy_version(),
    jsonb_build_object('purpose', 'club_account_and_services')
  )
  on conflict (user_id, consent_type) where revoked_at is null do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;

-- Выдать отдельное согласие на публикацию семи полей своего профиля. ФИО
-- участника передаётся явно, а контакт берётся сервером из auth.users: так
-- consent row хранит снимок обязательных реквизитов и не доверяет клиенту email.
-- Старую no-arg сигнатуру удаляем явно, чтобы она не осталась RPC-обходом при
-- повторном применении repo-prep поверх тестовой схемы.
drop function if exists public.grant_profile_dissemination();
create or replace function public.grant_profile_dissemination(subject_full_name text)
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

  -- Сериализуем grant/revoke одного пользователя и не переписываем историю.
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

revoke execute on function public.grant_profile_dissemination(text)
  from public, anon;
grant execute on function public.grant_profile_dissemination(text)
  to authenticated;

-- Отзыв и очистка выполняются одним RPC-вызовом, то есть одной транзакцией.
-- Повторный отзыв безопасен: update consent может затронуть 0 строк, контакты
-- всё равно остаются очищенными.
create or replace function public.revoke_profile_dissemination()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception using
      errcode = '28000',
      message = 'consent_auth_required';
  end if;

  -- Тот же per-user lock, что и в grant: параллельные grant/revoke должны
  -- завершаться в однозначном порядке и не оставлять активное согласие после
  -- более позднего отзыва.
  perform 1 from public.profiles where id = caller_id for update;

  update public.user_consents
     set revoked_at = now()
   where user_id = caller_id
     and consent_type = 'dissemination'
     and revoked_at is null;

  update public.profiles
     set telegram = null,
         website = null,
         github = null,
         phone = null,
         email_public = null,
         custom_link_label = null,
         custom_link_url = null
   where id = caller_id;
end;
$$;

revoke execute on function public.revoke_profile_dissemination()
  from public, anon;
grant execute on function public.revoke_profile_dissemination()
  to authenticated;

-- Даже прямой REST PATCH профиля не может записать непустой контакт без
-- активного dissemination-consent текущей версии и точного scope. SQL Editor,
-- backup/restore и service-role без пользовательского JWT (auth.uid() is null)
-- сохраняют административный путь восстановления.
create or replace function public.protect_profile_contacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if nullif(btrim(new.telegram), '') is null
     and nullif(btrim(new.website), '') is null
     and nullif(btrim(new.github), '') is null
     and nullif(btrim(new.phone), '') is null
     and nullif(btrim(new.email_public), '') is null
     and nullif(btrim(new.custom_link_label), '') is null
     and nullif(btrim(new.custom_link_url), '') is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.user_consents as uc
     where uc.user_id = new.id
       and uc.consent_type = 'dissemination'
       and uc.policy_version = public.current_privacy_policy_version()
       and uc.revoked_at is null
       and uc.scope = jsonb_build_object(
         'fields', jsonb_build_array(
           'telegram', 'website', 'github', 'phone', 'email_public',
           'custom_link_label', 'custom_link_url'
         ),
         'purpose', 'public_profile'
       )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'dissemination_consent_required';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_contacts on public.profiles;
create trigger trg_protect_profile_contacts
  before insert or update of
    telegram, website, github, phone, email_public,
    custom_link_label, custom_link_url
  on public.profiles
  for each row execute function public.protect_profile_contacts();

revoke execute on function public.protect_profile_contacts()
  from public, anon, authenticated;

-- Нельзя считать ранее заполненные контакты согласованными задним числом.
-- T-CONSENT-02 перед применением отдельно сделает backup и посчитает строки.
update public.profiles
   set telegram = null,
       website = null,
       github = null,
       phone = null,
       email_public = null,
       custom_link_label = null,
       custom_link_url = null
 where (
       nullif(btrim(telegram), '') is not null
    or nullif(btrim(website), '') is not null
    or nullif(btrim(github), '') is not null
    or nullif(btrim(phone), '') is not null
    or nullif(btrim(email_public), '') is not null
    or nullif(btrim(custom_link_label), '') is not null
    or nullif(btrim(custom_link_url), '') is not null
 )
   and not exists (
     select 1
       from public.user_consents as uc
      where uc.user_id = profiles.id
        and uc.consent_type = 'dissemination'
        and uc.policy_version = public.current_privacy_policy_version()
        and uc.revoked_at is null
        and uc.scope = jsonb_build_object(
          'fields', jsonb_build_array(
            'telegram', 'website', 'github', 'phone', 'email_public',
            'custom_link_label', 'custom_link_url'
          ),
          'purpose', 'public_profile'
        )
   );

commit;
