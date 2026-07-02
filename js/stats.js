/**
 * We Designerz — честные live-счётчики hero (участники, проекты).
 * Реальные данные из Supabase. При ошибке блок цифр скрывается — фейковых значений не показываем.
 */
import { supabase } from './supabase.js';

async function countRows(table, filters = {}) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  Object.entries(filters).forEach(([column, value]) => {
    query = query.eq(column, value);
  });
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function renderStats() {
  const wrap = document.querySelector('[data-stats]');
  if (!wrap) return;

  try {
    const [members, projects] = await Promise.all([
      countRows('profiles'),
      countRows('projects', { status: 'published' })
    ]);

    const membersEl = wrap.querySelector('[data-stat="members"]');
    const projectsEl = wrap.querySelector('[data-stat="projects"]');
    if (membersEl) membersEl.textContent = String(members);
    if (projectsEl) projectsEl.textContent = String(projects);
  } catch (error) {
    console.error('stats: failed to load', error);
    wrap.hidden = true;
  }
}

renderStats();
