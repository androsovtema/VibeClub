/**
 * We Designerz — публичная конфигурация Supabase.
 * Эти значения ПУБЛИЧНЫ по дизайну (anon-ключ виден в браузере).
 * Защита данных строится на RLS в БД, а не на секретности ключа.
 * НИКОГДА не помещать сюда service_role-ключ.
 */
export const SUPABASE_URL = 'https://api.wedesignerz.com';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgzOTkyODE1LCJleHAiOjE5NDE2NzI4MTV9.If3_eNU7itDXwrbT94-M9KVv8bLUvwNvclPfxX-BwYE';

// Hero-счётчики показываются только при достижении обоих порогов (10-membership.md, T15).
export const STATS_MIN_MEMBERS = 30;
export const STATS_MIN_PROJECTS = 15;

// Umami (T19, self-host — T-LOC). Пусто — аналитика полностью выключена
// (см. js/analytics.js).
export const UMAMI_WEBSITE_ID = '1ccbf250-0959-4221-b2cc-b401b8efee95';

// Адрес скрипта Umami. Дефолт — текущий cloud-URL, чтобы не сломать T19 до
// переезда; после локализации (RUNBOOK.md, шаг 8) меняется на
// 'https://stats.wedesignerz.com/script.js' вместе с новым UMAMI_WEBSITE_ID.
export const UMAMI_SRC = 'https://stats.wedesignerz.com/script.js';
