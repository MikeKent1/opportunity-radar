import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = AuthSession.makeRedirectUri({
  scheme: 'prizen',
  path: 'auth/callback',
});

function extractParams(url: string) {
  const params = new URLSearchParams();

  try {
    const callbackUrl = new URL(url);
    callbackUrl.searchParams.forEach((value, key) => params.set(key, value));
    new URLSearchParams(callbackUrl.hash.replace(/^#/, '')).forEach((value, key) =>
      params.set(key, value),
    );
    return params;
  } catch {
    const [beforeHash, hash = ''] = url.split('#');
    const [, query = ''] = beforeHash.split('?');
    new URLSearchParams(query).forEach((value, key) => params.set(key, value));
    new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
    return params;
  }
}

function getCallbackError(params: URLSearchParams) {
  const error = params.get('error') ?? params.get('error_code');
  if (!error) return null;

  const description =
    params.get('error_description') ??
    params.get('error_message') ??
    'Google sign in returned an error.';

  return `${description} (${error})`;
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
  const callbackError = getCallbackError(params);
  if (callbackError) {
    return { ok: false, message: callbackError };
  }

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
