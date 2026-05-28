import { createClient } from '@supabase/supabase-js';

// Cloud sync is opt-in. When both env vars are set the app uses Supabase
// for storage, auth & realtime; otherwise it falls back to IndexedDB
// (single browser, no multi-user).
const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = !!(url && anonKey);

export const supabase = cloudConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;
