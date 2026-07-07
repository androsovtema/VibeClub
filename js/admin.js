/**
 * We Designerz — админ-модерация (T7). Виден только role='admin' (проверка на фронте —
 * для удобства, реальная защита данных на RLS: is_admin(), projects_select_admin,
 * projects_update_admin, comments_update_own_or_admin, см. supabase/schema.sql).
 * Пользовательские данные — только через textContent/createElement.
 */
import { supabase } from './supabase.js';
import { getCurrentUser, onAuthChange } from './auth.js';
import { t } from './i18n/ru.js';
import { CATEGORY_LABELS, coverGradientFor, initialOf } from './projects.js';
import { isHttpUrl } from './util.js';
import { kindLabel } from './vocab.js';

const PROJECT_SELECT = '*, author:profiles!projects_author_id_fkey(display_name)';
const COMMENTS_LIMIT = 50;

const loadingEl = document.querySelector('[data-admin-loading]');
const deniedEl = document.querySelector('[data-admin-denied]');
const dashboardEl = document.querySelector('[data-admin-dashboard]');
const errorEl = document.querySelector('[data-admin-error]');

const tabButtons = Array.from(document.querySelectorAll('[data-tab-btn]'));
const panelEls = {
  pending: document.querySelector('[data-tab-panel="pending"]'),
  published: document.querySelector('[data-tab-panel="published"]'),
  rejected: document.querySelector('[data-tab-panel="rejected"]'),
  comments: document.querySelector('[data-tab-panel="comments"]')
};
const listEls = {
  pending: document.querySelector('[data-pending-list]'),
  published: document.querySelector('[data-published-list]'),
  rejected: document.querySelector('[data-rejected-list]'),
  comments: document.querySelector('[data-comments-mod-list]')
};
const emptyEls = {
  pending: document.querySelector('[data-pending-empty]'),
  published: document.querySelector('[data-published-empty]'),
  rejected: document.querySelector('[data-rejected-empty]'),
  comments: document.querySelector('[data-comments-mod-empty]')
};
const countEls = {
  pending: document.querySelector('[data-tab-btn="pending"] [data-tab-count]'),
  published: document.querySelector('[data-tab-btn="published"] [data-tab-count]'),
  rejected: document.querySelector('[data-tab-btn="rejected"] [data-tab-count]'),
  comments: document.querySelector('[data-tab-btn="comments"] [data-tab-count]')
};

const state = { pending: [], published: [], rejected: [], comments: [] };
let dashboardLoaded = false;

applyStaticText();
wireTabs();

function applyStaticText() {
  document.querySelector('[data-loading-text]').textContent = t('admin.loading');
  document.querySelector('[data-denied-title]').textContent = t('admin.denied.title');
  document.querySelector('[data-denied-text]').textContent = t('admin.denied.text');
  document.querySelector('[data-denied-link]').textContent = t('admin.denied.link');
  document.querySelector('[data-admin-title]').textContent = t('admin.title');

  document.querySelector('[data-tab-btn="pending"] [data-tab-label]').textContent = t('admin.tab.pending');
  document.querySelector('[data-tab-btn="published"] [data-tab-label]').textContent = t('admin.tab.published');
  document.querySelector('[data-tab-btn="rejected"] [data-tab-label]').textContent = t('admin.tab.rejected');
  document.querySelector('[data-tab-btn="comments"] [data-tab-label]').textContent = t('admin.tab.comments');

  emptyEls.pending.textContent = t('admin.pending.empty');
  emptyEls.published.textContent = t('admin.published.empty');
  emptyEls.rejected.textContent = t('admin.rejected.empty');
  emptyEls.comments.textContent = t('admin.comments.empty');
}

function wireTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tabBtn));
  });
}

