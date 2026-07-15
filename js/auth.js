/**
 * We Designerz — авторизация (почта+пароль, магик-линк).
 * Google не используем (заблокирован в РФ). service_role нигде не используется.
 */
import { supabase } from './supabase.js';
import { getCaptchaToken } from './captcha.js';
import { PRIVACY_POLICY_VERSION } from './consent.js';

// Turnstile может не отдать токен (блокировщик, offline, отказ челленджа).
// Возвращаем ошибку в форме Supabase ({ data, error }), а не кидаем исключение:
// вызывающие формы ждут именно такой контракт, иначе повиснут в setLoading(true).
async function captcha() {
  try {
    return { token: await getCaptchaToken() };
  } catch {
    return { error: { code: 'captcha_failed', message: 'captcha challenge failed' } };
  }
}

export async function signUpEmailPassword(email, password, displayName) {
  const { token: captchaToken, error } = await captcha();
  if (error) return { data: null, error };
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        privacy_policy_version: PRIVACY_POLICY_VERSION
      },
      emailRedirectTo: window.location.origin + window.location.pathname,
      captchaToken
    }
  });
}

// Повторный signup уже подтверждённой почты Supabase маскирует под успех
// (анти-enumeration): error нет, session нет, а identities — пустой массив.
export function isExistingUser(data) {
  return Boolean(data?.user) && Array.isArray(data.user.identities) && data.user.identities.length === 0;
}

export async function resendSignupEmail(email) {
  const { token: captchaToken, error } = await captcha();
  if (error) return { data: null, error };
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
      captchaToken
    }
  });
}

export async function resetPasswordForEmail(email) {
  const { token: captchaToken, error } = await captcha();
  if (error) return { data: null, error };
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
    captchaToken
  });
}

export async function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}

export async function signInEmailPassword(email, password) {
  const { token: captchaToken, error } = await captcha();
  if (error) return { data: null, error };
  return supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
}

export async function signInMagicLink(email) {
  const { token: captchaToken, error } = await captcha();
  if (error) return { data: null, error };
  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin + window.location.pathname,
      captchaToken
    }
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user ?? null;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cb(session?.user ?? null, event);
  });
  return data.subscription;
}
