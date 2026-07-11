/**
 * We Designerz — авторизация (почта+пароль, магик-линк).
 * Google не используем (заблокирован в РФ). service_role нигде не используется.
 */
import { supabase } from './supabase.js';

export async function signUpEmailPassword(email, password, displayName) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });
}

// Повторный signup уже подтверждённой почты Supabase маскирует под успех
// (анти-enumeration): error нет, session нет, а identities — пустой массив.
export function isExistingUser(data) {
  return Boolean(data?.user) && Array.isArray(data.user.identities) && data.user.identities.length === 0;
}

export async function resendSignupEmail(email) {
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });
}

export async function resetPasswordForEmail(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
}

export async function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}

export async function signInEmailPassword(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname
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
