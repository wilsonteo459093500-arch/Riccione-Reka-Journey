-- ============================================================
-- 溪岸 SAIL · Delivery OS — Supabase schema
-- Run this in the Supabase SQL Editor (one time) to set up cloud sync.
-- ============================================================

-- One row per project. The full project object lives in `data` (jsonb).
create table if not exists public.projects (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Attachment binaries (base64 data URLs), keyed by attachment id.
create table if not exists public.attachments (
  id       text primary key,
  content  text not null
);

-- ---- Row Level Security: only authenticated users may read/write ----
alter table public.projects   enable row level security;
alter table public.attachments enable row level security;

drop policy if exists "authenticated full access" on public.projects;
create policy "authenticated full access" on public.projects
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.attachments;
create policy "authenticated full access" on public.attachments
  for all to authenticated using (true) with check (true);

-- ---- Realtime: broadcast project changes to all connected clients ----
alter publication supabase_realtime add table public.projects;

-- ============================================================
-- Estimated Quotation (报价工具) — shared team records
-- One row per quotation record (each version is its own row; versions
-- of the same customer share a groupId inside `data`).
-- ============================================================
create table if not exists public.quotes (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.quotes enable row level security;

drop policy if exists "authenticated full access" on public.quotes;
create policy "authenticated full access" on public.quotes
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.quotes;
