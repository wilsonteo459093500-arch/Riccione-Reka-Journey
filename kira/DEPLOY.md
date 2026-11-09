# KIRA 部署

## 1. Vercel（新项目，不动任何旧项目）
1. Vercel → Add New → Project → 导入 `wilsonteo459093500-arch/Riccione-Reka-Journey`
2. Project Name：`kira-riccione-reka`（网址 `kira-riccione-reka.vercel.app`）
3. **Root Directory：`kira`**（Framework 自动识别为 Vite）
4. 先不填环境变量 → Deploy（这时是「本机模式」：资料存在各自浏览器，不需登录）

> **本机模式期间做的报价**：只存在做报价的那台设备 / 那个浏览器里。第 2 步接上云端后，**在同一台设备、同一个浏览器**打开正式网址并登录，KIRA 会自动把这些报价上传到云端（谁登录上传，谁就是这些报价的主人，只有他能删）。
> 所以接云端之前：别清浏览器资料、别换浏览器；每台用过本机模式的设备都要登录一次（有网时），等顶栏显示 *Synced 已同步*。
> Preview 网址（见下）是另一个网址，那里做的报价**不会**跟着上传。

`kira/vercel.json` 的 `ignoreCommand` 只在 `kira/` 有改动时才重新构建；其他 app 的项目也各有自己的 ignoreCommand，互不触发。

## 2. Supabase（和旧报价工具同一个项目、同一套账号）
1. **先确认** Authentication → Providers → Email → *Allow new users to sign up* 已关闭
2. SQL Editor → 整段执行 `kira/supabase/kira_projects.sql`（可重复执行；只新增 `kira_projects` 表）
3. Vercel → kira-riccione-reka → Settings → Environment Variables（只设 **Production**）：
   - `VITE_SUPABASE_URL` = 旧工具同一个 Project URL
   - `VITE_SUPABASE_ANON_KEY` = 同一个 anon key
4. Redeploy → 打开网址会出现登录页，用旧工具的账号登录
5. 本机模式用过的每台设备：用**同一个浏览器**打开正式网址 → 登录 → 本机模式的报价自动上传（见第 1 步的说明）

Preview 部署不设这两个变量 → 预览网址永远是本机模式，不会写进正式云端。

## 3. 手机加到主屏幕
打开网址 → 浏览器菜单「加到主屏幕 / Add to Home Screen」→ 出现 KIRA 图标；没讯号时也能打开、继续报价，有网后自动同步。

- 离线打开（登录过期也一样）：用这台设备上次登录的身份、本机存着的报价直接打开，顶栏显示 *Offline 离线*；改动排队，有网后自动确认登录、先拉云端最新的再上传。
- 离线删除：本机马上删，云端等有网时自动删（不会再冒出来）。
- **退出登录**会先把没上云的改动推上去；推不上（没网）会先问你。退出后这台设备上的 KIRA 资料会清掉，下一个登录的人看不到。共用的平板 / 电脑用完请退出。
- 手机存储满了（报价很多）顶栏会显示 *Storage full 本机空间满*：离线只存最近的报价，没上云的改动一定保住。
