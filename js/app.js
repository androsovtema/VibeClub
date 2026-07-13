/**
 * We Designerz — точка входа авторизации на странице.
 * Вешает открытие модалки логина на все [data-join], отражает состояние сессии в хедере.
 */
import { getCurrentUser, onAuthChange, signOut } from './auth.js';
import { openAuthModal, setAuthSuccessHandler, maybeShowWelcome } from './ui/authModal.js';
import { openFeedbackModal } from './ui/feedbackModal.js';
import { t } from './i18n/ru.js';
import { escapeHtml, lockScroll, unlockScroll } from './util.js';
import { initAnalytics, track } from './analytics.js';

initAnalytics();

// GoTrue кладёт тип редиректа в хеш (#access_token=...&type=signup|recovery|magiclink)
// — читаем один раз при загрузке, до того как supabase-js сам подчистит хеш.
const URL_HASH_PARAMS = new URLSearchParams(window.location.hash.slice(1));
const URL_AUTH_TYPE = URL_HASH_PARAMS.get('type');
// Протухшая/использованная ссылка из письма: GoTrue редиректит с ошибкой в хеше
// (#error=access_denied&error_code=otp_expired…) — supabase-js её не трогает,
// и без обработки человек молча оказывается на главной без объяснений.
const URL_AUTH_ERROR = URL_HASH_PARAMS.get('error_code') || URL_HASH_PARAMS.get('error');
let urlAuthHandled = false;

// main.js — classic script (не модуль, см. его комментарий вверху), импортировать
// util.js не может. Мост на window даёт бургер-меню тот же счётчик блокировки
// скролла, что и auth-модалке — иначе оба напрямую трогают body.style.overflow
// и мешают друг другу при одновременном открытии.
window.wdzLockScroll = lockScroll;
window.wdzUnlockScroll = unlockScroll;

function showToast(message, isError = false) {
  const toast = document.getElementById('join-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('toast-success', 'toast-error');
  toast.classList.add(isError ? 'toast-error' : 'toast-success');
  toast.classList.add('is-visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function renderStaticNotes() {
  document.querySelectorAll('[data-hero-note]').forEach((el) => {
    el.textContent = t('hero.note');
  });
  document.querySelectorAll('[data-community-cta-note]').forEach((el) => {
    el.textContent = t('community.cta.note');
  });
  document.querySelectorAll('[data-feedback-open]').forEach((el) => {
    el.textContent = t('feedback.footer.link');
  });
}

function renderHeaderAuth(user) {
  document.querySelectorAll('[data-header-auth]').forEach((slot) => {
    if (user) {
      const name = escapeHtml(user.user_metadata?.display_name || user.email);
      slot.innerHTML = `
        <span class="header-user">
          <a class="header-user-name" href="profile.html?id=${encodeURIComponent(user.id)}">${name}</a>
          <button type="button" class="btn-secondary header-signout" data-signout>${t('auth.header.signout')}</button>
        </span>
      `;
    } else {
      slot.innerHTML = `<button type="button" class="btn-start" data-join>${t('auth.header.join')}</button>`;
    }
  });
}

function updateJoinButtons(user) {
  document.querySelectorAll('[data-join]').forEach((btn) => {
    if (btn.closest('[data-header-auth]')) return;
    if (btn.hasAttribute('data-comment-gate-action') || btn.hasAttribute('data-submit-gate-action')) return;
    if (!btn.dataset.joinLabel) btn.dataset.joinLabel = btn.textContent;
    btn.textContent = user ? t('nav.join.member') : btn.dataset.joinLabel;
  });
}

let currentUser = null;

document.addEventListener('click', (event) => {
  const feedbackBtn = event.target.closest('[data-feedback-open]');
  if (feedbackBtn) {
    event.preventDefault();
    openFeedbackModal();
    return;
  }
  const joinBtn = event.target.closest('[data-join]');
  if (joinBtn) {
    event.preventDefault();
    const isGate = joinBtn.hasAttribute('data-comment-gate-action') || joinBtn.hasAttribute('data-submit-gate-action');
    const place = isGate ? 'gate' : joinBtn.closest('[data-header-auth]') ? 'nav' : 'hero';
    track('join_click', { place });
    if (currentUser && !isGate) {
      window.location.href = 'submit.html';
    } else {
      openAuthModal('signin');
    }
    return;
  }
  const signoutBtn = event.target.closest('[data-signout]');
  if (signoutBtn) {
    event.preventDefault();
    signOut();
  }
});

renderStaticNotes();

if (URL_AUTH_ERROR) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
  showToast(t('auth.error.link_expired'), true);
}

setAuthSuccessHandler((message) => showToast(message));

onAuthChange(async (user, authEvent) => {
  currentUser = user;
  renderHeaderAuth(user);
  updateJoinButtons(user);
  if (authEvent === 'SIGNED_OUT') showToast(t('auth.success.signout'));

  if (authEvent === 'PASSWORD_RECOVERY') {
    urlAuthHandled = true;
    openAuthModal('reset');
  }

  if (authEvent === 'SIGNED_IN' && URL_AUTH_TYPE === 'signup' && !urlAuthHandled) {
    urlAuthHandled = true;
    track('auth_success', { kind: 'signup' });
    const shownWelcome = await maybeShowWelcome();
    if (!shownWelcome) showToast(t('auth.success.email_confirmed'));
  }

  if (authEvent === 'SIGNED_IN' && URL_AUTH_TYPE === 'magiclink' && !urlAuthHandled) {
    urlAuthHandled = true;
    track('auth_success', { kind: 'magic' });
  }
});

getCurrentUser().then((user) => {
  currentUser = user;
  renderHeaderAuth(user);
  updateJoinButtons(user);
});
