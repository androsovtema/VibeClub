/**
 * We Designerz — модалка логина/регистрации.
 * Инжектится в body при первом вызове openAuthModal(). Работает на любой странице,
 * подключившей ./app.js. Стиль — на токенах css/tokens.css, компонент описан в styles.css.
 */
import { supabase } from '../supabase.js';
import {
  signUpEmailPassword,
  signInEmailPassword,
  signInMagicLink,
  getCurrentUser,
  isExistingUser,
  resendSignupEmail,
  resetPasswordForEmail,
  updatePassword
} from '../auth.js';
import { t, mapAuthError } from '../i18n/ru.js';
import { lockScroll, unlockScroll, isAsciiOnly } from '../util.js';
import { track } from '../analytics.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const WELCOME_KEY = 'wdz-welcome-shown';
const RESEND_COOLDOWN_S = 60;
const MIN_PASSWORD_LENGTH = 12;

let overlay = null;
let modal = null;
let lastFocused = null;
let confirmContext = null;
let cooldownTimer = null;

// Обёртка с кнопкой «показать/скрыть» — вместо голого <input> во всех password-полях.
function passwordFieldHtml({ id, name, autocomplete, minlength }) {
  const minlengthAttr = minlength ? ` minlength="${minlength}"` : '';
  return `
      <div class="field-password">
        <input id="${id}" type="password" name="${name}" autocomplete="${autocomplete}" placeholder="${t('auth.field.password.placeholder')}"${minlengthAttr} required />
        <button type="button" class="field-password-toggle" data-password-toggle aria-pressed="false" aria-label="${t('auth.action.password_show.aria')}">${t('auth.action.password_show')}</button>
      </div>`;
}

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
            <label for="auth-signin-password">${t('auth.field.password')}</label>${passwordFieldHtml({ id: 'auth-signin-password', name: 'password', autocomplete: 'current-password' })}
          </div>
          <p class="auth-modal-error" data-error hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit">${t('auth.action.signin')}</button>
          <button type="button" class="auth-modal-link" data-forgot-toggle>${t('auth.action.forgot')}</button>
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
            <label for="auth-signup-password">${t('auth.field.password')}</label>${passwordFieldHtml({ id: 'auth-signup-password', name: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD_LENGTH })}
          </div>
          <div class="auth-modal-consent">
            <label for="auth-signup-consent-processing">
              <input type="checkbox" id="auth-signup-consent-processing" name="consentProcessing" data-processing-consent required />
              <span>${t('auth.consent.processing.label')}</span>
            </label>
            <label for="auth-signup-consent-rules">
              <input type="checkbox" id="auth-signup-consent-rules" name="consentRules" data-rules-consent required />
              <span>${t('auth.consent.rules.label')}</span>
            </label>
          </div>
          <p class="auth-modal-error" data-error hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit" data-signup-submit disabled>${t('auth.action.signup')}</button>
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

        <form class="auth-modal-form" data-form="forgot" hidden novalidate>
          <div class="field">
            <label for="auth-forgot-email">${t('auth.field.email')}</label>
            <input id="auth-forgot-email" type="email" name="email" autocomplete="email" placeholder="${t('auth.field.email.placeholder')}" required />
          </div>
          <p class="auth-modal-error" data-error hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit">${t('auth.forgot.submit')}</button>
          <button type="button" class="auth-modal-link" data-forgot-back>${t('auth.action.back')}</button>
        </form>
      </div>

      <div class="auth-confirm" data-confirm-view hidden>
        <p class="auth-modal-subtitle" data-confirm-text></p>
        <p class="auth-modal-error" data-confirm-error hidden></p>
        <button type="button" class="btn-primary auth-modal-submit" data-confirm-resend>${t('auth.confirm.resend')}</button>
        <button type="button" class="auth-modal-link" data-confirm-back></button>
      </div>

      <div class="auth-reset" data-reset-view hidden>
        <p class="auth-modal-subtitle">${t('auth.reset.text')}</p>
        <form class="auth-modal-form" data-form="reset-password" novalidate>
          <div class="field">
            <label for="auth-reset-password">${t('auth.reset.field.password')}</label>${passwordFieldHtml({ id: 'auth-reset-password', name: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD_LENGTH })}
          </div>
          <div class="field">
            <label for="auth-reset-password-confirm">${t('auth.reset.field.password_confirm')}</label>${passwordFieldHtml({ id: 'auth-reset-password-confirm', name: 'passwordConfirm', autocomplete: 'new-password', minlength: MIN_PASSWORD_LENGTH })}
          </div>
          <p class="auth-modal-error" data-error hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit">${t('auth.reset.submit')}</button>
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

