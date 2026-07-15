/**
 * We Designerz — личный кабинет (T14, поглощает T9).
 * Редактирование своего profiles-ряда (RLS уже разрешает update own) + список своих
 * проектов любого статуса (RLS отдаёт владельцу pending/rejected, чужим — только published).
 * Пользовательский текст (bio, skills) — только через textContent/createElement.
 */
import { supabase } from './supabase.js';
import { getCurrentUser, onAuthChange } from './auth.js';
import { t } from './i18n/ru.js';
import {
  PRIVACY_POLICY_VERSION,
  PROFILE_CONTACT_FIELDS,
  DISSEMINATION_SCOPE_PURPOSE
} from './consent.js';
import { fetchOwnProjects, renderProjectCard } from './projects.js';
import { OPEN_TO_KEYS, openToLabel, validOpenTo } from './vocab.js';
import {
  isHttpUrl, normalizeHttpUrl, autoGrowTextarea,
  isValidEmail, normalizePhone, isValidPhone,
  normalizeGithubHandle, isValidGithubHandle
} from './util.js';

const MAX_SKILLS = 10;
const MAX_SKILL_LEN = 24;
const MAX_BIO_LEN = 500;
const MAX_CONSENT_FULL_NAME_LEN = 200;

const loadingEl = document.querySelector('[data-me-loading]');
const gateEl = document.querySelector('[data-me-gate]');
const cabinetEls = document.querySelectorAll('[data-me-cabinet]');
const form = document.getElementById('me-form');

const skillsGroup = form.querySelector('[data-skills-group]');
const skillsInput = form.querySelector('[data-skills-input]');
const skillsAddBtn = form.querySelector('[data-skills-add]');
const openToGroup = form.querySelector('[data-open-to-group]');
const meError = form.querySelector('[data-me-error]');
const saveBtn = form.querySelector('[data-me-save]');
const disseminationConsent = form.querySelector('[data-dissemination-consent]');
const consentFullNameInput = form.elements.consentFullName;

const projectsGrid = document.querySelector('[data-me-projects-grid]');
const projectsEmpty = document.querySelector('[data-me-projects-empty]');
const projectsEmptyLink = document.querySelector('[data-me-projects-empty-link]');
const publicLink = document.querySelector('[data-me-public-link]');
const toastEl = document.getElementById('me-toast');

let currentUser = null;
let loadedUserId = null;
let skills = [];
const selectedOpenTo = new Set();
let saving = false;
let consentMutating = false;
let hasDisseminationConsent = false;
let consentedFullName = '';

applyStaticText();
buildOpenToChips();

function applyStaticText() {
  document.querySelector('[data-loading-text]').textContent = t('me.loading');
  document.querySelector('[data-me-gate-text]').textContent = t('me.gate.text');
  document.querySelector('[data-me-gate-action]').textContent = t('me.gate.action');

  document.querySelector('[data-me-heading]').textContent = t('me.heading');
  form.querySelector('[data-label-name]').textContent = t('me.field.name');
  form.querySelector('[data-label-bio]').textContent = t('me.field.bio');
  form.querySelector('#me-bio').placeholder = t('me.field.bio.placeholder');
  form.querySelector('[data-consent-heading]').textContent = t('me.consent.heading');
  form.querySelector('[data-consent-intro]').textContent = t('me.consent.intro');
  form.querySelector('[data-contacts-heading]').textContent = t('me.field.contacts.heading');
  form.querySelector('[data-contacts-warning]').textContent = t('me.field.contacts.warning');
  form.querySelector('[data-label-consent-full-name]').textContent = t('me.consent.full_name.label');
  consentFullNameInput.placeholder = t('me.consent.full_name.placeholder');
  form.querySelector('[data-hint-consent-full-name]').textContent = t('me.consent.full_name.hint');
  form.querySelector('[data-dissemination-consent-label]').textContent = t('me.consent.dissemination.label');
  form.querySelector('[data-dissemination-consent-link]').textContent = t('me.consent.dissemination.link');
  form.querySelector('[data-label-telegram]').textContent = t('me.field.telegram');
  form.querySelector('#me-telegram').placeholder = t('me.field.telegram.placeholder');
  form.querySelector('[data-label-website]').textContent = t('me.field.website');
  form.querySelector('#me-website').placeholder = t('me.field.website.placeholder');
  form.querySelector('[data-label-github]').textContent = t('me.field.github');
  form.querySelector('#me-github').placeholder = t('me.field.github.placeholder');
  form.querySelector('[data-label-phone]').textContent = t('me.field.phone');
  form.querySelector('#me-phone').placeholder = t('me.field.phone.placeholder');
  form.querySelector('[data-label-email-public]').textContent = t('me.field.email_public');
  form.querySelector('#me-email-public').placeholder = t('me.field.email_public.placeholder');
  form.querySelector('[data-label-custom-link]').textContent = t('me.field.custom_link');
  form.querySelector('#me-link-label').placeholder = t('me.field.custom_link.label_placeholder');
  form.querySelector('#me-link-url').placeholder = t('me.field.custom_link.url_placeholder');
  form.querySelector('[data-label-skills]').textContent = t('me.field.skills');
  skillsInput.placeholder = t('me.field.skills.placeholder');
  skillsAddBtn.textContent = t('me.field.skills.add');
  form.querySelector('[data-hint-skills]').textContent = t('me.field.skills.hint');
  form.querySelector('[data-label-open-to]').textContent = t('me.field.open_to');
  form.querySelector('[data-hint-open-to]').textContent = t('me.field.open_to.hint');
  saveBtn.textContent = t('me.action.save');

  document.querySelector('[data-me-projects-title]').textContent = t('me.projects.title');
  projectsEmpty.textContent = t('me.projects.empty');
  projectsEmptyLink.textContent = t('me.projects.empty.link');
  publicLink.textContent = t('me.public.link');
}

