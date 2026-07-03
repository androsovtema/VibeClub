/**
 * We Designerz — витрина проектов сообщества (главная + projects.html).
 * Рендерит #community-grid из Supabase, чипы категорий и (опц.) сортировку перезапрашивают данные.
 */
import { fetchPublishedProjects, renderProjectCard } from './projects.js';
import { t } from './i18n/ru.js';

function initShowcase(grid) {
  const chipsWrap = document.querySelector('.showcase-chips');
  const sortGroup = document.querySelector('[data-sort]');
  const limit = grid.dataset.limit ? Number(grid.dataset.limit) : undefined;
  const urlParams = new URLSearchParams(window.location.search);

  const state = {
    category: chipsWrap?.querySelector('.filter-tag.active')?.dataset.filter || 'all',
    sort: sortGroup?.querySelector('.sort-segment-btn.active')?.dataset.sortValue || 'new',
    tool: urlParams.get('tool') || null
  };

  function renderToolChip() {
    if (!chipsWrap) return;
    let chip = chipsWrap.querySelector('[data-tool-chip]');
    if (!state.tool) {
      chip?.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-tag active';
      chip.setAttribute('data-tool-chip', '');
      chip.addEventListener('click', () => {
        state.tool = null;
        const url = new URL(window.location.href);
        url.searchParams.delete('tool');
        window.history.replaceState({}, '', url);
        renderToolChip();
        load();
      });
      chipsWrap.appendChild(chip);
    }
    chip.textContent = `✦ ${state.tool} ✕`;
  }

  async function load() {
    grid.setAttribute('aria-busy', 'true');
    const { data, error } = await fetchPublishedProjects({
      category: state.category,
      sort: state.sort,
      tool: state.tool,
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
    if (!chip || chip.hasAttribute('data-tool-chip')) return;
    chipsWrap.querySelectorAll('.filter-tag').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.category = chip.dataset.filter || 'all';
    load();
  });

  sortGroup?.addEventListener('click', (event) => {
    const btn = event.target.closest('.sort-segment-btn');
    if (!btn || btn.classList.contains('active')) return;
    sortGroup.querySelectorAll('.sort-segment-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    state.sort = btn.dataset.sortValue || 'new';
    load();
  });

  renderToolChip();
  load();
}

const grid = document.getElementById('community-grid');
if (grid) initShowcase(grid);
