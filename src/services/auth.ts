import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = AuthSession.makeRedirectUri({
  scheme: 'prizen',
  path: 'auth/callback',
});

function extractParams(url: string) {
  const [, query = ''] = url.split('?');
  const [, hash = ''] = url.split('#');
  return new URLSearchParams(query || hash);
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return { ok: false, message: error?.message ?? 'Could not start Google sign in.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') {
    return { ok: false, message: 'Sign in was cancelled.' };
  }

  const params = extractParams(result.url);
  const code = params.get('code');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    return exchangeError
      ? { ok: false, message: exchangeError.message }
      : { ok: true, message: 'Signed in.' };
  }

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return sessionError
      ? { ok: false, message: sessionError.message }
      : { ok: true, message: 'Signed in.' };
  }

  return { ok: false, message: 'Google did not return a valid auth session.' };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: 'Signed out.' };
}
