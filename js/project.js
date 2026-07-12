/**
 * We Designerz — страница проекта (T4): карточка, обсуждение, апвоут.
 * Все пользовательские данные (title/description/body/имена) выводятся через
 * textContent/createElement — без сырого innerHTML. project_url ставится через
 * element.href только для http/https, иначе кнопка «Открыть проект» скрыта.
 */
import { supabase } from './supabase.js';
import { getCurrentUser, onAuthChange } from './auth.js';
import { openAuthModal } from './ui/authModal.js';
import { t } from './i18n/ru.js';
import { fetchProjectById, CATEGORY_LABELS, coverGradientFor, initialOf } from './projects.js';
import { stageLabel, lookingLabel, validLooking, KIND_KEYS, isKind, kindLabel } from './vocab.js';
import { isHttpUrl, autoGrowTextarea } from './util.js';

const MAX_COMMENT_LEN = 2000;

const params = new URLSearchParams(window.location.search);
const projectId = params.get('id');

const loadingEl = document.querySelector('[data-project-loading]');
const notFoundEl = document.querySelector('[data-project-not-found]');
const heroEl = document.querySelector('[data-project-hero]');
const discussionEl = document.querySelector('[data-project-discussion]');

const coverImg = document.querySelector('[data-project-cover-img]');
const coverLabel = document.querySelector('[data-project-cover-label]');
const coverCore = document.querySelector('[data-project-cover-core]');
const coverEl = document.querySelector('[data-project-cover]');
const galleryThumbsEl = document.querySelector('[data-project-gallery-thumbs]');
const toolsEl = document.querySelector('[data-project-tools]');
const titleEl = document.querySelector('[data-project-title]');
const avatarEl = document.querySelector('[data-project-avatar]');
const authorNameEl = document.querySelector('[data-project-author-name]');
const dateEl = document.querySelector('[data-project-date]');
const tagsEl = document.querySelector('[data-project-tags]');
const stageEl = document.querySelector('[data-project-stage]');
const lookingEl = document.querySelector('[data-project-looking]');
const lookingTitleEl = document.querySelector('[data-project-looking-title]');
const lookingChipsEl = document.querySelector('[data-project-looking-chips]');
const descriptionEl = document.querySelector('[data-project-description]');
const openBtn = document.querySelector('[data-project-open]');
const editBtn = document.querySelector('[data-project-edit]');
const upvoteBtn = document.querySelector('[data-project-upvote]');
const upvoteCountEl = document.querySelector('[data-upvote-count]');
const upvoteErrorEl = document.querySelector('[data-upvote-error]');

const commentsListEl = document.querySelector('[data-comments-list]');
const commentsEmptyEl = document.querySelector('[data-comments-empty]');
const commentGateEl = document.querySelector('[data-comment-gate]');
const commentFormEl = document.querySelector('[data-comment-form]');
const commentHintEl = document.querySelector('[data-comment-hint]');
const commentKindChipsEl = document.querySelector('[data-comment-kind-chips]');
const commentInput = document.querySelector('[data-comment-input]');
const commentSubmitBtn = document.querySelector('[data-comment-submit]');
const commentErrorEl = document.querySelector('[data-comment-error]');
const backLinkEl = document.querySelector('[data-back-link]');

let currentUser = null;
let currentProject = null;
let hasUpvoted = false;
let upvoteBusy = false;
let commentBusy = false;
let selectedKind = null;

let galleryImages = [];
let galleryThumbImgs = [];
let galleryIndex = 0;
let galleryTimer = null;

buildKindChips();

applyStaticText();
commentInput.addEventListener('input', () => autoGrowTextarea(commentInput));

// Большая зона показывает shimmer, пока текущий src грузится — гасим на load/error,
// чтобы холодный CDN не оставлял «дыру» (T17.1).
coverImg.addEventListener('load', () => coverEl.classList.remove('skeleton'));
coverImg.addEventListener('error', () => {
  coverEl.classList.remove('skeleton');
  console.warn('[project] обложка не загрузилась:', coverImg.src);
});