function statusLabel(status) {
  if (status === 'pending' || status === 'published' || status === 'rejected') {
    return t(`me.status.${status}`);
  }
  return null;
}

function showFieldError(field, message) {
  const el = form.querySelector(`[data-error="${field}"]`);
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function clearErrors() {
  form.querySelectorAll('[data-error]').forEach((el) => {
    el.textContent = '';
    el.hidden = true;
  });
  meError.textContent = '';
  meError.hidden = true;
}

function hasCurrentDisseminationScope(scope) {
  return scope?.purpose === DISSEMINATION_SCOPE_PURPOSE &&
    Array.isArray(scope.fields) &&
    scope.fields.length === PROFILE_CONTACT_FIELDS.length &&
    PROFILE_CONTACT_FIELDS.every((field, index) => scope.fields[index] === field);
}

function normalizeConsentFullName(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function isValidConsentFullName(value) {
  const parts = value.split(' ').filter(Boolean);
  return value.length >= 3 && value.length <= MAX_CONSENT_FULL_NAME_LEN && parts.length >= 2;
}

function clearContactInputs() {
  form.telegram.value = '';
  form.website.value = '';
  form.github.value = '';
  form.phone.value = '';
  form.emailPublic.value = '';
  form.customLinkLabel.value = '';
  form.customLinkUrl.value = '';
}

function setBusy(isBusy) {
  saving = isBusy;
  saveBtn.disabled = isBusy;
  disseminationConsent.disabled = isBusy || consentMutating;
  consentFullNameInput.disabled = isBusy || consentMutating;
  saveBtn.textContent = t(isBusy ? 'me.action.saving' : 'me.action.save');
}

function renderSkillChips() {
  skillsGroup.innerHTML = '';
  skills.forEach((skill) => {
    const chip = document.createElement('span');
    chip.className = 'chip active submit-chip-custom';

    const label = document.createElement('span');
    label.textContent = skill;
    chip.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'submit-chip-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', t('me.field.skills.remove'));
    removeBtn.addEventListener('click', () => {
      skills = skills.filter((s) => s !== skill);
      renderSkillChips();
    });
    chip.appendChild(removeBtn);

    skillsGroup.appendChild(chip);
  });
}

function addSkill() {
  const raw = skillsInput.value.trim();
  skillsInput.value = '';
  if (!raw) return;

  if (raw.length > MAX_SKILL_LEN) {
    showFieldError('skills', t('me.error.skills_len'));
    return;
  }

  if (skills.includes(raw)) return;

  if (skills.length >= MAX_SKILLS) {
    showFieldError('skills', t('me.error.skills_max'));
    return;
  }

  showFieldError('skills', '');
  skills.push(raw);
  renderSkillChips();
}

skillsAddBtn.addEventListener('click', addSkill);
skillsInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addSkill();
});

function buildOpenToChips() {
  openToGroup.innerHTML = '';
  OPEN_TO_KEYS.forEach((value) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.value = value;
    chip.textContent = openToLabel(value);
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const active = toggleSet(selectedOpenTo, value);
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    openToGroup.appendChild(chip);
  });
}

function selectOpenToChip(value) {
  selectedOpenTo.add(value);
  const chip = openToGroup.querySelector(`[data-value="${CSS.escape(value)}"]`);
  if (chip) {
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');
  }
}

function toggleSet(set, value) {
  if (set.has(value)) {
    set.delete(value);
    return false;
  }
  set.add(value);
  return true;
}

form.website.addEventListener('blur', () => {
  const value = form.website.value.trim();
  if (value) form.website.value = normalizeHttpUrl(value);
});