function updateSignupSubmitState(form) {
  const processing = form.querySelector('[data-processing-consent]').checked;
  const rules = form.querySelector('[data-rules-consent]').checked;
  form.querySelector('[data-signup-submit]').disabled = !(processing && rules);
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

function hideAllViews() {
  modal.querySelector('[data-auth-view]').hidden = true;
  modal.querySelector('[data-confirm-view]').hidden = true;
  modal.querySelector('[data-reset-view]').hidden = true;
  modal.querySelector('[data-welcome-view]').hidden = true;
  clearInterval(cooldownTimer);
}

function showWelcome() {
  modal.querySelector('[data-modal-title]').textContent = t('auth.welcome.title');
  hideAllViews();
  const welcomeView = modal.querySelector('[data-welcome-view]');
  welcomeView.hidden = false;
  welcomeView.querySelector('.auth-welcome-step')?.focus();
}

function resetToAuthView() {
  modal.querySelector('[data-modal-title]').textContent = t('auth.modal.title');
  confirmContext = null;
  hideAllViews();
  modal.querySelector('[data-auth-view]').hidden = false;
}

function resetResendCooldown() {
  clearInterval(cooldownTimer);
  const btn = modal.querySelector('[data-confirm-resend]');
  btn.disabled = false;
  btn.textContent = t('auth.confirm.resend');
  const errorEl = modal.querySelector('[data-confirm-error]');
  errorEl.textContent = '';
  errorEl.hidden = true;
}

function startResendCooldown() {
  const btn = modal.querySelector('[data-confirm-resend]');
  let remaining = RESEND_COOLDOWN_S;
  btn.disabled = true;
  btn.textContent = t('auth.confirm.resend.cooldown').replace('{s}', remaining);
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      btn.disabled = false;
      btn.textContent = t('auth.confirm.resend');
      return;
    }
    btn.textContent = t('auth.confirm.resend.cooldown').replace('{s}', remaining);
  }, 1000);
}

function showConfirmView({ type, email, resendFn }) {
  confirmContext = { type, email, resendFn };
  modal.querySelector('[data-modal-title]').textContent = t('auth.confirm.title');
  hideAllViews();

  const confirmView = modal.querySelector('[data-confirm-view]');
  confirmView.hidden = false;

  const textEl = confirmView.querySelector('[data-confirm-text]');
  const emailEl = document.createElement('strong');
  emailEl.className = 'auth-modal-email';
  emailEl.textContent = email;
  textEl.textContent = '';
  textEl.append(
    t('auth.confirm.text.prefix'),
    emailEl,
    type === 'reset' ? t('auth.confirm.text.suffix.reset') : t('auth.confirm.text.suffix.signup')
  );

  confirmView.querySelector('[data-confirm-back]').textContent =
    type === 'reset' ? t('auth.confirm.back.reset') : t('auth.confirm.back.signup');

  resetResendCooldown();
  confirmView.querySelector('[data-confirm-resend]').focus();
}

function showResetView() {
  modal.querySelector('[data-modal-title]').textContent = t('auth.reset.title');
  hideAllViews();
  modal.querySelector('[data-reset-view]').hidden = false;
  modal.querySelector('[data-form="reset-password"] [name="password"]').focus();
}