function switchTab(tab) {
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tabBtn === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  Object.keys(panelEls).forEach((key) => {
    panelEls[key].hidden = key !== tab;
  });
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function showLoading() {
  loadingEl.hidden = false;
  deniedEl.hidden = true;
  dashboardEl.hidden = true;
}

function showDenied() {
  document.title = t('admin.denied.doctitle');
  loadingEl.hidden = true;
  deniedEl.hidden = false;
  dashboardEl.hidden = true;
  dashboardLoaded = false;
}

function showDashboard() {
  document.title = t('admin.doctitle');
  loadingEl.hidden = true;
  deniedEl.hidden = true;
  dashboardEl.hidden = false;
}

function showError(error) {
  errorEl.textContent = error?.message
    ? `${t('admin.error.generic')} (${error.message})`
    : t('admin.error.generic');
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
}

/* ---------- Доступ ---------- */

async function checkAccess() {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return !error && data?.role === 'admin';
}

async function handleAccessChange() {
  const ok = await checkAccess();
  if (!ok) {
    showDenied();
    return;
  }
  showDashboard();
  if (!dashboardLoaded) {
    dashboardLoaded = true;
    await loadAll();
  }
}

/* ---------- Данные ---------- */

function normalizeAdminProject(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url || null,
    projectUrl: row.project_url,
    tags: Array.isArray(row.tags) ? row.tags : [],
    tools: Array.isArray(row.tools) ? row.tools : [],
    isCore: !!row.is_core,
    status: row.status,
    authorName: row.author?.display_name || 'Участник сообщества',
    createdAt: row.created_at
  };
}

async function fetchProjectsByStatus(status) {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    showError(error);
    return [];
  }
  return (data || []).map(normalizeAdminProject);
}

async function fetchRecentComments() {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, kind, created_at, author:profiles!comments_author_id_fkey(display_name, avatar_url), project:projects(id, title)')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(COMMENTS_LIMIT);

  if (error) {
    showError(error);
    return [];
  }
  return data || [];
}

async function loadAll() {
  const [pending, published, rejected, comments] = await Promise.all([
    fetchProjectsByStatus('pending'),
    fetchProjectsByStatus('published'),
    fetchProjectsByStatus('rejected'),
    fetchRecentComments()
  ]);
  state.pending = pending;
  state.published = published;
  state.rejected = rejected;
  state.comments = comments;
  Object.keys(state).forEach(renderPanel);
  updateCounts();
}

function updateCounts() {
  Object.keys(state).forEach((key) => {
    countEls[key].textContent = String(state[key].length);
  });
}

function renderPanel(tab) {
  const listEl = listEls[tab];
  listEl.innerHTML = '';
  const list = state[tab];
  emptyEls[tab].hidden = list.length > 0;

  if (tab === 'comments') {
    list.forEach((comment) => listEl.appendChild(renderCommentItem(comment)));
  } else {
    list.forEach((project) => listEl.appendChild(renderProjectCard(project, tab)));
  }
}

function moveProject(project, fromTab, toTab) {
  state[fromTab] = state[fromTab].filter((p) => p.id !== project.id);
  project.status = toTab;
  state[toTab] = [project, ...state[toTab]];
  renderPanel(fromTab);
  renderPanel(toTab);
  updateCounts();
}

async function updateProjectStatus(project, newStatus, fromTab) {
  clearError();
  const { error } = await supabase.from('projects').update({ status: newStatus }).eq('id', project.id);
  if (error) {
    showError(error);
    return;
  }
  moveProject(project, fromTab, newStatus);
}

async function hideComment(comment) {
  clearError();
  const { error } = await supabase.from('comments').update({ status: 'hidden' }).eq('id', comment.id);
  if (error) {
    showError(error);
    return;
  }
  state.comments = state.comments.filter((c) => c.id !== comment.id);
  renderPanel('comments');
  updateCounts();
}

/* ---------- Инлайн-подтверждение (без alert/confirm) ---------- */