form.customLinkUrl.addEventListener('blur', () => {
  const value = form.customLinkUrl.value.trim();
  if (value) form.customLinkUrl.value = normalizeHttpUrl(value);
});

form.phone.addEventListener('blur', () => {
  const value = form.phone.value.trim();
  if (value) form.phone.value = normalizePhone(value);
});

form.github.addEventListener('blur', () => {
  const value = form.github.value.trim();
  if (value) form.github.value = normalizeGithubHandle(value);
});

form.bio.addEventListener('input', () => autoGrowTextarea(form.bio));
consentFullNameInput.addEventListener('input', () => {
  showFieldError('consent_full_name', '');
});

disseminationConsent.addEventListener('change', async () => {
  showFieldError('dissemination', '');

  if (disseminationConsent.checked || !hasDisseminationConsent) return;
  if (saving || consentMutating) {
    disseminationConsent.checked = true;
    return;
  }

  consentMutating = true;
  disseminationConsent.disabled = true;
  consentFullNameInput.disabled = true;
  saveBtn.disabled = true;

  const { error } = await supabase.rpc('revoke_profile_dissemination');

  consentMutating = false;
  disseminationConsent.disabled = false;
  consentFullNameInput.disabled = false;
  saveBtn.disabled = false;

  if (error) {
    disseminationConsent.checked = true;
    showFieldError('dissemination', t('me.consent.dissemination.revoke_error'));
    return;
  }

  hasDisseminationConsent = false;
  consentedFullName = '';
  consentFullNameInput.value = '';
  clearContactInputs();
  showToast(t('me.consent.dissemination.revoked'));
});

function showToast(message, isError = false) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('toast-success', 'toast-error');
  toastEl.classList.add(isError ? 'toast-error' : 'toast-success');
  toastEl.classList.add('is-visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.remove('is-visible'), 3200);
}

async function loadProfile(user) {
  disseminationConsent.disabled = true;
  consentFullNameInput.disabled = true;
  const [profileResult, consentResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, bio, telegram, website, github, phone, email_public, custom_link_label, custom_link_url, skills, open_to')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_consents')
      .select('policy_version, scope, subject_full_name')
      .eq('consent_type', 'dissemination')
      .eq('policy_version', PRIVACY_POLICY_VERSION)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle()
  ]);

  const { data, error } = profileResult;
  const { data: consentData, error: consentError } = consentResult;

  hasDisseminationConsent = !consentError &&
    hasCurrentDisseminationScope(consentData?.scope) &&
    isValidConsentFullName(normalizeConsentFullName(consentData?.subject_full_name || ''));
  consentedFullName = hasDisseminationConsent
    ? normalizeConsentFullName(consentData.subject_full_name)
    : '';
  consentFullNameInput.value = consentedFullName;
  disseminationConsent.checked = hasDisseminationConsent;
  disseminationConsent.disabled = false;
  consentFullNameInput.disabled = false;
  if (consentError) {
    showFieldError('dissemination', t('me.consent.dissemination.load_error'));
  }

  form.displayName.value = (error || !data) ? (user.user_metadata?.display_name || '') : (data.display_name || '');
  if (error || !data) return;

  form.bio.value = data.bio || '';
  autoGrowTextarea(form.bio);
  form.telegram.value = data.telegram || '';
  form.website.value = data.website || '';
  form.github.value = data.github || '';
  form.phone.value = data.phone || '';
  form.emailPublic.value = data.email_public || '';
  form.customLinkLabel.value = data.custom_link_label || '';
  form.customLinkUrl.value = data.custom_link_url || '';

  skills = Array.isArray(data.skills) ? data.skills.filter(Boolean) : [];
  renderSkillChips();

  validOpenTo(data.open_to).forEach(selectOpenToChip);
}

