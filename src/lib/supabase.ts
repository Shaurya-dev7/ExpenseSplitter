import { createClient } from '@supabase/supabase-js';
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, storageKey: 'fairshare-google-session', autoRefreshToken: false, persistSession: true, detectSessionInUrl: true }
});
export default supabase;
