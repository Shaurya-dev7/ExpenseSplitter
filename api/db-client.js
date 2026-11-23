import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = (url && key)
  ? createClient(url, key, {
      global: {
        fetch: async (targetUrl, options) => {
          const res = await fetch(targetUrl, options);
          if (!res.ok && res.status >= 500) triggerRestore();
          return res;
        },
      },
    })
  : null;

export default supabase;
