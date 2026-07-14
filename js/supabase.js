/**
 * We Designerz — клиент Supabase.
 * anon-ключ публичен по дизайну, защита данных на RLS (см. docs/01-architecture.md).
 */
// SEC-07: клиент вендорится локально (js/vendor/), а не тянется с CDN по
// плавающей версии. Компрометация/тихое обновление esm.sh больше не даёт доступ
// к сессии пользователя. Обновлять только через PR: сгрузить новый bundle
// `https://esm.sh/@supabase/supabase-js@X.Y.Z/es2022/supabase-js.bundle.mjs`,
// прогнать security-check, поменять путь ниже.
import { createClient } from './vendor/supabase-js@2.110.3.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
