/**
 * We Designerz — живой тост "недавно в витрине" (T-D4, раздел C).
 * Раз за сессию показывает самый свежий published-проект. Реальные данные,
 * пустая БД -> тоста нет. textContent для пользовательских данных, клик ведёт на проект.
 */
import { supabase } from './supabase.js';
import { t } from './i18n/ru.js';

const SESSION_KEY = 'wd_activity_toast_shown';
const SHOW_DELAY_MS = 2000;
const HIDE_AFTER_MS = 6000;

async function fetchLatestProject() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, author:profiles!projects_author_id_fkey(display_name)')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

function showActivityToast(project) {
  const toast = document.getElementById('activity-toast');
  if (!toast) return;

  toast.textContent = '';

  const link = document.createElement('a');
  link.className = 'activity-toast-link';
  link.href = `project.html?id=${encodeURIComponent(project.id)}`;

  const author = document.createElement('strong');
  author.textContent = project.author?.display_name || 'Участник сообщества';

  const title = document.createElement('strong');
  title.textContent = project.title;

  link.append(author, ` ${t('activity.toast.added')} «`, title, '»');
  toast.appendChild(link);

  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => toast.classList.remove('is-visible'), HIDE_AFTER_MS);
}

async function init() {
  if (sessionStorage.getItem(SESSION_KEY)) return;

  const project = await fetchLatestProject();
  if (!project) return;

  sessionStorage.setItem(SESSION_KEY, '1');
  setTimeout(() => showActivityToast(project), SHOW_DELAY_MS);
}

init();
