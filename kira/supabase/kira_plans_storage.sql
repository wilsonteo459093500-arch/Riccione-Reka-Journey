-- ============================================================
-- KIRA 第三版「户型图」—— Supabase Storage 设定（可重复执行）
-- 在旧报价工具同一个 Supabase 项目的 SQL Editor 里整段执行一次。
-- 只新增私有 bucket「kira-plans」和它的权限；不动 kira_projects / quotes。
--   · 登录的同事：可以看、可以上传（团队共享，同报价）
--   · 只有上传的人能删
--   · 报价记录里只存图片路径；图片不公开，读的时候用 signed URL
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kira-plans', 'kira-plans', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kira plans read"       on storage.objects;
drop policy if exists "kira plans insert"     on storage.objects;
drop policy if exists "kira plans delete own" on storage.objects;

create policy "kira plans read" on storage.objects for select to authenticated
  using (bucket_id = 'kira-plans');

create policy "kira plans insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'kira-plans');

create policy "kira plans delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'kira-plans' and owner = auth.uid());
