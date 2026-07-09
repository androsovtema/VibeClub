/**
 * We Designerz — модалка логина/регистрации.
 * Инжектится в body при первом вызове openAuthModal(). Работает на любой странице,
 * подключившей ./app.js. Стиль — на токенах css/tokens.css, компонент описан в styles.css.
 */
import { supabase } from '../supabase.js';
import { signUpEmailPassword, signInEmailPassword, signInMagicLink, getCurrentUser } from '../auth.js';
import { t, mapAuthError } from '../i18n/ru.js';
import { lockScroll, unlockScroll } from '../util.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const WELCOME_KEY = 'wdz-welcome-shown';

let overlay = null;
let modal = null;
let lastFocused = null;

function buildMarkup() {
  const el = document.createElement('div');
  el.className = 'auth-modal-overlay';
  el.setAttribute('data-auth-overlay', '');
  el.hidden = true;
  el.innerHTML = `
    <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <button type="button" class="auth-modal-close" data-auth-close aria-label="${t('auth.action.close')}">&times;</button>
      <div class="auth-modal-header">
        <span class="auth-modal-glyph" aria-hidden="true">✦</span>
        <h2 id="auth-modal-title" class="auth-modal-title" data-modal-title>${t('auth.modal.title')}</h2>
      </div>

      <div data-auth-view>
        <p class="auth-modal-subtitle">${t('auth.modal.subtitle')}</p>

        <div class="auth-modal-tabs" role="tablist">
          <button type="button" class="auth-modal-tab is-active" data-tab="signin" role="tab" aria-selected="true">${t('auth.tab.signin')}</button>
          <button type="button" class="auth-modal-tab" data-tab="signup" role="tab" aria-selected="false">${t('auth.tab.signup')}</button>
        </div>

        <form class="auth-modal-form" data-form="signin" novalidate>
          <div class="field">
            <label for="auth-signin-email">${t('auth.field.email')}</label>
            <input id="auth-signin-email" type="email" name="email" autocomplete="email" placeholder="${t('auth.field.email.placeholder')}" required />
          </div>
          <div class="field">
            <label for="auth-signin-password">${t('auth.field.password')}</label>
            <input id="auth-signin-password" type="password" name="password" autocomplete="current-password" placeholder="${t('auth.field.password.placeholder')}" required />
          </div>
          <p class="auth-modal-error" data-error hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit">${t('auth.action.signin')}</button>
          <button type="button" class="auth-modal-link" data-magic-toggle>${t('auth.action.magiclink')}</button>
        </form>

        <form class="auth-modal-form" data-form="signup" hidden novalidate>
          <div class="field">
            <label for="auth-signup-name">${t('auth.field.name')}</label>
            <input id="auth-signup-name" type="text" name="name" autocomplete="name" placeholder="${t('auth.field.name.placeholder')}" required />
          </div>
          <div class="field">
            <label for="auth-signup-email">${t('auth.field.email')}</label>
            <input id="auth-signup-email" type="email" name="email" autocomplete="email" placeholder="${t('auth.field.email.placeholder')}" required />
          </div>
          <div class="field">
            <label for="auth-signup-password">${t('auth.field.password')}</label>
            <input id="auth-signup-password" type="password" name="password" autocomplete="new-password" placeholder="${t('auth.field.password.placeholder')}" required />
          </div>
          <p class="auth-modal-error" data-error hidden></p>
          <p class="auth-modal-success" data-success hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit">${t('auth.action.signup')}</button>
        </form>

        <form class="auth-modal-form" data-form="magiclink" hidden novalidate>
          <div class="field">
            <label for="auth-magiclink-email">${t('auth.field.email')}</label>
            <input id="auth-magiclink-email" type="email" name="email" autocomplete="email" placeholder="${t('auth.field.email.placeholder')}" required />
          </div>
          <p class="auth-modal-error" data-error hidden></p>
          <p class="auth-modal-success" data-success hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit">${t('auth.action.magiclink.submit')}</button>
          <button type="button" class="auth-modal-link" data-magic-back>${t('auth.action.back')}</button>
        </form>
      </div>

      <div class="auth-welcome" data-welcome-view hidden>
        <p class="auth-modal-subtitle">${t('auth.welcome.text')}</p>
        <ul class="auth-welcome-steps">
          <li>
            <a class="auth-welcome-step" href="submit.html">
              <span class="auth-welcome-step-num" aria-hidden="true">1</span>
              <span class="auth-welcome-step-text">${t('auth.welcome.step1')}</span>
            </a>
          </li>
          <li>
            <a class="auth-welcome-step" href="https://t.me/+98-s06KjbuNhM2Zi" target="_blank" rel="noopener noreferrer">
              <span class="auth-welcome-step-num" aria-hidden="true">2</span>
              <span class="auth-welcome-step-text">${t('auth.welcome.step2')}</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  `;
  return el;
}

function setLoading(form, isLoading) {
  const btn = form.querySelector('.auth-modal-submit');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.dataset.label = btn.dataset.label || btn.textContent;
  btn.textContent = isLoading ? t('auth.action.loading') : btn.dataset.label;
}

