/**
 * We Designerz — модалка «Нашли проблему?» (T22).
 * Инжектится в body при первом открытии. Отправка — только залогиненному
 * (SEC-05: RLS-политика feedback_insert_auth не пускает anon), гостю модалка
 * предлагает войти. Единственный канал репорта помимо личного чата с Тёмой.
 * Стили и паттерн (overlay/focus-trap/lockScroll) — те же, что у auth-модалки
 * (см. authModal.js), классы переиспользуются напрямую.
 */
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../auth.js';
import { openAuthModal } from './authModal.js';
import { t } from '../i18n/ru.js';
import { lockScroll, unlockScroll } from '../util.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const COOLDOWN_S = 60;
const MIN_MESSAGE_LEN = 10;

let overlay = null;
let modal = null;
let lastFocused = null;
let currentUser = null;
let inCooldown = false;
let cooldownTimer = null;

function buildMarkup() {
  const el = document.createElement('div');
  el.className = 'auth-modal-overlay';
  el.setAttribute('data-feedback-overlay', '');
  el.hidden = true;
  el.innerHTML = `
    <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
      <button type="button" class="auth-modal-close" data-feedback-close aria-label="${t('feedback.action.close')}">&times;</button>
      <div class="auth-modal-header">
        <span class="auth-modal-glyph" aria-hidden="true">✦</span>
        <h2 id="feedback-modal-title" class="auth-modal-title">${t('feedback.modal.title')}</h2>
      </div>

      <div data-feedback-view>
        <p class="auth-modal-subtitle">${t('feedback.modal.subtitle')}</p>

        <form class="auth-modal-form" data-feedback-form novalidate>
          <div class="field">
            <label for="feedback-message">${t('feedback.field.message')}</label>
            <textarea id="feedback-message" name="message" rows="4" maxlength="2000" placeholder="${t('feedback.field.message.placeholder')}" required></textarea>
          </div>
          <div class="field" data-feedback-contact-field>
            <label for="feedback-contact">${t('feedback.field.contact')}</label>
            <input id="feedback-contact" type="text" name="contact" maxlength="200" placeholder="${t('feedback.field.contact.placeholder')}" />
          </div>
          <div class="field visually-hidden" aria-hidden="true">
            <label for="feedback-hp">Оставь это поле пустым</label>
            <input id="feedback-hp" type="text" name="hp_note" tabindex="-1" autocomplete="off" />
          </div>
          <p class="auth-modal-error" data-feedback-error hidden></p>
          <button type="submit" class="btn-primary auth-modal-submit" data-feedback-submit>${t('feedback.action.submit')}</button>
        </form>
      </div>

      <div class="auth-confirm" data-feedback-success-view hidden>
        <p class="auth-modal-subtitle">${t('feedback.success.title')}</p>
        <p class="auth-modal-subtitle">${t('feedback.success.text')}</p>
        <button type="button" class="btn-primary auth-modal-submit" data-feedback-again></button>
      </div>

      <div class="auth-confirm" data-feedback-guest-view hidden>
        <p class="auth-modal-subtitle">${t('feedback.guest.text')}</p>
        <button type="button" class="btn-primary auth-modal-submit" data-feedback-signin>${t('feedback.action.signin')}</button>
      </div>
    </div>
  `;
  return el;
}

function showError(message) {
  const errorEl = modal.querySelector('[data-feedback-error]');
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function setLoading(isLoading) {
  const btn = modal.querySelector('[data-feedback-submit]');
  btn.disabled = isLoading;
  btn.textContent = isLoading ? t('feedback.action.submitting') : t('feedback.action.submit');
}

function showFormView() {
  modal.querySelector('[data-feedback-view]').hidden = false;
  modal.querySelector('[data-feedback-success-view]').hidden = true;
  modal.querySelector('[data-feedback-guest-view]').hidden = true;
  showError('');
  modal.querySelector('#feedback-message').focus();
}

function showSuccessView() {
  modal.querySelector('[data-feedback-view]').hidden = true;
  modal.querySelector('[data-feedback-success-view]').hidden = false;
  modal.querySelector('[data-feedback-guest-view]').hidden = true;
  modal.querySelector('[data-feedback-again]').focus();
}

function showGuestView() {
  modal.querySelector('[data-feedback-view]').hidden = true;
  modal.querySelector('[data-feedback-success-view]').hidden = true;
  modal.querySelector('[data-feedback-guest-view]').hidden = false;
  modal.querySelector('[data-feedback-signin]').focus();
}

function startCooldown() {
  inCooldown = true;
  const btn = modal.querySelector('[data-feedback-again]');
  let remaining = COOLDOWN_S;
  btn.disabled = true;
  btn.textContent = t('feedback.cooldown').replace('{s}', remaining);
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      inCooldown = false;
      btn.disabled = false;
      btn.textContent = t('feedback.action.again');
      return;
    }
    btn.textContent = t('feedback.cooldown').replace('{s}', remaining);
  }, 1000);
}

function trapFocus(event) {
  if (event.key === 'Escape') {
    closeFeedbackModal();
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

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  showError('');

  if (form.hp_note.value) {
    // Honeypot заполнен ботом — молча «успех» без insert.
    form.reset();
    showSuccessView();
    startCooldown();
    return;
  }

  const message = form.message.value.trim();
  if (message.length < MIN_MESSAGE_LEN) {
    return showError(t('feedback.error.required_message'));
  }
  const contact = form.contact.value.trim();

  setLoading(true);
  const { error } = await supabase.from('feedback').insert({
    user_id: currentUser.id,
    page: window.location.pathname + window.location.search,
    message,
    contact: contact || null
  });
  setLoading(false);

  if (error) return showError(t('feedback.error.generic'));

  form.reset();
  showSuccessView();
  startCooldown();
}

function attachEvents() {
  overlay.querySelector('[data-feedback-close]').addEventListener('click', closeFeedbackModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeFeedbackModal();
  });
  overlay.addEventListener('keydown', trapFocus);

  modal.querySelector('[data-feedback-form]').addEventListener('submit', handleSubmit);

  const againBtn = modal.querySelector('[data-feedback-again]');
  againBtn.textContent = t('feedback.action.again');
  againBtn.addEventListener('click', () => {
    if (inCooldown) return;
    showFormView();
  });

  modal.querySelector('[data-feedback-signin]').addEventListener('click', () => {
    closeFeedbackModal();
    openAuthModal('signin');
  });
}

function ensureModal() {
  if (overlay) return;
  overlay = buildMarkup();
  document.body.appendChild(overlay);
  modal = overlay.querySelector('.auth-modal');
  attachEvents();
}

export async function openFeedbackModal() {
  ensureModal();
  currentUser = await getCurrentUser();
  lastFocused = document.activeElement;
  overlay.hidden = false;
  document.body.classList.add('auth-modal-open');
  lockScroll();
  if (!currentUser) {
    showGuestView();
  } else if (inCooldown) {
    showSuccessView();
  } else {
    showFormView();
  }
}

export function closeFeedbackModal() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('auth-modal-open');
  unlockScroll();
  lastFocused?.focus();
}