function applyStaticText() {
  backLinkEl.textContent = t('nav.back');
  document.querySelector('[data-loading-text]').textContent = t('project.loading');
  document.querySelector('[data-not-found-title]').textContent = t('project.notfound.title');
  document.querySelector('[data-not-found-text]').textContent = t('project.notfound.text');
  document.querySelector('[data-not-found-link]').textContent = t('project.notfound.link');
  coverLabel.textContent = t('project.cover.label');
  openBtn.textContent = t('project.action.open');
  editBtn.textContent = t('project.action.edit');
  lookingTitleEl.textContent = t('project.looking.title');
  document.querySelector('[data-discussion-title]').textContent = t('project.discussion.title');
  commentsEmptyEl.textContent = t('project.comments.empty');
  document.querySelector('[data-comment-gate-text]').textContent = t('project.comment.gate.text');
  document.querySelector('[data-comment-gate-action]').textContent = t('project.comment.gate.action');
  commentInput.placeholder = t('project.comment.placeholder');
  commentSubmitBtn.textContent = t('project.comment.submit');
}

// Категория коммента — одиночный выбор, повторный клик по активной снимает.
// Необязательная: без выбора коммент уходит как раньше (kind = null).
function buildKindChips() {
  commentKindChipsEl.innerHTML = '';
  KIND_KEYS.forEach((value) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip chip-sm';
    chip.dataset.value = value;
    chip.textContent = kindLabel(value);
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const activate = selectedKind !== value;
      selectedKind = activate ? value : null;
      commentKindChipsEl.querySelectorAll('.chip').forEach((c) => {
        const on = activate && c.dataset.value === value;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', String(on));
      });
    });
    commentKindChipsEl.appendChild(chip);
  });
}

function resetKindChip() {
  selectedKind = null;
  commentKindChipsEl.querySelectorAll('.chip').forEach((c) => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });
}

// Подсказка над формой: персональная по первому валидному looking_for автора,
// иначе общая (см. project.comment.hint.* в i18n).
function updateCommentHint() {
  const keys = currentProject ? validLooking(currentProject.lookingFor) : [];
  const key = keys[0];
  commentHintEl.textContent = key ? t(`project.comment.hint.${key}`) : t('project.comment.hint.default');
}

