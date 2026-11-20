-- ============================================================
-- KIRA「AI 识图」反馈 —— Supabase 建表脚本（可重复执行）
-- 在旧报价工具同一个 Supabase 项目的 SQL Editor 里整段执行一次。
-- 只新增 public.kira_ai_feedback 和私有 bucket「kira-ai-feedback」；不动 kira_projects / quotes / kira-plans。
--
-- 谁能读写：只有服务器（/api/plan-feedback 用 service key）。
--   RLS 打开、不给 anon / authenticated 任何 policy → 浏览器直接连 Supabase 读不到、写不进。
--   客户的户型图是私人资料：bucket 不公开。
-- ============================================================

create table if not exists public.kira_ai_feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  read_id     text not null,                 -- 同一次 AI 识图的几笔反馈共用
  kind        text not null check (kind in ('bad', 'missing', 'added')),
  reasons     text[] not null default '{}',  -- bed / wall / length / doorWindow / room / type / other
  note        text not null default '',
  template    text,                          -- 「漏了柜子」：漏了哪种
  suggestion  jsonb,                         -- 被 👎 的那个建议（种类、房间、墙线、长度、没勾的原因）
  ai          jsonb,                         -- AI 原始结果 + 送去那张图的大小 / 裁切 / 模型
  picks       jsonb,                         -- 「加入报价」时：勾了哪些、没勾哪些
  image_path  text,                          -- kira-ai-feedback bucket 里的图（同一个 read_id 只有第一笔有）
  who         text not null default ''       -- 登录 email，或 'preview'
);

create index if not exists kira_ai_feedback_read_id on public.kira_ai_feedback (read_id);
create index if not exists kira_ai_feedback_created on public.kira_ai_feedback (created_at desc);

alter table public.kira_ai_feedback enable row level security;
-- 故意不建 policy：只有 service key（服务器）能读写

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kira-ai-feedback', 'kira-ai-feedback', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- storage.objects 也不建 policy：只有 service key 能读写这个 bucket
