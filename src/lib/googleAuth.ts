import supabase from './supabase';
export function signInWithGoogle() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID, redirectUri = import.meta.env.VITE_GOOGLE_AUTH_PROXY;
  if (!clientId || !redirectUri) throw new Error('Google sign-in is unavailable. Please use username login.');
  const state = btoa(JSON.stringify({ origin: window.location.origin, appName: 'Fairshare', supabaseUrl: import.meta.env.VITE_SUPABASE_URL, supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY }));
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&prompt=select_account&state=${encodeURIComponent(state)}`;
  const popup = window.open(url, 'google-auth', /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? '' : 'width=500,height=600');
  if (!popup) throw new Error('Allow pop-ups to sign in with Google.');
  const handler = async (event: MessageEvent) => {
    if (event.source !== popup) return;
    if (event.data?.type === 'google-auth-denied') { window.removeEventListener('message', handler); return; }
    if (event.data?.type !== 'google-auth-success') return;
    window.removeEventListener('message', handler);
    const { access_token, refresh_token } = event.data;
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) window.dispatchEvent(new CustomEvent('fairshare-auth-error', { detail: error.message }));
  };
  window.addEventListener('message', handler);
}
export async function handleGoogleRedirect() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (!fragment.has('google_auth_popup')) return;
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session) {
    window.opener?.postMessage({ type: 'google-auth-success', access_token: data.session.access_token, refresh_token: data.session.refresh_token }, location.origin);
    window.close();
  }
}
