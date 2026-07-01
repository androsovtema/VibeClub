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
      data: { display_name: displayName }
    }
  });
}

export async function signInEmailPassword(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
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
