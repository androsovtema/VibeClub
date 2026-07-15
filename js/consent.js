/**
 * Версия политики, которую сервер принимает при регистрации и для публикации
 * контактов. Синхронизацию с SQL проверяет scripts/check-consent-version.mjs.
 */
export const PRIVACY_POLICY_VERSION = 'privacy-2026-07-15-v2';

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
