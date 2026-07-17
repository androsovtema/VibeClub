/**
 * Блокирующий гейт явного processing-consent для legacy-участников.
 * Источник правды — собственные rows user_consents и version-gated RPC.
 */
import { supabase } from '../supabase.js';
import {
  PRIVACY_POLICY_VERSION,
  hasCurrentProcessingScope
} from '../consent.js';
import { t } from '../i18n/ru.js';
import { lockScroll, unlockScroll } from '../util.js';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

let overlay = null;
let modal = null;
let lastFocused = null;
let confirmCallback = null;
let retryCallback = null;
let signoutCallback = null;
let busy = false;

// Невидимый pending-guard на время DB-проверки: страница видна сразу, но
// account UI фейл-клоузно заблокирован до результата. Отдельно от overlay,
// чтобы не показывать backdrop/dialog, пока consent ещё не проверен.
let shield = null;
let shieldActive = false;
let savedBodyInert = false;
let savedAriaBusy = null;

function ensureShield() {
  if (shield) return;
  shield = document.createElement('div');
  shield.className = 'reconsent-pending-shield';
  shield.setAttribute('data-reconsent-pending-shield', '');
  shield.hidden = true;
  document.body.appendChild(shield);
}

function showPendingShield() {
  ensureShield();
  if (shieldActive) return;
  shieldActive = true;
  shield.hidden = false;
  savedBodyInert = document.body.inert;
  savedAriaBusy = document.body.getAttribute('aria-busy');
  document.body.inert = true;
  document.body.setAttribute('aria-busy', 'true');
}

function hidePendingShield() {
  if (shield) shield.hidden = true;
  if (!shieldActive) return;
  shieldActive = false;
  document.body.inert = savedBodyInert;
  if (savedAriaBusy === null) document.body.removeAttribute('aria-busy');
  else document.body.setAttribute('aria-busy', savedAriaBusy);
}

function buildMarkup() {
  const el = document.createElement('div');
  el.className = 'reconsent-overlay';
  el.setAttribute('data-reconsent-overlay', '');
  el.hidden = true;
  el.innerHTML = `
    <div class="reconsent-modal" role="dialog" aria-modal="true" aria-labelledby="reconsent-title">
      <div class="reconsent-header">
        <span class="reconsent-glyph" aria-hidden="true">✦</span>
        <h2 id="reconsent-title" class="reconsent-title">${t('reconsent.title')}</h2>
      </div>

      <form class="reconsent-form" data-reconsent-form hidden novalidate>
        <p class="reconsent-text">${t('reconsent.text')}</p>
        <label class="reconsent-consent" for="reconsent-processing-consent">
          <input type="checkbox" id="reconsent-processing-consent" data-reconsent-consent />
          <span>${t('reconsent.consent.label')}</span>
        </label>
        <p class="reconsent-error" data-reconsent-error role="alert" hidden></p>
        <button type="submit" class="btn-primary reconsent-primary" data-reconsent-confirm disabled>${t('reconsent.action.confirm')}</button>
      </form>

      <div class="reconsent-check-error" data-reconsent-check-error hidden>
        <p class="reconsent-error" data-reconsent-check-message role="alert">${t('reconsent.error.check')}</p>
        <button type="button" class="btn-primary reconsent-primary" data-reconsent-retry>${t('reconsent.action.retry')}</button>
      </div>

      <button type="button" class="reconsent-signout" data-reconsent-signout>${t('reconsent.action.signout')}</button>
    </div>
  `;
  return el;
}

function ensureModal() {
  if (overlay) return;
  overlay = buildMarkup();
  document.body.appendChild(overlay);
  modal = overlay.querySelector('.reconsent-modal');

  overlay.addEventListener('keydown', trapFocus);

  const checkbox = overlay.querySelector('[data-reconsent-consent]');
  checkbox.addEventListener('change', () => {
    overlay.querySelector('[data-reconsent-confirm]').disabled = busy || !checkbox.checked;
    showError('');
  });

  overlay.querySelector('[data-reconsent-form]').addEventListener('submit', handleSubmit);
  overlay.querySelector('[data-reconsent-retry]').addEventListener('click', () => {
    if (!busy) retryCallback?.();
  });
  overlay.querySelector('[data-reconsent-signout]').addEventListener('click', handleSignout);
}

function trapFocus(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusables = Array.from(modal.querySelectorAll(FOCUSABLE)).filter(
    (node) => node.offsetParent !== null
  );
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }

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