async function loadProjects(user) {
  const { data, error } = await fetchOwnProjects(user.id);
  projectsGrid.innerHTML = '';

  const list = error ? [] : (data || []);
  const hasProjects = list.length > 0;
  projectsEmpty.hidden = hasProjects;
  projectsEmptyLink.hidden = hasProjects;

  list.forEach((project) => {
    const card = renderProjectCard(project);
    const cover = card.querySelector('.community-cover');
    const label = statusLabel(project.status);
    if (cover && label) {
      const badge = document.createElement('span');
      badge.className = `me-project-status is-${project.status}`;
      badge.textContent = label;
      cover.appendChild(badge);
    }
    projectsGrid.appendChild(card);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || !currentUser) return;

  clearErrors();

  const bio = form.bio.value.trim();
  if (bio.length > MAX_BIO_LEN) {
    showFieldError('bio', t('me.error.bio_len'));
    return;
  }

  const rawWebsite = form.website.value.trim();
  const website = rawWebsite ? normalizeHttpUrl(rawWebsite) : '';
  if (website !== rawWebsite) form.website.value = website;
  if (website && !isHttpUrl(website)) {
    meError.textContent = t('me.error.website');
    meError.hidden = false;
    return;
  }

  const rawCustomLinkUrl = form.customLinkUrl.value.trim();
  const customLinkUrl = rawCustomLinkUrl ? normalizeHttpUrl(rawCustomLinkUrl) : '';
  if (customLinkUrl !== rawCustomLinkUrl) form.customLinkUrl.value = customLinkUrl;
  if (customLinkUrl && !isHttpUrl(customLinkUrl)) {
    showFieldError('custom_link', t('me.error.custom_link_url'));
    return;
  }

  const phone = form.phone.value.trim() ? normalizePhone(form.phone.value) : '';
  if (phone !== form.phone.value.trim()) form.phone.value = phone;
  if (phone && !isValidPhone(phone)) {
    showFieldError('phone', t('me.error.phone'));
    return;
  }

  const emailPublic = form.emailPublic.value.trim();
  if (emailPublic && !isValidEmail(emailPublic)) {
    showFieldError('email_public', t('me.error.email_public'));
    return;
  }

  const github = form.github.value.trim() ? normalizeGithubHandle(form.github.value) : '';
  if (github !== form.github.value.trim()) form.github.value = github;
  if (github && !isValidGithubHandle(github)) {
    showFieldError('github', t('me.error.github'));
    return;
  }

  const customLinkLabel = form.customLinkLabel.value.trim();

  const contactPayload = {
    telegram: form.telegram.value.trim() || null,
    website: website || null,
    github: github || null,
    phone: phone || null,
    email_public: emailPublic || null,
    custom_link_label: customLinkLabel || null,
    custom_link_url: customLinkUrl || null
  };
  const hasContacts = Object.values(contactPayload).some(Boolean);
  const consentFullName = normalizeConsentFullName(consentFullNameInput.value);
  if (consentFullName !== consentFullNameInput.value) {
    consentFullNameInput.value = consentFullName;
  }

  if (disseminationConsent.checked && !isValidConsentFullName(consentFullName)) {
    showFieldError('consent_full_name', t('me.consent.full_name.required'));
    consentFullNameInput.focus();
    return;
  }

  if (hasContacts && !disseminationConsent.checked) {
    showFieldError('dissemination', t('me.consent.dissemination.required'));
    disseminationConsent.focus();
    return;
  }

  setBusy(true);

  if (disseminationConsent.checked &&
      (!hasDisseminationConsent || consentFullName !== consentedFullName)) {
    const { error: consentError } = await supabase.rpc('grant_profile_dissemination', {
      subject_full_name: consentFullName,
      submitted_policy_version: PRIVACY_POLICY_VERSION
    });
    if (consentError) {
      setBusy(false);
      if (consentError.message?.includes('consent_subject_full_name_invalid')) {
        showFieldError('consent_full_name', t('me.consent.full_name.required'));
      } else if (consentError.message?.includes('consent_policy_version_invalid')) {
        showFieldError('dissemination', t('me.consent.dissemination.version_invalid'));
      } else {
        showFieldError('dissemination', t('me.consent.dissemination.grant_error'));
      }
      return;
    }
    hasDisseminationConsent = true;
    consentedFullName = consentFullName;
  }

  const payload = {
    display_name: form.displayName.value.trim() || null,
    bio: bio || null,
    ...contactPayload,
    skills,
    open_to: Array.from(selectedOpenTo)
  };

  const { error } = await supabase.from('profiles').update(payload).eq('id', currentUser.id);

  setBusy(false);

  if (error) {
    if (error.message?.includes('dissemination_consent_required')) {
      hasDisseminationConsent = false;
      disseminationConsent.checked = false;
      showFieldError('dissemination', t('me.consent.dissemination.required'));
    } else {
      meError.textContent = t('me.save.error');
      meError.hidden = false;
    }
    return;
  }

  showToast(t('me.save.success'));
});

function applyAuthState(user) {
  currentUser = user;
  loadingEl.hidden = true;

  if (!user) {
    loadedUserId = null;
    hasDisseminationConsent = false;
    consentedFullName = '';
    consentFullNameInput.value = '';
    disseminationConsent.checked = false;
    disseminationConsent.disabled = true;
    consentFullNameInput.disabled = true;
    gateEl.hidden = false;
    cabinetEls.forEach((el) => { el.hidden = true; });
    return;
  }

  gateEl.hidden = true;
  cabinetEls.forEach((el) => { el.hidden = false; });
  publicLink.href = `profile.html?id=${encodeURIComponent(user.id)}`;

  if (loadedUserId !== user.id) {
    loadedUserId = user.id;
    loadProfile(user);
    loadProjects(user);
  }
}

getCurrentUser().then(applyAuthState);
onAuthChange(applyAuthState);
