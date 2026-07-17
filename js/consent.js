/**
 * Версия политики, которую сервер принимает при регистрации и для публикации
 * контактов. Синхронизацию с SQL проверяет scripts/check-consent-version.mjs.
 */
export const PRIVACY_POLICY_VERSION = 'privacy-2026-07-16-v4';

export const PROCESSING_SCOPE_PURPOSE = 'club_account_and_services';

export function hasCurrentProcessingScope(scope) {
  return Boolean(scope) &&
    !Array.isArray(scope) &&
    scope.purpose === PROCESSING_SCOPE_PURPOSE &&
    Object.keys(scope).length === 1;
}

export const PROFILE_CONTACT_FIELDS = Object.freeze([
  'telegram',
  'website',
  'github',
  'phone',
  'email_public',
  'custom_link_label',
  'custom_link_url'
]);

export const DISSEMINATION_SCOPE_PURPOSE = 'public_profile';
