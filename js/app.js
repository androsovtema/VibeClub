/**
 * We Designerz — точка входа авторизации на странице.
 * Вешает открытие модалки логина на все [data-join], отражает состояние сессии в хедере.
 */
import { getCurrentUser, onAuthChange, signOut } from './auth.js';
import { openAuthModal, setAuthSuccessHandler } from './ui/authModal.js';
import { t } from './i18n/ru.js';

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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function renderHeaderAuth(user) {
  document.querySelectorAll('[data-header-auth]').forEach((slot) => {
    if (user) {
      const name = escapeHtml(user.user_metadata?.display_name || user.email);
      slot.innerHTML = `
        <span class="header-user">
          <span class="header-user-name">${name}</span>
          <button type="button" class="btn-secondary header-signout" data-signout>${t('auth.header.signout')}</button>
        </span>
      `;
    } else {
      slot.innerHTML = `<button type="button" class="btn-start" data-join>${t('auth.header.join')}</button>`;
    }
  });
}

document.addEventListener('click', (event) => {
  const joinBtn = event.target.closest('[data-join]');
  if (joinBtn) {
    event.preventDefault();
    openAuthModal('signin');
    return;
  }
  const signoutBtn = event.target.closest('[data-signout]');
  if (signoutBtn) {
    event.preventDefault();
    signOut();
  }
});

setAuthSuccessHandler((message) => showToast(message));

onAuthChange((user, authEvent) => {
  renderHeaderAuth(user);
  if (authEvent === 'SIGNED_OUT') showToast(t('auth.success.signout'));
});

getCurrentUser().then(renderHeaderAuth);
