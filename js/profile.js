/**
 * We Designerz — публичная страница профиля (T-D4).
 * Данные profiles по id (select открыт анониму по RLS). Пользовательские данные
 * (имя/bio) — только через textContent/createElement, без сырого innerHTML.
 */
import { supabase } from './supabase.js';
import { t } from './i18n/ru.js';
import { fetchPublishedProjects, renderProjectCard, initialOf } from './projects.js';
import { isHttpUrl } from './util.js';

const params = new URLSearchParams(window.location.search);
const profileId = params.get('id');

const loadingEl = document.querySelector('[data-profile-loading]');
const notFoundEl = document.querySelector('[data-profile-not-found]');
const heroEl = document.querySelector('[data-profile-hero]');
const projectsEl = document.querySelector('[data-profile-projects]');

const avatarEl = document.querySelector('[data-profile-avatar]');
const nameEl = document.querySelector('[data-profile-name]');
const bioEl = document.querySelector('[data-profile-bio]');
const telegramLink = document.querySelector('[data-profile-telegram]');
const websiteLink = document.querySelector('[data-profile-website]');

const projectsGrid = document.querySelector('[data-profile-projects-grid]');
const projectsEmpty = document.querySelector('[data-profile-projects-empty]');

applyStaticText();

function applyStaticText() {
  document.querySelector('[data-loading-text]').textContent = t('profile.loading');
  document.querySelector('[data-not-found-title]').textContent = t('profile.notfound.title');
  document.querySelector('[data-not-found-text]').textContent = t('profile.notfound.text');
  document.querySelector('[data-not-found-link]').textContent = t('profile.notfound.link');
  document.querySelector('[data-projects-title]').textContent = t('profile.projects.title');
  projectsEmpty.textContent = t('profile.projects.empty');
}

function showNotFound() {
  document.title = t('profile.notfound.doctitle');
  loadingEl.hidden = true;
  notFoundEl.hidden = false;
}

function showProfile() {
  loadingEl.hidden = true;
  heroEl.hidden = false;
  projectsEl.hidden = false;
}

function renderProfile(profile) {
  const name = profile.display_name || 'Участник сообщества';
  document.title = `${name} — We Designerz`;

  if (profile.avatar_url) {
    const img = document.createElement('img');
    img.src = profile.avatar_url;
    img.alt = '';
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = initialOf(name);
  }

  nameEl.textContent = name;

  if (profile.bio) {
    bioEl.textContent = profile.bio;
  } else {
    bioEl.hidden = true;
  }

  if (profile.telegram) {
    const handle = profile.telegram.trim().replace(/^@/, '');
    if (handle) {
      telegramLink.href = `https://t.me/${encodeURIComponent(handle)}`;
      telegramLink.textContent = `@${handle}`;
      telegramLink.hidden = false;
    }
  }

  if (profile.website && isHttpUrl(profile.website)) {
    websiteLink.href = profile.website;
    websiteLink.textContent = profile.website;
    websiteLink.hidden = false;
  }
}

async function loadProjects() {
  const { data, error } = await fetchPublishedProjects({ authorId: profileId, sort: 'new' });
  projectsGrid.innerHTML = '';

  const list = error ? [] : (data || []);
  projectsEmpty.hidden = list.length > 0;
  list.forEach((project) => projectsGrid.appendChild(renderProjectCard(project)));
}

async function init() {
  if (!profileId) {
    showNotFound();
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, bio, telegram, website')
    .eq('id', profileId)
    .single();

  if (error || !data) {
    showNotFound();
    return;
  }

  renderProfile(data);
  await loadProjects();
  showProfile();
}

init();
