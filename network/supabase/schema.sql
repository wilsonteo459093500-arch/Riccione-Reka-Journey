-- =====================================================================
-- 人脉 App · Supabase schema（第 1 阶段定稿 + 第 2、3 阶段升级）
-- ---------------------------------------------------------------------
-- 只给自己用：每一列都有 owner（= 登入的人），RLS 规定只能读写自己的。
-- 照片 / 名片放私有 bucket「network」，路径 <user id>/<photo id>.jpg，
-- 别的帐号连网址都拿不到。
--
-- 用法：Supabase → SQL Editor → 整份贴上 → Run。可以重复跑（不会删资料）。
-- 跑完记得：Authentication → Sign In / Providers → 关掉「Allow new users to sign up」
-- =====================================================================

-- ---------- 共用：updated_at 自动更新 ----------
create or replace function public.network_touch() returns trigger
language plpgsql
set search_path = ''   -- 锁定 search_path（Supabase 安全检查 0011）；只用到 now()，系统内建
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- 我的资料（AI 评分时当「我」的背景）----------
create table if not exists public.profile (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null default '',
  business text not null default '',      -- 我是谁、做什么生意
  offer text not null default '',         -- 我有的资源（可以给人的）
  lacking text not null default '',       -- 我缺的 / 想找的
  goals text not null default '',         -- 今年目标
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 公司（背景查一次就存起来）----------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  name_alt text not null default '',
  industry text not null default '',
  website text not null default '',
  address text not null default '',
  background jsonb,                       -- /api/company 的结果（summary、sources…）
  background_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_owner_name on public.companies (owner, lower(name));

-- ---------- 人物 ----------
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  name_alt text not null default '',
  title text not null default '',
  company_id uuid references public.companies(id) on delete set null,
  phones jsonb not null default '[]',     -- [{label, number}]
  emails text[] not null default '{}',
  whatsapp text not null default '',      -- 只放数字，例：60123456789
  website text not null default '',
  address text not null default '',
  socials jsonb not null default '[]',    -- [{platform, handle}]
  card_notes text not null default '',    -- 名片上的其他字
  -- 分级：康妮圈层 + Sims 好感度（第 3 阶段会加衰减）+ 资源价值（4 维度评分）
  tier text not null default 'known' check (tier in ('core','important','active','known')),
  affinity int not null default 50 check (affinity between 0 and 100),
  assessment jsonb,                       -- /api/assess 的结果（dims、give_ideas、talk_topics…）
  worth_score int,                        -- 0–100，由 assessment 算出，方便排序
  interests text[] not null default '{}',
  tags text[] not null default '{}',
  how_met text not null default '',
  met_on date,
  notes text not null default '',
  avatar_photo_id uuid,
  card_photo_id uuid,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_owner on public.people (owner);

-- ---------- 商会 / 圈子 ----------
create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'circle' check (kind in ('chamber','association','club','community','circle')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_circles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  role text not null default '',          -- 例：会长、理事、会员
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, circle_id)
);

-- ---------- 资源标签：他有的 / 他需要的 / 我能给的 ----------
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('has','needs','give')),
  label text not null,
  detail text not null default '',
  source text not null default 'manual' check (source in ('manual','ai','talk')),  -- talk = 从对话整理、本人勾选过的
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resources_person on public.resources (person_id);

-- ---------- 互动记录：见面、对话（Plaud / 语音备注 / WhatsApp 汇出 / 截图）----------
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null default 'note' check (kind in ('meeting','call','message','event','note','card_scan')),
  source text not null default 'manual' check (source in ('manual','card','plaud','voice','whatsapp_txt','whatsapp_screenshot')),
  occurred_at timestamptz not null default now(),
  title text not null default '',
  summary text not null default '',
  transcript text,                         -- 逐字稿（私密，只有本人看得到）
  ai jsonb,                                -- /api/analyze-talk 的结果：兴趣、需求、资源、情绪、承诺（action_items[].done）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interactions_person on public.interactions (person_id, occurred_at desc);

-- ---------- 活动与出席（第 5 阶段用；表先建好）----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  held_on date,
  location text not null default '',
  circle_id uuid references public.circles(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'attended' check (status in ('invited','going','attended','absent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, person_id)
);

-- ---------- 照片：名片、合照、头像 ----------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'group' check (kind in ('card','group','avatar')),
  path text not null,                      -- storage 路径：<owner>/<id>.jpg
  width int, height int,
  caption text not null default '',
  taken_at timestamptz,
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photo_people (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photo_id, person_id)
);

-- ---------- 关系分数快照（第 3 阶段画趋势用）----------
create table if not exists public.relationship_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  at timestamptz not null default now(),
  affinity int,
  tier text,
  worth_score int,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists snapshots_person on public.relationship_snapshots (person_id, at desc);

-- ---------- AI 用量（每月 RM50 预算）----------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  feature text not null,                  -- scan_card / company / assess …
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  searches int not null default 0,
  cost_usd numeric(10,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_usage_owner_at on public.ai_usage (owner, at desc);

-- ---------- 第 2 阶段升级（对话输入）：旧的资料库重跑这份就会补上 ----------
alter table public.people add column if not exists avoid_topics text[] not null default '{}';  -- 要避开的话题
alter table public.resources drop constraint if exists resources_source_check;
alter table public.resources add constraint resources_source_check check (source in ('manual','ai','talk'));

-- ---------- 第 3 阶段升级（关系图 + 今日行动）----------
alter table public.people add column if not exists snooze_until date;   -- 「晚点再说」：这天以前不出现在今日行动
-- people.affinity 现在由互动记录算出来（app 每天存回一次）；relationship_snapshots 记好感度跨等级的变化

-- ---------- updated_at trigger + RLS（每张表一样）----------
do $$
declare t text;
begin
  foreach t in array array['profile','companies','people','circles','person_circles','resources','interactions',
                           'events','attendance','photos','photo_people','relationship_snapshots','ai_usage']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.network_touch()', t, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid())', t);
    -- 匿名角色完全没权限
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- 私有 Storage bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('network', 'network', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "network owner read" on storage.objects;
drop policy if exists "network owner insert" on storage.objects;
drop policy if exists "network owner update" on storage.objects;
drop policy if exists "network owner delete" on storage.objects;

create policy "network owner read" on storage.objects for select to authenticated
  using (bucket_id = 'network' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "network owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'network' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "network owner update" on storage.objects for update to authenticated
  using (bucket_id = 'network' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "network owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'network' and (storage.foldername(name))[1] = auth.uid()::text);
