-- =====================================================================
-- Sail CRM — Supabase schema
-- Run this once in your Supabase project's SQL editor.
--
-- Strategy: each domain object is stored as a single `data` JSONB column
-- keyed by id. This keeps the app simple (no migrations as the lead
-- shape evolves) and indexed access is cheap enough at our scale.
--
-- For production, lock down RLS to authenticated users. The default
-- below allows any anon/authenticated user — convenient for an
-- internal team behind a private URL. Replace with role-based policies
-- when you turn on email login.
-- =====================================================================

-- Required for IF NOT EXISTS on policies
create extension if not exists "uuid-ossp";

-- =================== TABLES ===========================================
create table if not exists public.leads (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.appointments (
  id text primary key,
  lead_id text references public.leads(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.users (
  id text primary key,             -- username (Wilson, Sheerly, …)
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.audit (
  id text primary key,
  timestamp timestamptz not null default now(),
  data jsonb not null
);

create index if not exists idx_audit_timestamp on public.audit (timestamp desc);
create index if not exists idx_appointments_lead on public.appointments (lead_id);

-- =================== ROW LEVEL SECURITY ==============================
alter table public.leads        enable row level security;
alter table public.appointments enable row level security;
alter table public.users        enable row level security;
alter table public.audit        enable row level security;

-- Permissive policies for internal team. Replace with role-based once
-- you enable email/password auth.
do $$ begin
  create policy "anon read leads"        on public.leads        for select using (true);
  create policy "anon write leads"       on public.leads        for all using (true) with check (true);
  create policy "anon read appts"        on public.appointments for select using (true);
  create policy "anon write appts"       on public.appointments for all using (true) with check (true);
  create policy "anon read users"        on public.users        for select using (true);
  create policy "anon write users"       on public.users        for all using (true) with check (true);
  create policy "anon read audit"        on public.audit        for select using (true);
  create policy "anon write audit"       on public.audit        for all using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- =================== REALTIME =========================================
-- Enable realtime broadcasts so all open browsers see updates instantly.
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.audit;
