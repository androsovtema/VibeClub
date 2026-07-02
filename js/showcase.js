/**
 * We Designerz — витрина проектов сообщества (главная + projects.html).
 * Рендерит #community-grid из Supabase, чипы категорий и (опц.) сортировку перезапрашивают данные.
 */
import { fetchPublishedProjects, renderProjectCard } from './projects.js';
import { t } from './i18n/ru.js';

function initShowcase(grid) {
  const chipsWrap = document.querySelector('.showcase-chips');
  const sortSelect = document.querySelector('[data-sort]');
  const limit = grid.dataset.limit ? Number(grid.dataset.limit) : undefined;

  const state = {
    category: chipsWrap?.querySelector('.filter-tag.active')?.dataset.filter || 'all',
    sort: sortSelect?.value || 'new'
  };

  async function load() {
    grid.setAttribute('aria-busy', 'true');
    const { data, error } = await fetchPublishedProjects({
      category: state.category,
      sort: state.sort,
      limit
    });
    grid.removeAttribute('aria-busy');
    grid.innerHTML = '';

    if (error) {
      const msg = document.createElement('p');
      msg.className = 'showcase-empty';
      msg.textContent = t('auth.error.generic');
      grid.appendChild(msg);
      return;
    }

    if (!data || data.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'showcase-empty';
      empty.textContent = t('showcase.empty');
      grid.appendChild(empty);
      return;
    }

    data.forEach((project) => grid.appendChild(renderProjectCard(project)));
  }

  chipsWrap?.addEventListener('click', (event) => {
    const chip = event.target.closest('.filter-tag');
    if (!chip) return;
    chipsWrap.querySelectorAll('.filter-tag').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.category = chip.dataset.filter || 'all';
    load();
  });

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    load();
  });

  load();
}

const grid = document.getElementById('community-grid');
if (grid) initShowcase(grid);
