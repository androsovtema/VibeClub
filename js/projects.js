/**
 * We Designerz — данные и карточка проектов сообщества (T2 + T-D3).
 * Читает только published-проекты из Supabase (RLS ограничивает остальное на бэкенде).
 * Карточка строится через createElement/textContent — без сырого innerHTML пользовательских данных.
 */
import { supabase } from './supabase.js';
import { stageLabel, lookingLabel, validLooking } from './vocab.js';
import { t } from './i18n/ru.js';

export const CATEGORY_LABELS = {
  prod: 'Продуктивность',
  biz: 'Бизнес',
  game: 'Игры',
  home: 'Личное',
  art: 'Творчество'
};

// Декоративная палитра-заглушка для обложек без скриншота. Осознанно не токенизируем —
// это фиксированный набор акцентных градиентов, не связанный с UI-токенами.
const COVER_GRADIENTS = [
  'linear-gradient(135deg, oklch(0.34 0.13 250), oklch(0.24 0.07 295))',
  'linear-gradient(135deg, oklch(0.36 0.14 320), oklch(0.26 0.08 350))',
  'linear-gradient(135deg, oklch(0.40 0.13 145), oklch(0.26 0.07 200))',
  'linear-gradient(135deg, oklch(0.42 0.13 60), oklch(0.28 0.09 30))',
  'linear-gradient(135deg, oklch(0.36 0.13 280), oklch(0.25 0.08 320))',
  'linear-gradient(135deg, oklch(0.34 0.12 210), oklch(0.24 0.07 260))'
];

export function coverGradientFor(id) {
  const str = String(id ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}

const SELECT = '*, author:profiles!projects_author_id_fkey(display_name, avatar_url), comments(count)';

function normalizeProject(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url || null,
    images: Array.isArray(row.images) ? row.images : [],
    projectUrl: row.project_url,
    tags: Array.isArray(row.tags) ? row.tags : [],
    tools: Array.isArray(row.tools) ? row.tools : [],
    isCore: !!row.is_core,
    upvotes: row.upvotes || 0,
    commentsCount: row.comments?.[0]?.count ?? 0,
    authorId: row.author_id,
    authorName: row.author?.display_name || 'Участник сообщества',
    authorAvatarUrl: row.author?.avatar_url || null,
    createdAt: row.created_at,
    stage: row.stage || null,
    lookingFor: validLooking(row.looking_for),
    status: row.status
  };
}

/**
 * @param {{ category?: string, sort?: 'new'|'top', limit?: number, authorId?: string, tool?: string, looking?: string }} opts
 */
export async function fetchPublishedProjects({ category, sort = 'new', limit, authorId, tool, looking } = {}) {
  let query = supabase.from('projects').select(SELECT).eq('status', 'published');

  if (category && category !== 'all') {
    query = query.contains('tags', [category]);
  }

  if (tool) {
    query = query.contains('tools', [tool]);
  }

  if (looking) {
    query = query.contains('looking_for', [looking]);
  }

  if (authorId) {
    query = query.eq('author_id', authorId);
  }

  query = sort === 'top'
    ? query.order('upvotes', { ascending: false }).order('created_at', { ascending: false })
    : query.order('created_at', { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: data.map(normalizeProject), error: null };
}

// Свои проекты любого статуса (T14, me.html) — RLS уже отдаёт владельцу свои pending/rejected.
export async function fetchOwnProjects(authorId) {
  const { data, error } = await supabase
    .from('projects')
    .select(SELECT)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false });
  if (error) return { data: null, error };
  return { data: data.map(normalizeProject), error: null };
}

export async function fetchProjectById(id) {
  const { data, error } = await supabase.from('projects').select(SELECT).eq('id', id).single();
  if (error) return { data: null, error };
  return { data: normalizeProject(data), error: null };
}

export function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

/**
 * Карточка проекта в стиле превью YouTube-видео. Возвращает DOM-узел (ссылку).
 */
export function renderProjectCard(project) {
  const card = document.createElement('a');
  card.className = 'community-card';
  card.href = `project.html?id=${encodeURIComponent(project.id)}`;

  const cover = document.createElement('div');
  cover.className = 'community-cover';

  if (project.coverUrl) {
    const img = document.createElement('img');
    img.className = 'community-cover-img';
    img.src = project.coverUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    cover.appendChild(img);
  } else {
    cover.classList.add('community-cover-placeholder');
    cover.style.background = coverGradientFor(project.id);
    const label = document.createElement('span');
    label.className = 'community-cover-label';
    label.textContent = 'скриншот проекта';
    cover.appendChild(label);
  }

  if (project.tools[0]) {
    const toolBadge = document.createElement('span');
    toolBadge.className = 'community-cover-badge';
    toolBadge.textContent = project.tools[0];
    cover.appendChild(toolBadge);
  }

  if (project.isCore) {
    const coreBadge = document.createElement('span');
    coreBadge.className = 'community-cover-core community-core-mark';
    coreBadge.textContent = '✦';
    coreBadge.title = 'команда We Designerz';
    cover.appendChild(coreBadge);
  }

  const body = document.createElement('div');
  body.className = 'community-body';

  const authorRow = document.createElement('div');
  authorRow.className = 'community-author';

  const avatar = document.createElement('span');
  avatar.className = 'community-avatar';
  if (project.authorAvatarUrl) {
    const avatarImg = document.createElement('img');
    avatarImg.src = project.authorAvatarUrl;
    avatarImg.alt = '';
    avatar.appendChild(avatarImg);
  } else {
    avatar.textContent = initialOf(project.authorName);
  }
  authorRow.appendChild(avatar);

  const authorName = document.createElement('span');
  authorName.className = 'community-author-name';
  authorName.textContent = project.authorName;
  authorRow.appendChild(authorName);

  const title = document.createElement('h3');
  title.className = 'community-title';
  title.textContent = project.title;

  const meta = document.createElement('div');
  meta.className = 'community-footer';

  const likes = document.createElement('span');
  likes.textContent = `♥ ${project.upvotes}`;
  meta.appendChild(likes);

  const comments = document.createElement('span');
  comments.textContent = `💬 ${project.commentsCount}`;
  meta.appendChild(comments);

  const stageText = stageLabel(project.stage);
  if (stageText) {
    const stageEl = document.createElement('span');
    stageEl.className = 'community-footer-stage';
    stageEl.textContent = stageText;
    meta.appendChild(stageEl);
  }

  // Максимум один запрос на карточке, чтобы не перегружать мету.
  const firstLooking = lookingLabel(project.lookingFor[0]);
  if (firstLooking) {
    const lookingEl = document.createElement('span');
    lookingEl.className = 'community-footer-looking';
    lookingEl.textContent = `${t('card.looking.prefix')}: ${firstLooking}`;
    meta.appendChild(lookingEl);
  }

  // Тег последним — у него margin-left:auto, прижимает к правому краю строки.
  if (project.tags[0]) {
    const tagEl = document.createElement('span');
    tagEl.className = 'community-footer-tag';
    tagEl.textContent = CATEGORY_LABELS[project.tags[0]] || project.tags[0];
    meta.appendChild(tagEl);
  }

  body.appendChild(authorRow);
  body.appendChild(title);
  body.appendChild(meta);

  card.appendChild(cover);
  card.appendChild(body);
  return card;
}
