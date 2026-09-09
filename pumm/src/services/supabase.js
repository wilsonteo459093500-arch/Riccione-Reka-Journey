import { createClient } from '@supabase/supabase-js';

// 云端同步是可选的。两个环境变量都填了就走 Supabase（多人、多设备、实时）；
// 没填就退回 IndexedDB（只有这台设备）。
const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = !!(url && anonKey);

export const supabase = cloudConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;
