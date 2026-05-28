# Sail CRM · 部署指南 (Vercel + Supabase)

按这个顺序做,大概 15 分钟可以让全团队在手机和电脑上用起来。

---

## 1) 在 Vercel 创建独立项目 (5 分钟)

> 现有 repo 已经有一个 Vercel 项目 `wilson-pidc` 在跑 Delivery OS。CRM 是独立的 app,要**再开一个** Vercel 项目指向 `crm/` 子目录。

1. 打开 https://vercel.com/new
2. 选择你的 GitHub repo `wilsonteo459093500-arch/Wilson` → 点 **Import**
3. **Configure Project** 页面:
   - **Project Name**: `sail-crm` (随便起,与 `wilson-pidc` 不同就行)
   - **Framework Preset**: 应该会自动检测为 **Vite**
   - **Root Directory**: 点 **Edit** → 选 **crm** ⚠️ 这一步**最关键**,不选就会去 build Delivery OS
   - **Build Command**: `npm run build` (默认即可)
   - **Output Directory**: `dist` (默认即可)
4. **Environment Variables**(下一节再回来加,先全空着也能 deploy)
5. 点 **Deploy** → 等 1-2 分钟

成功后会拿到一个像 `sail-crm-xxxx.vercel.app` 的网址。打开能看到 Login 页就说明 OK 了。

---

## 2) 创建 Supabase 项目 (5 分钟)

> 没有 Supabase 的话,CRM 只能在每台设备本地存数据(IndexedDB),全员无法共享。建议一定做。

1. 打开 https://supabase.com → 用 GitHub 登录
2. **New project**:
   - **Name**: `sail-crm`
   - **Database Password**: 让它自动生成,保存到 1Password
   - **Region**: 选 **Southeast Asia (Singapore)** — 离马来西亚最近
   - **Plan**: Free
3. 等它 init 完(约 2 分钟)
4. 左侧 **SQL Editor** → **New query** → 把 `crm/supabase/schema.sql` 整份内容粘进去 → 点 **Run**
   - 成功的话会看到 "Success. No rows returned"
   - 这一步建好了 4 张表 + 权限 + realtime
5. 左侧 **Project Settings** → **API**:
   - 复制 **Project URL** (像 `https://xxxx.supabase.co`)
   - 复制 **Project API keys → anon public** (一长串 `eyJhbGci...`)

---

## 3) 把 Supabase 密钥填到 Vercel (3 分钟)

1. 回到 Vercel 那个 `sail-crm` 项目
2. **Settings** → **Environment Variables** → 加两条:

   | Name | Value | Environments |
   |---|---|---|
   | `VITE_SUPABASE_URL` | (粘贴上一步的 Project URL) | All |
   | `VITE_SUPABASE_ANON_KEY` | (粘贴上一步的 anon public) | All |

3. **Deployments** → 找最新一次 deploy → 右边三个点 → **Redeploy** → 确认 **Use existing Build Cache** 取消勾选 → Redeploy

部署完打开网址。Header 左上角的小字应该从 "💾 local" 变成 "☁ cloud sync"。这就成了 — 多人多设备同步开启。

---

## 4) 手机装到桌面 (1 分钟,每个团队成员都做一次)

**iPhone (Safari):**
1. 用 Safari 打开 CRM 网址(必须用 Safari,Chrome 不行)
2. 底部分享按钮 → 滚到 **加到主屏幕** → 加入
3. 主屏幕会出现 "溪" 图标,打开就是全屏 app

**Android (Chrome):**
1. 用 Chrome 打开 CRM 网址
2. 右上角三个点 → **添加到主屏幕** → 安装
3. App 会出现在抽屉里

电脑用 Chrome / Edge 也行,地址栏右边会有个 "安装" 图标,装了它就有独立窗口。

---

## 5) 第一次登录

5 个默认账号,PIN 都是 `1234`:

| 用户名 | 角色 | 能看什么 |
|---|---|---|
| Wilson | Manager | 全部 — Dashboard / Analytics / Users 都只有 Wilson 看到 |
| Sheerly | Sales | Leads / Pipeline / Confirmed Sales / Design / After-Sales / Calendar |
| Reina | Sales | 同上 |
| Designer | Designer | 同上 |
| Supervisor | Site Supervisor | 只能看 Confirmed Sales / After-Sales / Calendar(看不到未付款 leads) |

登录后 Wilson 到 **Users** 标签可以:
- 改每个人的 PIN
- 加新人 / 删人
- 改角色

---

## 常见问题

**Q: 我推了新代码,网站没自动更新?**
A: Vercel 默认会在每次 push 到 `main` 时自动重新部署。看 Vercel → Deployments,如果看到最新的 commit,但状态卡在 "Building" 或 "Error",点进去看日志。

**Q: 团队里有人看到 "local" 不是 "cloud sync"?**
A: Vercel 的 env vars 改完一定要 Redeploy 才生效。

**Q: 想换网址(比如绑自己的 sail-crm.riccione.com)?**
A: Vercel → Settings → Domains → Add → 按它的提示去 DNS 加 CNAME。10 分钟内会生效。

**Q: 数据安全吗?**
A: 当前的 PIN 登录只是"团队问责"层面,不是真正的安全。`schema.sql` 里的 RLS 是 permissive 的(任何 anon 用户都能读写)。如果要正经的安全,下一步要做:
- Supabase Authentication → Email 登录 → 每个团队成员一个邮箱
- 把 `schema.sql` 里的 policy 改成 `using (auth.role() = 'authenticated')`
- App 端把 PIN login 替换为 Supabase 邮箱登录

这个我可以下一轮帮你做,但不是 MVP 必需。

**Q: AI Weekly Insights 还能用吗?**
A: 暂时不能。原来的代码直接从浏览器调 `api.anthropic.com`,会泄露 API key 而且被 CORS block。正确做法是在 Supabase 写一个 Edge Function 当后端代理。要做的时候告诉我。

---

## 故障对照表

| 症状 | 原因 | 解决 |
|---|---|---|
| Vercel build 失败,日志说 "Cannot find module" | Root Directory 没设成 `crm` | 在 Vercel Settings → General → Root Directory 改成 `crm`,然后 Redeploy |
| 打开网站一片白屏 | JS 报错 | 浏览器按 F12 → Console 看红字,截图发给我 |
| 手机装了 PWA 但显示旧版本 | Service Worker 缓存 | 在 PWA 里下拉刷新,或者删了重装 |
| 团队成员看不到彼此的改动 | 没开 cloud sync | Header 左上角看是否显示 "☁ cloud sync",不是的话回到第 3 步 |
| Supabase 报 "RLS policy violation" | schema.sql 没跑完整 | 重新跑一遍 schema.sql |
