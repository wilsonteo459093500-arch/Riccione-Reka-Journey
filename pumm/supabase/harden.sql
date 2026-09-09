-- =====================================================================
-- PUMM ROUNDTABLE — 数据库层权限加固
--
-- 目的：把「会员看不到别人的案例、理事会只看数字」从浏览器规则
-- 变成数据库规则。执行之后，即使有人拿到 anon key，没有对应角色的
-- 账号也读不到案例正文。
--
-- ⚠️ 执行前提（顺序很重要）：
--   1. Supabase Dashboard → Authentication → Providers → 打开 Email。
--   2. 给每位会员建一个登录账号（Authentication → Users → Invite）。
--   3. 执行本脚本（建 profiles 表 + 换策略）。
--   4. 在 profiles 表里把每个 auth 用户对应到会员：
--        insert into public.profiles (user_id, member_id, role)
--        values ('<auth.users 里的 uuid>', '<members 表里的 id>', 'chair');
--      role 取值：chair / recorder / member / director
--   5. 前端：把 src/services/repo.js 里 ensureAuthed() 的匿名登录
--      换成邮箱登录页（signInWithPassword 或 signInWithOtp）。
--      在那之前不要执行本脚本 —— 执行了 PIN 登录就读不到数据了。
--
-- 本脚本可重复执行（幂等）。
-- =====================================================================

-- =================== profiles：auth 用户 ↔ 会员 ↔ 角色 ==================
create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  member_id text not null,
  role      text not null check (role in ('chair', 'recorder', 'member', 'director')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

do $$ begin
  -- 每个人只能读自己的 profile；写入只能由服务端（service_role 绕过 RLS）
  create policy "profiles: read own" on public.profiles
    for select using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- 帮手函数：当前登录者的角色 / 会员 id
create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_member_id() returns text
language sql stable security definer set search_path = public as $$
  select member_id from public.profiles where user_id = auth.uid()
$$;

-- =================== 撤掉「拿到网址就能读写」的宽松策略 =================
drop policy if exists "read members"      on public.members;
drop policy if exists "write members"     on public.members;
drop policy if exists "read sessions"     on public.sessions;
drop policy if exists "write sessions"    on public.sessions;
drop policy if exists "read cases"        on public.cases;
drop policy if exists "write cases"       on public.cases;
drop policy if exists "read commitments"  on public.commitments;
drop policy if exists "write commitments" on public.commitments;
drop policy if exists "read prospects"    on public.prospects;
drop policy if exists "write prospects"   on public.prospects;

-- =================== 按第 5 节的信任设计换新策略 ========================
do $$ begin

  -- members：全体登录会员可读名单（登录页/出席都要用）；只有桌长能写
  create policy "members: read authed" on public.members
    for select using (auth.uid() is not null);
  create policy "members: chair writes" on public.members
    for all using (public.current_role() = 'chair')
    with check (public.current_role() = 'chair');

  -- sessions：全体登录会员可读日期与出席；桌长与记录员能写
  create policy "sessions: read authed" on public.sessions
    for select using (auth.uid() is not null);
  create policy "sessions: staff writes" on public.sessions
    for all using (public.current_role() in ('chair', 'recorder'))
    with check (public.current_role() in ('chair', 'recorder'));

  -- ★ cases：案例正文只有桌长与记录员 —— 会员和理事会在数据库层就被挡住
  create policy "cases: staff only" on public.cases
    for select using (public.current_role() in ('chair', 'recorder'));
  create policy "cases: staff writes" on public.cases
    for all using (public.current_role() in ('chair', 'recorder'))
    with check (public.current_role() in ('chair', 'recorder'));

  -- commitments：桌长/记录员全读写；会员只读自己那条
  create policy "commitments: own or staff" on public.commitments
    for select using (
      public.current_role() in ('chair', 'recorder')
      or data->>'memberId' = public.current_member_id()
    );
  create policy "commitments: staff writes" on public.commitments
    for all using (public.current_role() in ('chair', 'recorder'))
    with check (public.current_role() in ('chair', 'recorder'));

  -- prospects：招募名单只有桌长
  create policy "prospects: chair only" on public.prospects
    for select using (public.current_role() = 'chair');
  create policy "prospects: chair writes" on public.prospects
    for all using (public.current_role() = 'chair')
    with check (public.current_role() = 'chair');

exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 说明：理事会（director）在这套策略下能读 members / sessions
-- （算出席率要用），读不到 cases 与别人的 commitments —— 看板上的
-- 统计数字由前端聚合，正文永远到不了理事会的浏览器。
-- =====================================================================