function showError(form, message) {
  const errorEl = form.querySelector('[data-error]');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = !message;
  if (message) showSuccess(form, '');
}

function showSuccess(form, message) {
  const successEl = form.querySelector('[data-success]');
  if (!successEl) return;
  successEl.textContent = message;
  successEl.hidden = !message;
  if (message) {
    const errorEl = form.querySelector('[data-error]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }
}

function showWelcome() {
  modal.querySelector('[data-modal-title]').textContent = t('auth.welcome.title');
  modal.querySelector('[data-auth-view]').hidden = true;
  const welcomeView = modal.querySelector('[data-welcome-view]');
  welcomeView.hidden = false;
  welcomeView.querySelector('.auth-welcome-step')?.focus();
}

function resetToAuthView() {
  modal.querySelector('[data-modal-title]').textContent = t('auth.modal.title');
  modal.querySelector('[data-auth-view]').hidden = false;
  modal.querySelector('[data-welcome-view]').hidden = true;
}

function switchTab(tabName) {
  modal.querySelectorAll('.auth-modal-tab').forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  modal.querySelectorAll('.auth-modal-form').forEach((form) => {
    form.hidden = form.dataset.form !== tabName;
  });
  focusFirstField();
}

function focusFirstField() {
  const visibleForm = modal.querySelector('.auth-modal-form:not([hidden])');
  const firstInput = visibleForm?.querySelector('input');
  firstInput?.focus();
}

function trapFocus(event) {
  if (event.key === 'Escape') {
    closeAuthModal();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusables = Array.from(modal.querySelectorAll(FOCUSABLE)).filter(
    (node) => node.offsetParent !== null
  );
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function attachEvents() {
  overlay.querySelector('[data-auth-close]').addEventListener('click', closeAuthModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeAuthModal();
  });
  overlay.addEventListener('keydown', trapFocus);

  modal.querySelectorAll('.auth-modal-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  modal.querySelector('[data-magic-toggle]').addEventListener('click', () => switchTab('magiclink'));
  modal.querySelector('[data-magic-back]').addEventListener('click', () => switchTab('signin'));

  modal.querySelector('[data-form="signin"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim();
    const password = form.password.value;
    showError(form, '');
    if (!email) return showError(form, t('auth.error.required_email'));
    if (!password) return showError(form, t('auth.error.required_password'));

    setLoading(form, true);
    const { error } = await signInEmailPassword(email, password);
    setLoading(form, false);
    if (error) return showError(form, mapAuthError(error));

    onAuthSuccess(t('auth.success.signin'));
  });

  modal.querySelector('[data-form="signup"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    showError(form, '');
    if (!name) return showError(form, t('auth.error.required_name'));
    if (!email) return showError(form, t('auth.error.required_email'));
    if (!password) return showError(form, t('auth.error.required_password'));

    setLoading(form, true);
    const { data, error } = await signUpEmailPassword(email, password, name);
    setLoading(form, false);
    if (error) return showError(form, mapAuthError(error));

    if (data?.session) {
      onAuthSuccess(t('auth.success.signup'));
    } else {
      showSuccess(form, t('auth.success.signup_confirm'));
    }
  });

  modal.querySelector('[data-form="magiclink"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim();
    showError(form, '');
    showSuccess(form, '');
    if (!email) return showError(form, t('auth.error.required_email'));

    setLoading(form, true);
    const { error } = await signInMagicLink(email);
    setLoading(form, false);
    if (error) return showError(form, mapAuthError(error));

    showSuccess(form, t('auth.success.magiclink'));
  });
}

let onSuccessCallback = null;

// «Первый раз» определяем по возрасту профиля (created_at ставит триггер при
// регистрации), а не по localStorage — иначе новое устройство/очищенное
// хранилище показывает welcome старожилам. WELCOME_KEY остаётся подавителем
// повторного показа в том же браузере.
async function isFreshRegistration() {
  const user = await getCurrentUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !data?.created_at) return false;
  const ageMs = Date.now() - new Date(data.created_at).getTime();
  return ageMs < 10 * 60 * 1000;
}

async function onAuthSuccess(message) {
  if (localStorage.getItem(WELCOME_KEY)) {
    closeAuthModal();
    onSuccessCallback?.(message);
    return;
  }

  if (await isFreshRegistration()) {
    localStorage.setItem(WELCOME_KEY, '1');
    showWelcome();
    return;
  }

  closeAuthModal();
  onSuccessCallback?.(message);
}

export function setAuthSuccessHandler(cb) {
  onSuccessCallback = cb;
}

function ensureModal() {
  if (overlay) return;
  overlay = buildMarkup();
  document.body.appendChild(overlay);
  modal = overlay.querySelector('.auth-modal');
  attachEvents();
}

export function openAuthModal(initialTab = 'signin') {
  ensureModal();
  resetToAuthView();
  lastFocused = document.activeElement;
  overlay.hidden = false;
  document.body.classList.add('auth-modal-open');
  lockScroll();
  switchTab(initialTab);
}

export function closeAuthModal() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('auth-modal-open');
  unlockScroll();
  lastFocused?.focus();
}