function buildConfirmButton({ label, confirmLabel, triggerClass, onConfirm }) {
  const wrap = document.createElement('span');
  wrap.className = 'adm-confirm-wrap';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = triggerClass;
  trigger.textContent = label;

  const confirmRow = document.createElement('span');
  confirmRow.className = 'adm-confirm-row';
  confirmRow.hidden = true;

  const confirmText = document.createElement('span');
  confirmText.className = 'adm-confirm-text';
  confirmText.textContent = confirmLabel;

  const yesBtn = document.createElement('button');
  yesBtn.type = 'button';
  yesBtn.className = 'btn-danger btn-sm';
  yesBtn.textContent = t('admin.action.yes');

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary btn-sm';
  cancelBtn.textContent = t('admin.action.cancel');

  confirmRow.append(confirmText, yesBtn, cancelBtn);

  trigger.addEventListener('click', () => {
    trigger.hidden = true;
    confirmRow.hidden = false;
  });

  cancelBtn.addEventListener('click', () => {
    confirmRow.hidden = true;
    trigger.hidden = false;
  });

  yesBtn.addEventListener('click', async () => {
    yesBtn.disabled = true;
    cancelBtn.disabled = true;
    await onConfirm();
    // При успехе карточка перерендеривается; при ошибке возвращаем кнопки в рабочее состояние
    yesBtn.disabled = false;
    cancelBtn.disabled = false;
    confirmRow.hidden = true;
    trigger.hidden = false;
  });

  wrap.append(trigger, confirmRow);
  return wrap;
}

/* ---------- Карточка проекта ---------- */

function buildCoreToggle(project) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'adm-toggle';
  btn.classList.toggle('is-active', project.isCore);
  btn.setAttribute('aria-pressed', String(project.isCore));

  const track = document.createElement('span');
  track.className = 'adm-toggle-track';
  const thumb = document.createElement('span');
  thumb.className = 'adm-toggle-thumb';
  track.appendChild(thumb);

  const label = document.createElement('span');
  label.className = 'adm-toggle-label';
  label.textContent = t('admin.iscore.label');

  btn.append(track, label);

  btn.addEventListener('click', async () => {
    clearError();
    const next = !project.isCore;
    btn.disabled = true;
    const { error } = await supabase.from('projects').update({ is_core: next }).eq('id', project.id);
    btn.disabled = false;
    if (error) {
      showError(error);
      return;
    }
    project.isCore = next;
    btn.classList.toggle('is-active', next);
    btn.setAttribute('aria-pressed', String(next));
  });

  return btn;
}

function buildActions(project, tab) {
  const actions = document.createElement('div');
  actions.className = 'adm-card-actions';

  if (tab === 'pending') {
    const publishBtn = document.createElement('button');
    publishBtn.type = 'button';
    publishBtn.className = 'btn-primary btn-sm';
    publishBtn.textContent = t('admin.action.publish');
    publishBtn.addEventListener('click', () => updateProjectStatus(project, 'published', 'pending'));
    actions.appendChild(publishBtn);

    actions.appendChild(buildConfirmButton({
      label: t('admin.action.reject'),
      confirmLabel: t('admin.action.reject.confirm'),
      triggerClass: 'btn-secondary btn-sm',
      onConfirm: () => updateProjectStatus(project, 'rejected', 'pending')
    }));
  } else if (tab === 'published') {
    actions.appendChild(buildCoreToggle(project));

    const unpublishBtn = document.createElement('button');
    unpublishBtn.type = 'button';
    unpublishBtn.className = 'btn-secondary btn-sm';
    unpublishBtn.textContent = t('admin.action.unpublish');
    unpublishBtn.addEventListener('click', () => updateProjectStatus(project, 'pending', 'published'));
    actions.appendChild(unpublishBtn);
  } else if (tab === 'rejected') {
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn-secondary btn-sm';
    restoreBtn.textContent = t('admin.action.restore');
    restoreBtn.addEventListener('click', () => updateProjectStatus(project, 'pending', 'rejected'));
    actions.appendChild(restoreBtn);
  }

  return actions;
}

