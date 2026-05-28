-- ============================================================
-- 溪岸 SAIL · Delivery OS — Supabase schema
-- Run this in the Supabase SQL Editor (one time) to set up cloud sync.
-- ============================================================
--
-- Storage strategy (hybrid):
--   · Structured project data lives here in Postgres.
--   · Files (photos / PDFs / drawings) live in YOUR Google Drive.
--     The app only stores URLs — never binary content. If this app
--     ever disappears, your files are still in Drive, untouched.
--
-- (Earlier versions had an `attachments` table for base64 blobs;
-- it's no longer used. Existing tables are harmless if left.)
-- ============================================================

-- One row per project. The full project object lives in `data` (jsonb).
create table if not exists public.projects (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- One row per appointment. Same simple jsonb pattern as projects.
create table if not exists public.appointments (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Singleton team config (members + role labels). Always has one row id='team'.
create table if not exists public.team_config (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---- Row Level Security: only authenticated users may read/write ----
alter table public.projects enable row level security;
alter table public.appointments enable row level security;
alter table public.team_config enable row level security;

drop policy if exists "authenticated full access" on public.projects;
create policy "authenticated full access" on public.projects
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.appointments;
create policy "authenticated full access" on public.appointments
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.team_config;
create policy "authenticated full access" on public.team_config
  for all to authenticated using (true) with check (true);

-- ---- Realtime: broadcast changes to all connected clients ----
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.team_config;
