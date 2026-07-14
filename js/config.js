/**
 * We Designerz — публичная конфигурация Supabase.
 * Эти значения ПУБЛИЧНЫ по дизайну (anon-ключ виден в браузере).
 * Защита данных строится на RLS в БД, а не на секретности ключа.
 * НИКОГДА не помещать сюда service_role-ключ.
 */
export const SUPABASE_URL = 'https://ndhyvspgkelxgqmfmmry.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaHl2c3Bna2VseGdxbWZtbXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MTQ0NzksImV4cCI6MjA5ODk5MDQ3OX0.bAWC15ntO1UD9njG49BDu124KDUGvIPJFMoUzXO1R5g';

// Hero-счётчики показываются только при достижении обоих порогов (10-membership.md, T15).
export const STATS_MIN_MEMBERS = 30;
export const STATS_MIN_PROJECTS = 15;

// Umami (T19, self-host — T-LOC). Пусто — аналитика полностью выключена
// (см. js/analytics.js).
export const UMAMI_WEBSITE_ID = 'aa405870-f795-48e3-8b63-14485b24e226';

// Адрес скрипта Umami. Дефолт — текущий cloud-URL, чтобы не сломать T19 до
// переезда; после локализации (RUNBOOK.md, шаг 8) меняется на
// 'https://stats.wedesignerz.com/script.js' вместе с новым UMAMI_WEBSITE_ID.
export const UMAMI_SRC = 'https://cloud.umami.is/script.js';