function renderProjectCard(project, tab) {
  const card = document.createElement('div');
  card.className = 'adm-card';

  const cover = document.createElement('div');
  cover.className = 'adm-card-cover';
  if (project.coverUrl) {
    const img = document.createElement('img');
    img.src = project.coverUrl;
    img.alt = '';
    img.loading = 'lazy';
    cover.appendChild(img);
  } else {
    cover.style.background = coverGradientFor(project.id);
  }
  card.appendChild(cover);

  const body = document.createElement('div');
  body.className = 'adm-card-body';

  const title = document.createElement('h3');
  title.className = 'adm-card-title';
  title.textContent = project.title;
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'adm-card-meta';
  const authorSpan = document.createElement('span');
  authorSpan.textContent = project.authorName;
  meta.appendChild(authorSpan);
  const dateSpan = document.createElement('span');
  dateSpan.textContent = formatDate(project.createdAt);
  meta.appendChild(dateSpan);
  body.appendChild(meta);

  if (project.description) {
    const desc = document.createElement('p');
    desc.className = 'adm-card-desc';
    desc.textContent = project.description;
    body.appendChild(desc);
  }

  if (project.tags.length || project.tools.length) {
    const chips = document.createElement('div');
    chips.className = 'adm-card-chips';
    project.tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-sm';
      chip.textContent = CATEGORY_LABELS[tag] || tag;
      chips.appendChild(chip);
    });
    project.tools.forEach((tool) => {
      const chip = document.createElement('span');
      chip.className = 'chip chip-sm';
      chip.textContent = tool;
      chips.appendChild(chip);
    });
    body.appendChild(chips);
  }

  if (project.projectUrl && isHttpUrl(project.projectUrl)) {
    const link = document.createElement('a');
    link.className = 'adm-card-link';
    link.href = project.projectUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('admin.card.open');
    body.appendChild(link);
  }

  body.appendChild(buildActions(project, tab));
  card.appendChild(body);
  return card;
}

/* ---------- Карточка комментария ---------- */

function renderCommentItem(comment) {
  const item = document.createElement('div');
  item.className = 'comment-item';

  const name = comment.author?.display_name || 'Участник сообщества';

  const avatar = document.createElement('span');
  avatar.className = 'comment-avatar';
  if (comment.author?.avatar_url) {
    const img = document.createElement('img');
    img.src = comment.author.avatar_url;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = initialOf(name);
  }

  const content = document.createElement('div');
  content.className = 'comment-content';

  const head = document.createElement('div');
  head.className = 'comment-head';
  const nameEl = document.createElement('span');
  nameEl.className = 'comment-author';
  nameEl.textContent = name;
  const dateEl = document.createElement('span');
  dateEl.className = 'comment-date';
  dateEl.textContent = formatDate(comment.created_at);
  head.append(nameEl, dateEl);

  const kindText = kindLabel(comment.kind);
  if (kindText) {
    const kindBadge = document.createElement('span');
    kindBadge.className = 'comment-kind-badge';
    kindBadge.textContent = kindText;
    head.appendChild(kindBadge);
  }

  const body = document.createElement('p');
  body.className = 'comment-body';
  body.textContent = comment.body;

  content.append(head, body);

  if (comment.project?.id) {
    const projectLink = document.createElement('a');
    projectLink.className = 'adm-comment-project';
    projectLink.href = `project.html?id=${encodeURIComponent(comment.project.id)}`;
    projectLink.textContent = `${t('admin.comment.project.prefix')} ${comment.project.title || ''}`;
    content.appendChild(projectLink);
  }

  const actions = document.createElement('div');
  actions.className = 'adm-card-actions';
  actions.appendChild(buildConfirmButton({
    label: t('admin.action.hide'),
    confirmLabel: t('admin.action.hide.confirm'),
    triggerClass: 'btn-secondary btn-sm',
    onConfirm: () => hideComment(comment)
  }));
  content.appendChild(actions);

  item.append(avatar, content);
  return item;
}

/* ---------- Инициализация ---------- */

async function init() {
  showLoading();
  await handleAccessChange();
  onAuthChange(handleAccessChange);
}

init();
