/**
 * We Designerz — публичная страница профиля (T-D4).
 * Данные profiles по id (select открыт анониму по RLS). Пользовательские данные
 * (имя/bio) — только через textContent/createElement, без сырого innerHTML.
 */
import { supabase } from './supabase.js';
import { t } from './i18n/ru.js';
import { fetchPublishedProjects, renderProjectCard, initialOf } from './projects.js';
import { isHttpUrl, wireBackLink } from './util.js';
import { getCurrentUser } from './auth.js';
import { validOpenTo, openToLabel } from './vocab.js';

const params = new URLSearchParams(window.location.search);
const profileId = params.get('id');

const loadingEl = document.querySelector('[data-profile-loading]');
const notFoundEl = document.querySelector('[data-profile-not-found]');
const heroEl = document.querySelector('[data-profile-hero]');
const projectsEl = document.querySelector('[data-profile-projects]');

const avatarEl = document.querySelector('[data-profile-avatar]');
const nameEl = document.querySelector('[data-profile-name]');
const bioEl = document.querySelector('[data-profile-bio]');
const editLink = document.querySelector('[data-profile-edit]');
const skillsEl = document.querySelector('[data-profile-skills]');
const openToEl = document.querySelector('[data-profile-open-to]');
const telegramLink = document.querySelector('[data-profile-telegram]');
const websiteLink = document.querySelector('[data-profile-website]');

const projectsGrid = document.querySelector('[data-profile-projects-grid]');
const projectsEmpty = document.querySelector('[data-profile-projects-empty]');
const backLinkEl = document.querySelector('[data-back-link]');

applyStaticText();
wireBackLink(backLinkEl);

function applyStaticText() {
  backLinkEl.textContent = t('nav.back');
  editLink.textContent = t('profile.edit.link');
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

  const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean) : [];
  if (skills.length) {
    skillsEl.innerHTML = '';
    skills.forEach((skill) => {
      const chip = document.createElement('span');
      chip.className = 'pf-skill-chip';
      chip.textContent = skill;
      skillsEl.appendChild(chip);
    });
    skillsEl.hidden = false;
  }

  const openTo = validOpenTo(profile.open_to);
  if (openTo.length) {
    openToEl.innerHTML = '';
    openTo.forEach((key) => {
      const badge = document.createElement('span');
      badge.className = 'pf-open-badge';
      badge.textContent = openToLabel(key);
      openToEl.appendChild(badge);
    });
    openToEl.hidden = false;
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
    .select('id, display_name, avatar_url, bio, telegram, website, skills, open_to')
    .eq('id', profileId)
    .single();

  if (error || !data) {
    showNotFound();
    return;
  }

  renderProfile(data);
  const currentUser = await getCurrentUser();
  editLink.hidden = currentUser?.id !== profileId;
  await loadProjects();
  showProfile();
}

init();
