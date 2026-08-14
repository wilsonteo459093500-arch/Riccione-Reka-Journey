-- =====================================================================
-- PUMM ROUNDTABLE 运维系统 — Supabase schema
-- 在你的 Supabase 项目 SQL Editor 里执行一次。
--
-- 策略：每个领域对象存成一列 `data` jsonb，以 id 为主键。
-- 应用侧形状演进时不用写迁移，这个规模下索引开销可以忽略。
--
-- ⚠️ 保密提醒（规格第 5 节）：
-- 案例正文受保密协议约束。下面的默认 RLS 策略是「拿到网址就能读写」，
-- 只适合把网址当密码的自用场景。任何人拿到 anon key 就能读到案例正文。
-- 要真正把理事会挡在案例正文外面，见文件末尾的「加固」一节。
-- =====================================================================

-- =================== 表 ==============================================
create table if not exists public.members (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.sessions (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- 案例：每场每位案主一条 = 1 页 Case Record
-- data.advices[].advisorId 是全系统最关键的字段：
-- 日后要证明「老板帮老板」而不是「顾问给答案」，靠的就是它。
create table if not exists public.cases (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.commitments (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- 常用查询路径的索引
create index if not exists idx_sessions_date      on public.sessions   ((data->>'date'));
create index if not exists idx_cases_session      on public.cases      ((data->>'sessionId'));
create index if not exists idx_cases_presenter    on public.cases      ((data->>'presenterId'));
create index if not exists idx_commitments_member on public.commitments((data->>'memberId'));
create index if not exists idx_commitments_status on public.commitments((data->>'status'));

-- =================== ROW LEVEL SECURITY ==============================
alter table public.members     enable row level security;
alter table public.sessions    enable row level security;
alter table public.cases       enable row level security;
alter table public.commitments enable row level security;

do $$ begin
  create policy "read members"      on public.members     for select using (true);
  create policy "write members"     on public.members     for all    using (true) with check (true);
  create policy "read sessions"     on public.sessions    for select using (true);
  create policy "write sessions"    on public.sessions    for all    using (true) with check (true);
  create policy "read cases"        on public.cases       for select using (true);
  create policy "write cases"       on public.cases       for all    using (true) with check (true);
  create policy "read commitments"  on public.commitments for select using (true);
  create policy "write commitments" on public.commitments for all    using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- =================== 实时 ============================================
-- 打开实时广播，桌长在手机上改，投影上的画面立刻跟着动。
do $$ begin
  alter publication supabase_realtime add table public.members;
  alter publication supabase_realtime add table public.sessions;
  alter publication supabase_realtime add table public.cases;
  alter publication supabase_realtime add table public.commitments;
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 加固（把案例正文真正锁起来）
--
-- 第一版的角色权限是在浏览器里执行的：会员／理事会看不到案例页，
-- 但数据库本身没有拦。会员敢不敢讲真问题，取决于这一层 ——
-- 桌子跑顺了、要开第二桌之前，务必补上：
--
--   1. Supabase Authentication 打开邮箱登录，每位会员一个账号。
--   2. 建一张 profiles(user_id uuid primary key, member_id text, role text)。
--   3. 把 cases / commitments 的 select 策略换成：
--
--        create policy "cases: chair & recorder only"
--          on public.cases for select
--          using (exists (
--            select 1 from public.profiles p
--            where p.user_id = auth.uid() and p.role in ('chair','recorder')
--          ));
--
--   4. commitments 允许会员读自己那条：
--
--        create policy "commitments: own or staff"
--          on public.commitments for select
--          using (exists (
--            select 1 from public.profiles p
--            where p.user_id = auth.uid()
--              and (p.role in ('chair','recorder')
--                   or p.member_id = public.commitments.data->>'memberId')
--          ));
--
--   5. 删掉上面那几条 using (true) 的宽松策略。
-- =====================================================================
