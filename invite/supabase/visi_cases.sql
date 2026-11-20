-- ============================================================
-- VISI 案例库（云端）—— Supabase 设定脚本（可重复执行）
-- 在 KIRA 那个 Supabase 项目的 SQL Editor 里整段执行一次。
-- 只新增：公开 bucket「visi-cases」+ 资料表 public.visi_catalog；不动 KIRA 的任何东西。
--
--   · 照片、缩图包 → bucket visi-cases（公开：VISI 的 <img>、PPTX 直接用网址；
--     路径带 21 个随机字，跟以前 Vercel Blob 一样猜不到）
--   · 清单（有项目的文件夹名 = 客户名字）和 7 份每日备份 → 资料表 visi_catalog
--     RLS 打开、而且没有任何 policy：登入的同事、匿名的人都读不到、改不了；
--     只有 Vercel 上的伺服器（service role key）读写得到。
--   · 写入只有伺服器会做（service role 本来就不受 RLS 限制），所以 bucket 也不需要 policy。
-- 执行完：到 Vercel 的 visi-riccione-reka 项目加环境变数（见 invite/README.md「云端改存 Supabase」）
-- ============================================================

-- 照片：公开 bucket，只收 JPEG（照片）和 JSON（缩图包），一个档最多 5 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visi-cases', 'visi-cases', true, 5242880, array['image/jpeg', 'application/json'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 清单：path = 'catalog/<CATALOG_KEY>/index.json'（或 …/bak/mon.json 这种每日备份）
create table if not exists public.visi_catalog (
  path        text primary key,
  body        text not null,
  rev         bigint not null default 1,
  updated_at  timestamptz not null default now()
);

alter table public.visi_catalog enable row level security;
-- 不建任何 policy：anon / authenticated 一律读不到。再保险一点，把权限也拿掉
revoke all on table public.visi_catalog from anon, authenticated;
