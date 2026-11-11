import { createClient } from '@supabase/supabase-js';

// Cloud sync is opt-in: it activates only when both env vars are present.
// Without them the app falls back to local IndexedDB storage.
//   VITE_SUPABASE_URL       — your project URL
//   VITE_SUPABASE_ANON_KEY  — the public anon key
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = !!(url && anonKey);

export const supabase = cloudConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
