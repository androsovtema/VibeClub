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
import { isHttpUrl } from './util.js';

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
const toolsEl = document.querySelector('[data-project-tools]');
const titleEl = document.querySelector('[data-project-title]');
const avatarEl = document.querySelector('[data-project-avatar]');
const authorNameEl = document.querySelector('[data-project-author-name]');
const dateEl = document.querySelector('[data-project-date]');
const tagsEl = document.querySelector('[data-project-tags]');
const descriptionEl = document.querySelector('[data-project-description]');
const openBtn = document.querySelector('[data-project-open]');
const upvoteBtn = document.querySelector('[data-project-upvote]');
const upvoteCountEl = document.querySelector('[data-upvote-count]');
const upvoteErrorEl = document.querySelector('[data-upvote-error]');

const commentsListEl = document.querySelector('[data-comments-list]');
const commentsEmptyEl = document.querySelector('[data-comments-empty]');
const commentGateEl = document.querySelector('[data-comment-gate]');
const commentFormEl = document.querySelector('[data-comment-form]');
const commentInput = document.querySelector('[data-comment-input]');
const commentSubmitBtn = document.querySelector('[data-comment-submit]');
const commentErrorEl = document.querySelector('[data-comment-error]');

let currentUser = null;
let currentProject = null;
let hasUpvoted = false;
let upvoteBusy = false;
let commentBusy = false;

applyStaticText();

function applyStaticText() {
  document.querySelector('[data-loading-text]').textContent = t('project.loading');
  document.querySelector('[data-not-found-title]').textContent = t('project.notfound.title');
  document.querySelector('[data-not-found-text]').textContent = t('project.notfound.text');
  document.querySelector('[data-not-found-link]').textContent = t('project.notfound.link');
  coverLabel.textContent = t('project.cover.label');
  openBtn.textContent = t('project.action.open');
  document.querySelector('[data-discussion-title]').textContent = t('project.discussion.title');
  commentsEmptyEl.textContent = t('project.comments.empty');
  document.querySelector('[data-comment-gate-text]').textContent = t('project.comment.gate.text');
  document.querySelector('[data-comment-gate-action]').textContent = t('project.comment.gate.action');
  commentInput.placeholder = t('project.comment.placeholder');
  commentSubmitBtn.textContent = t('project.comment.submit');
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
    const badge = document.createElement('span');
    badge.className = 'pd-tool-badge';
    badge.textContent = tool;
    toolsEl.appendChild(badge);
  });

  titleEl.textContent = project.title;

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
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = CATEGORY_LABELS[tag] || tag;
    tagsEl.appendChild(chip);
  });

  descriptionEl.textContent = project.description;

  if (project.projectUrl && isHttpUrl(project.projectUrl)) {
    openBtn.href = project.projectUrl;
    openBtn.hidden = false;
  }

  upvoteCountEl.textContent = String(project.upvotes);
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
    .select('id, body, created_at, author_id, author:profiles!comments_author_id_fkey(display_name, avatar_url)')
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

  const dateEl2 = document.createElement('span');
  dateEl2.className = 'comment-date';
  dateEl2.textContent = formatDate(comment.created_at);

  head.appendChild(nameEl);
  head.appendChild(dateEl2);

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
  textarea.value = comment.body;

  const errorEl = document.createElement('p');
  errorEl.className = 'field-error';
  errorEl.hidden = true;

  const editActions = document.createElement('div');
  editActions.className = 'comment-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary comment-edit-save';
  saveBtn.textContent = t('project.comment.save');

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary comment-edit-cancel';
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

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    const { error } = await supabase.from('comments').update({ body: newBody }).eq('id', comment.id);
    saveBtn.disabled = false;
    cancelBtn.disabled = false;

    if (error) {
      errorEl.textContent = t('project.comment.edit.error');
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
  commentBusy = true;
  commentSubmitBtn.disabled = true;
  commentSubmitBtn.textContent = t('project.comment.submitting');

  const { error } = await supabase.from('comments').insert({
    project_id: projectId,
    author_id: currentUser.id,
    body
  });

  commentBusy = false;
  commentSubmitBtn.disabled = false;
  commentSubmitBtn.textContent = t('project.comment.submit');

  if (error) {
    commentErrorEl.textContent = t('project.comment.error');
    commentErrorEl.hidden = false;
    return;
  }

  commentInput.value = '';
  await loadComments();
});

function handleAuthChange(user) {
  currentUser = user;
  updateCommentGate();
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