function showError(message) {
  const error = overlay.querySelector('[data-reconsent-error]');
  error.textContent = message;
  error.hidden = !message;
}

function setBusy(isBusy) {
  busy = isBusy;
  const checkbox = overlay.querySelector('[data-reconsent-consent]');
  const confirm = overlay.querySelector('[data-reconsent-confirm]');
  const retry = overlay.querySelector('[data-reconsent-retry]');
  const signout = overlay.querySelector('[data-reconsent-signout]');
  checkbox.disabled = isBusy;
  retry.disabled = isBusy;
  signout.disabled = isBusy;
  confirm.disabled = isBusy || !checkbox.checked;
  confirm.dataset.label = confirm.dataset.label || confirm.textContent;
  confirm.textContent = isBusy ? t('auth.action.loading') : confirm.dataset.label;
}

function setMode(mode) {
  overlay.querySelector('[data-reconsent-form]').hidden = mode !== 'consent';
  overlay.querySelector('[data-reconsent-check-error]').hidden = mode !== 'error';

  const checkbox = overlay.querySelector('[data-reconsent-consent]');
  if (mode === 'consent') {
    checkbox.checked = false;
    overlay.querySelector('[data-reconsent-confirm]').disabled = true;
    checkbox.focus();
  } else {
    overlay.querySelector('[data-reconsent-retry]').focus();
  }
}

function openGate(mode, callbacks = {}) {
  // Required/error dialog всегда сменяет silent pending: guard должен быть
  // снят раньше, чем dialog станет focusable, иначе checkbox/retry получат
  // фокус на inert-теле.
  hidePendingShield();
  ensureModal();
  confirmCallback = callbacks.onConfirmed || confirmCallback;
  retryCallback = callbacks.onRetry || retryCallback;
  signoutCallback = callbacks.onSignout || signoutCallback;
  setBusy(false);
  showError('');

  if (overlay.hidden) {
    lastFocused = document.activeElement;
    overlay.hidden = false;
    lockScroll();
  }
  setMode(mode);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (busy) return;

  const checkbox = overlay.querySelector('[data-reconsent-consent]');
  if (!checkbox.checked) {
    showError(t('reconsent.error.required'));
    checkbox.focus();
    return;
  }

  setBusy(true);
  showError('');
  try {
    const { error } = await supabase.rpc('grant_processing_consent', {
      submitted_policy_version: PRIVACY_POLICY_VERSION
    });
    if (error) {
      const message = error.message?.includes('consent_policy_version_invalid')
        ? t('auth.error.policy_version')
        : t('reconsent.error.save');
      showError(message);
      return;
    }

    const result = await checkCurrentProcessingConsent();
    if (result.error || !result.hasConsent) {
      showError(t('reconsent.error.check'));
      return;
    }

    hideProcessingConsentGate();
    confirmCallback?.();
  } catch {
    showError(t('reconsent.error.save'));
  } finally {
    if (overlay && !overlay.hidden) setBusy(false);
  }
}

async function handleSignout() {
  if (busy || !signoutCallback) return;
  setBusy(true);
  try {
    const result = await signoutCallback();
    if (result?.error) throw result.error;
  } catch {
    showError(t('reconsent.error.signout'));
    setMode('consent');
  } finally {
    if (overlay && !overlay.hidden) setBusy(false);
  }
}

export async function checkCurrentProcessingConsent() {
  try {
    const { data, error } = await supabase
      .from('user_consents')
      .select('id, scope')
      .eq('consent_type', 'processing')
      .eq('policy_version', PRIVACY_POLICY_VERSION)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle();

    if (error) return { hasConsent: false, error };
    return {
      hasConsent: Boolean(data) && hasCurrentProcessingScope(data.scope),
      error: null
    };
  } catch (error) {
    return { hasConsent: false, error };
  }
}

export function showProcessingConsentChecking() {
  // Имя сохранено для app.js: это больше не dialog-режим, а невидимый
  // fail-closed guard на время DB-проверки (см. showPendingShield выше).
  showPendingShield();
}

export function showProcessingConsentRequired(callbacks) {
  openGate('consent', callbacks);
}

export function showProcessingConsentCheckError(callbacks) {
  openGate('error', callbacks);
}

export function hideProcessingConsentGate() {
  hidePendingShield();
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  setBusy(false);
  unlockScroll();
  lastFocused?.focus();
}

export function isProcessingConsentGateOpen() {
  return Boolean(overlay && !overlay.hidden);
}
