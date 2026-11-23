import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import supabase from '../lib/supabase';
import { handleGoogleRedirect } from '../lib/googleAuth';
handleGoogleRedirect().catch(() => {});
export type AccountUser = { id: number; username: string; email: string };
export type SavedFriend = { id: number; username: string };
export type AccountError = Error & { errors?: Record<string, string>; status?: number };
type AuthState = { user: AccountUser | null; friends: SavedFriend[]; loading: boolean; error: string; clearError: () => void; request: (path: string, method?: string, body?: unknown) => Promise<any>; login: (identifier: string, password: string) => Promise<void>; logout: () => Promise<void>; refreshFriends: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);
const KEY = 'fairshare-account-token';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null), [friends, setFriends] = useState<SavedFriend[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const token = useRef(sessionStorage.getItem(KEY) || '');
  function clear() { token.current = ''; sessionStorage.removeItem(KEY); sessionStorage.removeItem('fairshare-google-session'); setUser(null); setFriends([]); }
  const request = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    let res: Response;
    try { res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(token.current ? { Authorization: `Bearer ${token.current}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { throw new Error('You’re offline or Fairshare is unavailable. Please reconnect and try again.'); }
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) { if (res.status === 401) clear(); const error = new Error(data.errors ? Object.values(data.errors).join(' ') : data.error || 'Unable to complete this request.') as AccountError; error.status = res.status; error.errors = data.errors; throw error; }
    return data;
  }, []);
  const refreshFriends = useCallback(async () => { if (token.current) setFriends(await request('/api/friends')); }, [request]);
  async function adopt(accessToken: string) {
    try {
      if (accessToken.includes('.')) { const result = await request('/api/auth/google', 'POST', { accessToken }); token.current = result.token; setUser(result.user); }
      else { token.current = accessToken; setUser(await request('/api/auth/me')); }
      sessionStorage.setItem(KEY, token.current); await refreshFriends(); setError('');
    }
    catch (error) { if ((error as AccountError).status === 401) clear(); throw error; }
  }
  useEffect(() => {
    if (token.current) adopt(token.current).catch(error => setError(error.message)).finally(() => setLoading(false)); else setLoading(false);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && !token.current)) && session) setTimeout(() => { adopt(session.access_token).catch(error => setError(error.message)); }, 0);
    });
    const listener = (event: Event) => setError((event as CustomEvent).detail || 'Sign-in failed.');
    const reconnect = () => { if (token.current) adopt(token.current).catch(error => setError(error.message)); };
    window.addEventListener('fairshare-auth-error', listener);
    window.addEventListener('online', reconnect);
    return () => { subscription.unsubscribe(); window.removeEventListener('fairshare-auth-error', listener); window.removeEventListener('online', reconnect); };
  }, []);
  async function login(identifier: string, password: string) { const result = await request('/api/auth/login', 'POST', { identifier, password }); token.current = result.token; sessionStorage.setItem(KEY, result.token); setUser(result.user); setError(''); await refreshFriends(); }
  async function logout() {
    try { if (token.current) await request('/api/auth/logout', 'POST'); }
    finally { clear(); await supabase.auth.signOut({ scope: 'local' }); }
  }
  return <AuthContext.Provider value={{ user, friends, loading, error, clearError: () => setError(''), request, login, logout, refreshFriends }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider is missing'); return context; }
