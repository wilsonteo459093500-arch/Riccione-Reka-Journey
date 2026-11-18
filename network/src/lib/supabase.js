import { createClient } from '@supabase/supabase-js';

// 有设两个环境变数 → 云端模式（登入、多设备、私有存储）
// 没设 → 本机模式（资料只在这个浏览器，给试用 / 开发用）
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = !!(url && anonKey);

export const supabase = cloudConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'network-auth' } })
  : null;

export const BUCKET = 'network';
