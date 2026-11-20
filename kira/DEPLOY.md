# KIRA 部署

## 1. Vercel（项目 `kira-riccione-reka`，已建好）
- 网址：<https://kira-by-riccione-reka.vercel.app>（也可以用 `kira-riccione-reka.vercel.app`）
- Root Directory：`kira`（Framework：Vite）
- **怎么上线**（2026-11-20 起）：代码在 main；**合并进 main = 正式版自动更新**，别的分支 = 预览版。由 GitHub Actions 只在 `kira/` 有改动时测试、出版本，测试没过不上线。Vercel 项目自己的「GitHub 一推就建」已关掉（`vercel.json` 的 `git.deploymentEnabled: false` + 项目设定）。全部细节见仓库根目录的 [`DEPLOY-FLOW.md`](../DEPLOY-FLOW.md)。
- 换了环境变量要重新出一次版本才生效：GitHub → Actions →「测试 + 上线」→ Run workflow → 选 `main`、填 `kira`。
- 以前正式版从长期分支 `claude/cabinet-measurement-tool-enhance-ymc43k` 出；那条分支已经不用了。

> **本机模式期间做的报价**：只存在做报价的那台设备 / 那个浏览器里。接上云端后，**在同一台设备、同一个浏览器**打开正式网址并登录，KIRA 会自动把这些报价上传到云端（谁登录上传，谁就是这些报价的主人，只有他能删）。
> Preview 网址是另一个网址，那里做的报价**不会**跟着上传。

## 2. Supabase（KIRA 自己的项目「KIRA BY RICCIONE REKA」）
> 更正（2026-11-20）：以前这里写「和旧报价工具同一个项目、同一套账号」，**实际不是**。正式版接的是 2026-11-10 新开的 Supabase 项目「KIRA BY RICCIONE REKA」，里面只有 KIRA 的表（`kira_projects`、`kira_ai_feedback`），**没有旧工具的 `quotes` 表、也没有旧工具的账号**。所以「导入旧报价」在正式版导不到东西；要搬旧报价要另外做。

1. **先确认** Authentication → Providers → Email → *Allow new users to sign up* 已关闭（账号由管理员在 Authentication → Users 建）
2. SQL Editor → 整段执行 `kira/supabase/kira_projects.sql`（可重复执行；只新增 `kira_projects` 表）
3. Vercel → kira-riccione-reka → Settings → Environment Variables（只设 **Production**）：
   - `VITE_SUPABASE_URL` = 这个项目的 Project URL
   - `VITE_SUPABASE_ANON_KEY` = 这个项目的 anon key
4. 重新出一次正式版（见第 1 步）→ 打开网址会出现登录页
5. 本机模式用过的每台设备：用**同一个浏览器**打开正式网址 → 登录 → 本机模式的报价自动上传
6. 安全设定：Authentication → 设定里打开 **Leaked password protection（泄漏密码检查）**

Preview 部署不设这两个变量 → 预览网址永远是本机模式，不会写进正式云端。

## 2b. 户型图图片（第三版，Supabase Storage）
1. SQL Editor → 整段执行 `kira/supabase/kira_plans_storage.sql`（可重复执行；只新增私有 bucket `kira-plans` 和它的权限）
   - 登录的同事可以看、可以上传；只有上传的人能删；图片不公开（读的时候用 signed URL）
2. 不用新的环境变量（用同一个 Supabase 项目）
3. 试一次：正式网址 → 某份报价「户型图 → 上传」→ 重新整理页面图还在；另一台设备登录同一份报价也看得到
4. 预览网址 / 本机模式：图片存在那台设备的浏览器（IndexedDB，路径 `local:…`）；在同一个浏览器登录正式版后会自动补传
5. 删掉整份报价不会删图片（同一张图可能被复制出来的版本共用）。在户型图区按「删除这张户型图」→ 图片先排队，等这个改动同步上云、而且本机没有任何报价版本还在用，才真的删
6. 只有上传的人能删图片：别的同事删户型图时，云端那张图会留着（不影响报价，只是占一点空间）

## 2c. 户型图「AI 识图」（钥匙只放在 Vercel，不进浏览器、不进仓库）
1. 到 console.anthropic.com 建一把 API key（建议设每月用量上限）
2. Vercel → kira-riccione-reka → Settings → Environment Variables：
   - `ANTHROPIC_API_KEY` = 那把 key，勾 **Production** 和 **Preview**（类型选 Sensitive）
   - `KIRA_AI_PASSCODE` = 自己定一个团队密码，勾 **Preview**（预览网址没有登录，靠这个挡外人）
3. 重新出版本（预览：推一次；正式版：GitHub Actions 手动跑一次，见第 1 步）
4. 谁能用：正式网址 = 已登录的同事；预览网址 = 知道团队密码的人（这次浏览器开着时只问一次）
5. 每次识图约 US$0.10（看图片大小）；面板上会显示这次用了多少 tokens。AI 只给建议，勾选确认后才加入报价
6. 没设这些：按「AI 识图」会显示「AI 还没设定」，其他功能照常

## 2d. AI 识图「👎 反馈」（存在 Supabase，只有服务器读写）
业务在 AI 建议旁边按 👎 选原因、报「漏了柜子」，或按「加入报价」时，会存一笔反馈（连同送去 AI 的那张图），给开发调规则用。
1. SQL Editor → 整段执行 `kira/supabase/kira_ai_feedback.sql`（可重复执行；只新增表 `kira_ai_feedback` 和私有 bucket `kira-ai-feedback`）
   - 不给浏览器任何权限：只有服务器用 service key 能读写（客户户型图是私人资料）
2. Vercel → kira-riccione-reka → Settings → Environment Variables，勾 **Production** 和 **Preview**（类型选 Sensitive）：
   - `KIRA_FEEDBACK_SUPABASE_URL` = 同一个 Supabase 的 Project URL
   - `KIRA_FEEDBACK_SERVICE_KEY` = Supabase → Settings → API → **service_role** key（只放 Vercel，绝不放 `VITE_` 开头的变量）
3. 重新出版本（同上）。谁能送反馈：同 AI 识图（正式版要登录；预览版要团队密码）
4. 没设这些：按 👎 会把反馈复制到剪贴板，提示「反馈功能还没设定，已复制，可以 WhatsApp 给开发」
5. 开发拉反馈：`KIRA_FEEDBACK_SUPABASE_URL=… KIRA_FEEDBACK_SERVICE_KEY=… node scripts/feedback-pull.mjs [--images]` → `test/fixtures/ai-feedback/`（图只存本机 `test/out/`，不进仓库）；规则抓得到的设 `"expect": "unpicked"`，`npm test` 会一直重跑

## 3. 手机加到主屏幕
打开网址 → 浏览器菜单「加到主屏幕 / Add to Home Screen」→ 出现 KIRA 图标；没讯号时也能打开、继续报价，有网后自动同步。

- 离线打开（登录过期也一样）：用这台设备上次登录的身份、本机存着的报价直接打开，顶栏显示 *Offline 离线*；改动排队，有网后自动确认登录、先拉云端最新的再上传。
- 离线删除：本机马上删，云端等有网时自动删（不会再冒出来）。
- **退出登录**会先把没上云的改动推上去；推不上（没网）会先问你。退出后这台设备上的 KIRA 资料会清掉，下一个登录的人看不到。共用的平板 / 电脑用完请退出。
- 手机存储满了（报价很多）顶栏会显示 *Storage full 本机空间满*：离线只存最近的报价，没上云的改动一定保住。
