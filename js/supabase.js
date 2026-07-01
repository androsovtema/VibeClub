/**
 * We Designerz — клиент Supabase.
 * anon-ключ публичен по дизайну, защита данных на RLS (см. docs/01-architecture.md).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
