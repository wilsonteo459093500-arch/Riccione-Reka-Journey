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
-- Access model (open-team mode):
--   The app has NO login screen. Anyone with the deployed URL — and
--   therefore the bundled Supabase anon key — can read and write all
--   data. Security here is URL-based, not identity-based. This is a
--   deliberate choice for a small trusted team; if you later need
--   per-user access control, re-enable AuthGate in src/App.jsx and
--   tighten the RLS policies below back to `to authenticated`.
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

-- ---- Row Level Security: PUBLIC access (open-team mode) ----
-- `to public` covers both the anon and authenticated roles, so anyone
-- calling the API with your project's anon key can read/write.
alter table public.projects enable row level security;
alter table public.appointments enable row level security;
alter table public.team_config enable row level security;

drop policy if exists "authenticated full access" on public.projects;
drop policy if exists "public full access" on public.projects;
create policy "public full access" on public.projects
  for all to public using (true) with check (true);

drop policy if exists "authenticated full access" on public.appointments;
drop policy if exists "public full access" on public.appointments;
create policy "public full access" on public.appointments
  for all to public using (true) with check (true);

drop policy if exists "authenticated full access" on public.team_config;
drop policy if exists "public full access" on public.team_config;
create policy "public full access" on public.team_config
  for all to public using (true) with check (true);

-- ---- Realtime: broadcast changes to all connected clients ----
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.team_config;
