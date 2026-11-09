# KIRA 部署

## 1. Vercel（新项目，不动任何旧项目）
1. Vercel → Add New → Project → 导入 `wilsonteo459093500-arch/Riccione-Reka-Journey`
2. Project Name：`kira-riccione-reka`（网址 `kira-riccione-reka.vercel.app`）
3. **Root Directory：`kira`**（Framework 自动识别为 Vite）
4. 先不填环境变量 → Deploy（这时是「本机模式」：资料存在各自浏览器，不需登录）

`kira/vercel.json` 的 `ignoreCommand` 只在 `kira/` 有改动时才重新构建；其他 app 的项目也各有自己的 ignoreCommand，互不触发。

## 2. Supabase（和旧报价工具同一个项目、同一套账号）
1. **先确认** Authentication → Providers → Email → *Allow new users to sign up* 已关闭
2. SQL Editor → 整段执行 `kira/supabase/kira_projects.sql`（可重复执行；只新增 `kira_projects` 表）
3. Vercel → kira-riccione-reka → Settings → Environment Variables（只设 **Production**）：
   - `VITE_SUPABASE_URL` = 旧工具同一个 Project URL
   - `VITE_SUPABASE_ANON_KEY` = 同一个 anon key
4. Redeploy → 打开网址会出现登录页，用旧工具的账号登录

Preview 部署不设这两个变量 → 预览网址永远是本机模式，不会写进正式云端。

## 3. 手机加到主屏幕
打开网址 → 浏览器菜单「加到主屏幕 / Add to Home Screen」→ 出现 KIRA 图标；没讯号时也能打开、继续报价，有网后自动同步。
