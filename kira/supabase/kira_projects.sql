-- ============================================================
-- KIRA by RICCIONE REKA —— Supabase 建表脚本（可重复执行）
-- 在旧报价工具同一个 Supabase 项目的 SQL Editor 里整段执行。
-- 只新增 public.kira_projects；不改 public.quotes（旧报价工具）任何东西。
--
-- ⚠️ 执行前先确认：Authentication → Providers → Email → 「Allow new users to sign up」已关闭，
--    否则知道网址的人可以自己注册、看到全部报价。
-- ============================================================

create table if not exists public.kira_projects (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  owner_id    uuid default auth.uid()
);

alter table public.kira_projects enable row level security;

-- 已登录同事：全部可看、可新增、可修改（团队共享）
drop policy if exists "kira read"   on public.kira_projects;
drop policy if exists "kira insert" on public.kira_projects;
drop policy if exists "kira update" on public.kira_projects;
drop policy if exists "kira delete own" on public.kira_projects;

create policy "kira read"   on public.kira_projects for select to authenticated using (true);
create policy "kira insert" on public.kira_projects for insert to authenticated with check (true);
create policy "kira update" on public.kira_projects for update to authenticated using (true) with check (true);
-- 删除：只有做的人自己能删
create policy "kira delete own" on public.kira_projects for delete to authenticated using (owner_id = auth.uid());

-- 修改时不允许把 owner_id 改成别人
create or replace function public.kira_keep_owner() returns trigger language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  return new;
end $$;
drop trigger if exists kira_keep_owner on public.kira_projects;
create trigger kira_keep_owner before update on public.kira_projects
  for each row execute function public.kira_keep_owner();

-- 实时同步（重复执行不报错）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kira_projects'
  ) then
    alter publication supabase_realtime add table public.kira_projects;
  end if;
end $$;