// Серверные маркеры из raise exception (T18) — распознаём в error.message и
// показываем человеко-читаемый текст вместо общей ошибки/падения в консоль.
function commentErrorMessage(error) {
  const msg = error?.message || '';
  if (msg.includes('comment_cooldown')) return t('project.comment.error.cooldown');
  if (msg.includes('comment_hourly_limit')) return t('project.comment.error.hourly');
  return null;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function showNotFound() {
  document.title = t('project.notfound.doctitle');
  loadingEl.hidden = true;
  notFoundEl.hidden = false;
}

function showProject() {
  loadingEl.hidden = true;
  heroEl.hidden = false;
  discussionEl.hidden = false;
}

function renderProject(project) {
  document.title = `${project.title} — We Designerz`;

  if (project.coverUrl) {
    coverImg.src = project.coverUrl;
    coverImg.hidden = false;
    if (!coverImg.complete) coverEl.classList.add('skeleton');
  } else {
    coverEl.style.background = coverGradientFor(project.id);
    coverLabel.hidden = false;
  }

  if (project.isCore) {
    coverCore.hidden = false;
    coverCore.title = 'команда We Designerz';
  }

  toolsEl.innerHTML = '';
  project.tools.forEach((tool) => {
    const badge = document.createElement('a');
    badge.className = 'pd-tool-badge';
    badge.href = `projects.html?tool=${encodeURIComponent(tool)}`;
    badge.textContent = tool;
    toolsEl.appendChild(badge);
  });

  titleEl.textContent = project.title;

  const authorHref = `profile.html?id=${encodeURIComponent(project.authorId)}`;
  avatarEl.href = authorHref;
  authorNameEl.href = authorHref;

  if (project.authorAvatarUrl) {
    const img = document.createElement('img');
    img.src = project.authorAvatarUrl;
    img.alt = '';
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = initialOf(project.authorName);
  }
  authorNameEl.textContent = project.authorName;
  dateEl.textContent = formatDate(project.createdAt);

  tagsEl.innerHTML = '';
  project.tags.forEach((tag) => {
    const chip = document.createElement('a');
    chip.className = 'pd-tag';
    chip.href = `projects.html?cat=${encodeURIComponent(tag)}`;
    chip.textContent = CATEGORY_LABELS[tag] || tag;
    tagsEl.appendChild(chip);
  });

  const stageText = stageLabel(project.stage);
  if (stageText) {
    stageEl.textContent = stageText;
    stageEl.hidden = false;
  }

  // «Автор ищет» — чипы-ссылки на витрину с фильтром ?looking=<key>. Пусто → блока нет.
  lookingChipsEl.innerHTML = '';
  const lookingKeys = project.lookingFor.filter((key) => lookingLabel(key));
  if (lookingKeys.length > 0) {
    lookingKeys.forEach((key) => {
      const chip = document.createElement('a');
      chip.className = 'pd-looking-chip';
      chip.href = `projects.html?looking=${encodeURIComponent(key)}`;
      chip.textContent = lookingLabel(key);
      lookingChipsEl.appendChild(chip);
    });
    lookingEl.hidden = false;
  }

  descriptionEl.textContent = project.description;

  if (project.projectUrl && isHttpUrl(project.projectUrl)) {
    openBtn.href = project.projectUrl;
    openBtn.hidden = false;
  }

  upvoteCountEl.textContent = String(project.upvotes);
  updateEditButton();
  updateCommentHint();
  buildGallery(project);
}

// Галерея: [обложка, ...images], только валидные http-URL. Одна картинка — как раньше,
// без миниатюр и автоплея. Несколько — ряд миниатюр под обложкой, автоплей 5с по кругу,
// глохнет навсегда при первом ручном клике.
function buildGallery(project) {
  stopAutoplay();
  galleryThumbsEl.innerHTML = '';

  const urls = [project.coverUrl, ...project.images].filter((url) => url && isHttpUrl(url));
  galleryImages = urls;
  galleryThumbImgs = [];
  galleryIndex = 0;

  if (urls.length <= 1) {
    galleryThumbsEl.hidden = true;
    return;
  }

  urls.forEach((url, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pd-gallery-thumb';
    if (index === 0) btn.classList.add('active');
    btn.setAttribute('aria-pressed', String(index === 0));

    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    // Битая миниатюра — прячем кнопку, дальше её не будет ни в клике, ни в автоплее
    // (isThumbReady на неё всегда вернёт false).
    img.addEventListener('error', () => {
      btn.hidden = true;
    });
    btn.appendChild(img);

    btn.addEventListener('click', () => {
      stopAutoplay();
      setActiveGalleryImage(index);
    });

    galleryThumbsEl.appendChild(btn);
    galleryThumbImgs[index] = img;
  });

  galleryThumbsEl.hidden = false;
  startAutoplay();
}

// Готова = отрисовалась не пустой (complete && naturalWidth>0). У битых картинок
// complete становится true после error, но naturalWidth остаётся 0 — те же условия
// держат их вне ротации навсегда.
function isThumbReady(index) {
  const img = galleryThumbImgs[index];
  return !!img && img.complete && img.naturalWidth > 0;
}

function setActiveGalleryImage(index) {
  galleryIndex = index;
  coverImg.classList.add('is-fading');
  coverImg.src = galleryImages[index];
  requestAnimationFrame(() => coverImg.classList.remove('is-fading'));
  if (!coverImg.complete) coverEl.classList.add('skeleton');

  galleryThumbsEl.querySelectorAll('.pd-gallery-thumb').forEach((btn, i) => {
    const active = i === index;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function startAutoplay() {
  if (galleryImages.length <= 1) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  galleryTimer = setInterval(advanceAutoplay, 5000);
}

// Перешагивает недогруженные/битые кадры. Если готовых кроме текущего нет —
// ничего не делает в этом тике (не мигаем пустой зоной).
function advanceAutoplay() {
  const total = galleryImages.length;
  for (let step = 1; step < total; step++) {
    const next = (galleryIndex + step) % total;
    if (isThumbReady(next)) {
      setActiveGalleryImage(next);
      return;
    }
  }
}

function stopAutoplay() {
  if (galleryTimer) {
    clearInterval(galleryTimer);
    galleryTimer = null;
  }
}

// Кнопка «Редактировать» видна только автору проекта (RLS всё равно отобьёт
// чужой update). Ведёт на форму в режиме редактирования.
function updateEditButton() {
  const isOwner = !!currentUser && !!currentProject && currentUser.id === currentProject.authorId;
  editBtn.hidden = !isOwner;
  if (isOwner) editBtn.href = `submit.html?id=${encodeURIComponent(currentProject.id)}`;
}

async function loadUpvoteState() {
  if (!currentUser || !currentProject) {
    hasUpvoted = false;
    updateUpvoteUI();
    return;
  }
  const { data } = await supabase
    .from('project_upvotes')
    .select('project_id')
    .eq('project_id', currentProject.id)
    .eq('user_id', currentUser.id)
    .maybeSingle();
  hasUpvoted = !!data;
  updateUpvoteUI();
}

function updateUpvoteUI() {
  upvoteBtn.classList.toggle('is-active', hasUpvoted);
  upvoteBtn.setAttribute('aria-pressed', String(hasUpvoted));
  if (currentProject) upvoteCountEl.textContent = String(currentProject.upvotes);
}

upvoteBtn.addEventListener('click', async () => {
  if (upvoteBusy || !currentProject) return;
  if (!currentUser) {
    openAuthModal('signin');
    return;
  }

  upvoteErrorEl.hidden = true;
  upvoteBusy = true;
  upvoteBtn.disabled = true;

  const wasUpvoted = hasUpvoted;
  hasUpvoted = !wasUpvoted;
  currentProject.upvotes += wasUpvoted ? -1 : 1;
  updateUpvoteUI();

  const { error } = wasUpvoted
    ? await supabase.from('project_upvotes').delete()
      .eq('project_id', currentProject.id).eq('user_id', currentUser.id)
    : await supabase.from('project_upvotes').insert({ project_id: currentProject.id, user_id: currentUser.id });

  upvoteBusy = false;
  upvoteBtn.disabled = false;

  if (error) {
    hasUpvoted = wasUpvoted;
    currentProject.upvotes += wasUpvoted ? 1 : -1;
    updateUpvoteUI();
    upvoteErrorEl.textContent = t('project.upvote.error');
    upvoteErrorEl.hidden = false;
  }
});

async function loadComments() {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, kind, created_at, author_id, author:profiles!comments_author_id_fkey(display_name, avatar_url)')
    .eq('project_id', projectId)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  renderComments(error ? [] : (data || []));
}

function renderComments(list) {
  commentsListEl.innerHTML = '';
  commentsEmptyEl.hidden = list.length > 0;
  list.forEach((comment) => commentsListEl.appendChild(renderCommentItem(comment)));
}

function renderCommentItem(comment) {
  const item = document.createElement('div');
  item.className = 'comment-item';

  const name = comment.author?.display_name || 'Участник сообщества';
  const authorHref = `profile.html?id=${encodeURIComponent(comment.author_id)}`;

  const avatar = document.createElement('a');
  avatar.className = 'comment-avatar';
  avatar.href = authorHref;
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

  const nameEl = document.createElement('a');
  nameEl.className = 'comment-author';
  nameEl.href = authorHref;
  nameEl.textContent = name;

  const dateEl2 = document.createElement('span');
  dateEl2.className = 'comment-date';
  dateEl2.textContent = formatDate(comment.created_at);

  head.appendChild(nameEl);
  head.appendChild(dateEl2);

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

  content.appendChild(head);
  content.appendChild(body);

  item.appendChild(avatar);
  item.appendChild(content);

  const isOwn = !!currentUser && comment.author_id === currentUser.id;
  if (isOwn) {
    setupOwnCommentActions(item, content, body, comment);
  }

  return item;
}

function setupOwnCommentActions(item, content, body, comment) {
  const actions = document.createElement('div');
  actions.className = 'comment-own-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'comment-action-btn';
  editBtn.textContent = t('project.comment.edit');

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'comment-action-btn';
  deleteBtn.textContent = t('project.comment.delete');

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  content.appendChild(actions);

  editBtn.addEventListener('click', () => {
    startEditComment(content, body, actions, comment);
  });
  deleteBtn.addEventListener('click', () => {
    startDeleteComment(item, content, actions, comment);
  });
}

function startEditComment(content, body, actions, comment) {
  body.hidden = true;
  actions.hidden = true;

  const textarea = document.createElement('textarea');
  textarea.className = 'comment-edit-textarea';
  textarea.maxLength = MAX_COMMENT_LEN;
  textarea.value = comment.body;

  const errorEl = document.createElement('p');
  errorEl.className = 'field-error';
  errorEl.hidden = true;

  const editActions = document.createElement('div');
  editActions.className = 'comment-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'comment-compact-btn comment-compact-btn-save comment-edit-save';
  saveBtn.textContent = t('project.comment.save');

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'comment-compact-btn comment-edit-cancel';
  cancelBtn.textContent = t('project.comment.cancel');

  editActions.appendChild(saveBtn);
  editActions.appendChild(cancelBtn);

  content.insertBefore(textarea, actions);
  content.insertBefore(errorEl, actions);
  content.insertBefore(editActions, actions);

  function exitEdit() {
    textarea.remove();
    errorEl.remove();
    editActions.remove();
    body.hidden = false;
    actions.hidden = false;
  }

  cancelBtn.addEventListener('click', exitEdit);

  saveBtn.addEventListener('click', async () => {
    const newBody = textarea.value.trim();
    if (!newBody) return;
    if (newBody.length > MAX_COMMENT_LEN) {
      errorEl.textContent = t('project.comment.error.max_len');
      errorEl.hidden = false;
      return;
    }

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    const { error } = await supabase.from('comments').update({ body: newBody }).eq('id', comment.id);
    saveBtn.disabled = false;
    cancelBtn.disabled = false;

    if (error) {
      errorEl.textContent = commentErrorMessage(error) || t('project.comment.edit.error');
      errorEl.hidden = false;
      return;
    }

    comment.body = newBody;
    body.textContent = newBody;
    exitEdit();
  });
}

function startDeleteComment(item, content, actions, comment) {
  actions.hidden = true;

  const confirmRow = document.createElement('div');
  confirmRow.className = 'comment-delete-confirm';

  const label = document.createElement('span');
  label.textContent = t('project.comment.delete.confirm');

  const errorEl = document.createElement('span');
  errorEl.className = 'field-error';
  errorEl.hidden = true;

  const yesBtn = document.createElement('button');
  yesBtn.type = 'button';
  yesBtn.className = 'comment-action-btn comment-action-danger';
  yesBtn.textContent = t('project.comment.delete.yes');

  const noBtn = document.createElement('button');
  noBtn.type = 'button';
  noBtn.className = 'comment-action-btn';
  noBtn.textContent = t('project.comment.delete.cancel');

  confirmRow.appendChild(label);
  confirmRow.appendChild(yesBtn);
  confirmRow.appendChild(noBtn);
  confirmRow.appendChild(errorEl);
  content.insertBefore(confirmRow, actions);

  noBtn.addEventListener('click', () => {
    confirmRow.remove();
    actions.hidden = false;
  });

  yesBtn.addEventListener('click', async () => {
    yesBtn.disabled = true;
    noBtn.disabled = true;
    const { error } = await supabase.from('comments').delete().eq('id', comment.id);

    if (error) {
      yesBtn.disabled = false;
      noBtn.disabled = false;
      errorEl.textContent = t('project.comment.delete.error');
      errorEl.hidden = false;
      return;
    }

    item.remove();
    commentsEmptyEl.hidden = commentsListEl.children.length > 0;
  });
}

function updateCommentGate() {
  commentGateEl.hidden = !!currentUser;
  commentFormEl.hidden = !currentUser;
}

commentFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (commentBusy || !currentUser) return;

  const body = commentInput.value.trim();
  if (!body) return;

  commentErrorEl.hidden = true;
  if (body.length > MAX_COMMENT_LEN) {
    commentErrorEl.textContent = t('project.comment.error.max_len');
    commentErrorEl.hidden = false;
    return;
  }

  commentBusy = true;
  commentSubmitBtn.disabled = true;
  commentSubmitBtn.textContent = t('project.comment.submitting');

  const { error } = await supabase.from('comments').insert({
    project_id: projectId,
    author_id: currentUser.id,
    body,
    kind: isKind(selectedKind) ? selectedKind : null
  });

  commentBusy = false;
  commentSubmitBtn.disabled = false;
  commentSubmitBtn.textContent = t('project.comment.submit');

  if (error) {
    commentErrorEl.textContent = commentErrorMessage(error) || t('project.comment.error');
    commentErrorEl.hidden = false;
    return;
  }

  commentInput.value = '';
  autoGrowTextarea(commentInput);
  resetKindChip();
  await loadComments();
});

function handleAuthChange(user) {
  currentUser = user;
  updateCommentGate();
  updateEditButton();
  if (currentProject) {
    loadUpvoteState();
    loadComments();
  }
}

async function init() {
  currentUser = await getCurrentUser();
  onAuthChange(handleAuthChange);
  updateCommentGate();

  if (!projectId) {
    showNotFound();
    return;
  }

  const { data, error } = await fetchProjectById(projectId);
  if (error || !data) {
    showNotFound();
    return;
  }

  currentProject = data;
  renderProject(data);
  await Promise.all([loadUpvoteState(), loadComments()]);
  showProject();
}

init();