function switchTab(tabName) {
  modal.querySelector('[data-modal-title]').textContent = t('auth.modal.title');
  confirmContext = null;
  hideAllViews();
  modal.querySelector('[data-auth-view]').hidden = false;

  modal.querySelectorAll('.auth-modal-tab').forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  // Форма reset-password живёт вне data-auth-view (в auth-reset) — querySelectorAll
  // без скоупа гасила бы её тем же переключателем и не восстанавливала обратно.
  modal.querySelectorAll('[data-auth-view] .auth-modal-form').forEach((form) => {
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

function wirePasswordToggles() {
  modal.querySelectorAll('[data-password-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.textContent = t(reveal ? 'auth.action.password_hide' : 'auth.action.password_show');
      btn.setAttribute('aria-label', t(reveal ? 'auth.action.password_hide.aria' : 'auth.action.password_show.aria'));
      btn.setAttribute('aria-pressed', String(reveal));
      input.focus();
    });
  });
}

function attachEvents() {
  overlay.querySelector('[data-auth-close]').addEventListener('click', closeAuthModal);
  wirePasswordToggles();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeAuthModal();
  });
  overlay.addEventListener('keydown', trapFocus);

  modal.querySelectorAll('.auth-modal-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  modal.querySelector('[data-magic-toggle]').addEventListener('click', () => switchTab('magiclink'));
  modal.querySelector('[data-magic-back]').addEventListener('click', () => switchTab('signin'));

  modal.querySelector('[data-forgot-toggle]').addEventListener('click', () => {
    const signinEmail = modal.querySelector('[data-form="signin"] [name="email"]').value.trim();
    switchTab('forgot');
    if (signinEmail) modal.querySelector('[data-form="forgot"] [name="email"]').value = signinEmail;
  });
  modal.querySelector('[data-forgot-back]').addEventListener('click', () => switchTab('signin'));

  const signupForm = modal.querySelector('[data-form="signup"]');
  signupForm.querySelector('[data-processing-consent]').addEventListener('change', () => updateSignupSubmitState(signupForm));
  signupForm.querySelector('[data-rules-consent]').addEventListener('change', () => updateSignupSubmitState(signupForm));

  modal.querySelector('[data-confirm-resend]').addEventListener('click', async () => {
    if (!confirmContext) return;
    const btn = modal.querySelector('[data-confirm-resend]');
    const errorEl = modal.querySelector('[data-confirm-error]');
    btn.disabled = true;
    try {
      const { error } = await confirmContext.resendFn();
      if (error) {
        errorEl.textContent = mapAuthError(error);
        errorEl.hidden = false;
        btn.disabled = false;
        return;
      }
      errorEl.hidden = true;
      startResendCooldown();
    } catch {
      errorEl.textContent = t('auth.error.network');
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });

  modal.querySelector('[data-confirm-back]').addEventListener('click', () => {
    switchTab(confirmContext?.type === 'reset' ? 'signin' : 'signup');
  });

  modal.querySelector('[data-form="signin"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim();
    const password = form.password.value;
    showError(form, '');
    if (!email) return showError(form, t('auth.error.required_email'));
    if (!isAsciiOnly(email)) return showError(form, t('auth.error.invalid_ascii_email'));
    if (!password) return showError(form, t('auth.error.required_password'));
    if (!isAsciiOnly(password)) return showError(form, t('auth.error.invalid_ascii_password'));

    setLoading(form, true);
    try {
      const { error } = await signInEmailPassword(email, password);
      if (error) return showError(form, mapAuthError(error));

      track('auth_success', { kind: 'login' });
      onAuthSuccess(t('auth.success.signin'));
    } catch {
      showError(form, t('auth.error.network'));
    } finally {
      setLoading(form, false);
    }
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
    if (!isAsciiOnly(email)) return showError(form, t('auth.error.invalid_ascii_email'));
    if (!password) return showError(form, t('auth.error.required_password'));
    if (!isAsciiOnly(password)) return showError(form, t('auth.error.invalid_ascii_password'));
    if (password.length < MIN_PASSWORD_LENGTH) return showError(form, t('auth.error.password_too_short'));
    if (!form.querySelector('[data-processing-consent]').checked) return showError(form, t('auth.error.required_consent_processing'));
    if (!form.querySelector('[data-rules-consent]').checked) return showError(form, t('auth.error.required_consent_rules'));

    setLoading(form, true);
    try {
      const { data, error } = await signUpEmailPassword(email, password, name);
      if (error) return showError(form, mapAuthError(error));

      if (data?.session) {
        track('auth_success', { kind: 'signup' });
        onAuthSuccess(t('auth.success.signup'));
      } else if (isExistingUser(data)) {
        switchTab('signin');
        const signinForm = modal.querySelector('[data-form="signin"]');
        signinForm.email.value = email;
        showError(signinForm, t('auth.error.user_exists_signin'));
        signinForm.password.focus();
      } else {
        showConfirmView({ type: 'signup', email, resendFn: () => resendSignupEmail(email) });
      }
    } catch {
      showError(form, t('auth.error.network'));
    } finally {
      setLoading(form, false);
      updateSignupSubmitState(form);
    }
  });

  modal.querySelector('[data-form="magiclink"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim();
    showError(form, '');
    showSuccess(form, '');
    if (!email) return showError(form, t('auth.error.required_email'));
    if (!isAsciiOnly(email)) return showError(form, t('auth.error.invalid_ascii_email'));

    setLoading(form, true);
    try {
      const { error } = await signInMagicLink(email);
      if (error) return showError(form, mapAuthError(error));

      showSuccess(form, t('auth.success.magiclink'));
    } catch {
      showError(form, t('auth.error.network'));
    } finally {
      setLoading(form, false);
    }
  });

  modal.querySelector('[data-form="forgot"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim();
    showError(form, '');
    if (!email) return showError(form, t('auth.error.required_email'));
    if (!isAsciiOnly(email)) return showError(form, t('auth.error.invalid_ascii_email'));

    setLoading(form, true);
    try {
      const { error } = await resetPasswordForEmail(email);
      if (error) return showError(form, mapAuthError(error));

      showConfirmView({ type: 'reset', email, resendFn: () => resetPasswordForEmail(email) });
    } catch {
      showError(form, t('auth.error.network'));
    } finally {
      setLoading(form, false);
    }
  });

  modal.querySelector('[data-form="reset-password"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = form.password.value;
    const passwordConfirm = form.passwordConfirm.value;
    showError(form, '');
    if (!password) return showError(form, t('auth.error.required_password'));
    if (!isAsciiOnly(password)) return showError(form, t('auth.error.invalid_ascii_password'));
    if (!isAsciiOnly(passwordConfirm)) return showError(form, t('auth.error.invalid_ascii_password'));
    if (password.length < MIN_PASSWORD_LENGTH) return showError(form, t('auth.error.password_too_short'));
    if (password !== passwordConfirm) return showError(form, t('auth.error.password_mismatch'));

    setLoading(form, true);
    try {
      const { error } = await updatePassword(password);
      if (error) return showError(form, mapAuthError(error));

      closeAuthModal();
      onSuccessCallback?.(t('auth.success.password_updated'));
    } catch {
      showError(form, t('auth.error.network'));
    } finally {
      setLoading(form, false);
    }
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

// Общая точка для «первого входа»: и сабмита формы внутри модалки, и
// возврата по ссылке подтверждения почты (модалка тогда может быть ещё не
// создана и закрыта — ensureModal/open делают это сами).
export async function maybeShowWelcome() {
  if (localStorage.getItem(WELCOME_KEY)) return false;
  if (!(await isFreshRegistration())) return false;

  localStorage.setItem(WELCOME_KEY, '1');
  ensureModal();
  if (overlay.hidden) {
    lastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('auth-modal-open');
    lockScroll();
  }
  showWelcome();
  return true;
}

async function onAuthSuccess(message) {
  if (await maybeShowWelcome()) return;
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
  track('auth_open');
  resetToAuthView();
  lastFocused = document.activeElement;
  overlay.hidden = false;
  document.body.classList.add('auth-modal-open');
  lockScroll();
  if (initialTab === 'reset') {
    showResetView();
  } else {
    switchTab(initialTab);
  }
}

export function closeAuthModal() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('auth-modal-open');
  unlockScroll();
  lastFocused?.focus();
}
