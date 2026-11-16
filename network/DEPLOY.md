# 人脉簿 · 部署指南（Vercel + Supabase）

大概 20 分钟。照顺序做。

---

## 1) Supabase：建资料库（5 分钟）

> 建议**另外开一个 Supabase project**，不要跟 Sail CRM 共用 —— 这里放的是你私人的人脉和对话记录。

1. https://supabase.com → **New project**
   - Name：`network`
   - Region：**Southeast Asia (Singapore)**
   - Plan：Free
2. 左边 **SQL Editor** → **New query** → 把 `network/supabase/schema.sql` 整份贴进去 → **Run**
   - 看到 `Success. No rows returned` 就对了（可以重复跑，不会删资料）
   - 这一步建好：13 张表、只有本人能读写的规则（RLS）、私有照片空间 `network`
3. **Authentication → Users → Add user → Create new user**
   - 填你的邮箱 + 一个强密码，勾 **Auto Confirm User**
4. **Authentication → Sign In / Providers → Email**：把 **Allow new users to sign up** 关掉
   （这样别人就算拿到网址也注册不了）
5. **Project Settings → API**：复制
   - `Project URL`（像 `https://xxxx.supabase.co`）
   - `anon public` key（`eyJhbGci...`）

---

## 2) Anthropic：拿 AI key（3 分钟）

1. https://console.anthropic.com → **API Keys** → Create key，复制 `sk-ant-...`
2. 建议在 **Limits** 设每月上限（例如 USD 15），双重保险

---

## 3) Vercel：开一个新项目（5 分钟）

1. https://vercel.com/new → 选这个 repo → **Import**
2. **Project Name**：`network`（随便，跟其他项目不同就好）
3. **Root Directory**：点 **Edit** → 选 **`network`** ⚠️ 最重要，不选会去 build 别的 app
4. **Environment Variables** 加这些：

   | Name | Value | 说明 |
   |---|---|---|
   | `VITE_SUPABASE_URL` | 第 1 步的 Project URL | |
   | `VITE_SUPABASE_ANON_KEY` | 第 1 步的 anon key | 可以公开，安全靠 RLS |
   | `ANTHROPIC_API_KEY` | 第 2 步的 key | 只在服务器，前端拿不到 |
   | `OWNER_EMAIL` | 你登入用的邮箱 | 只有这个帐号能用 AI |
   | `AI_MONTHLY_BUDGET_MYR` | `50` | 这个月花超过就自动停 |
   | `USD_TO_MYR` | `4.4` | 换算用 |

5. **Deploy**。好了打开网址，看到登入页 → 用第 1 步建的帐号登入。

> 这个 repo 的 Vercel 项目都是关掉自动部署的（`git.deploymentEnabled: false`）。
> 以后改了代码：Vercel → Deployments → 最新那次 → ⋯ → **Redeploy**。

---

## 4) 装到手机（1 分钟）

- **iPhone**：用 **Safari** 打开 → 分享 → **加到主屏幕**
- **Android**：Chrome → ⋮ → **安装应用程式**

装好之后「扫名片」会直接打开相机。

---

## 5) 验收清单（第 1 阶段）

- [ ] 手机上扫 3 张真的名片：名字、电话、公司对不对？哪里常错记下来
- [ ] 其中一个按「深度分析」：公司背景对不对？4 个维度的理由有没有引用真的事实？「我能给他什么」能不能本周就做？
- [ ] 加一张合照，标两个人；两个人的页面都看得到
- [ ] 「我」页的 AI 费用有在跳
- [ ] **换帐号测 RLS**：在 Supabase 暂时打开注册（或手动 Add user）建第二个帐号，登入后应该**一个人都看不到**、照片网址也打不开；测完删掉第二个帐号、关回注册
- [ ] 别的帐号登入后按 AI 功能 → 应该回「这个帐号不是主人」（`OWNER_EMAIL` 生效）

---

## 本机开发

```bash
cd network
cp .env.example .env.local   # 填好（不填 Supabase = 本机模式，资料存在浏览器）
npm install
npm run dev                  # http://localhost:5176，/api/* 也在本机跑
npm test                     # 单元测试（不会真的呼叫 AI）
```

---

## 费用估算

| 动作 | 模型 | 大概 |
|---|---|---|
| 扫一张名片 | Haiku 5.5 | RM0.01 以下 |
| 查一家公司（只查一次，存起来） | Sonnet 5.5 + 网页搜索 ≤3 次 | RM0.3–0.5 |
| 评分 + 我能给他什么 | Sonnet 5.5 | RM0.1 |

每月 RM50 ≈ 扫 1000+ 张名片，或深度分析约 100 个人。

## 常见问题

| 症状 | 原因 / 解决 |
|---|---|
| 顶部黄条「本机模式」 | Vercel 没设 `VITE_SUPABASE_*`，或设了没 Redeploy |
| 扫名片说「服务器还没设 ANTHROPIC_API_KEY」 | 加了环境变数要 Redeploy |
| 「这个帐号不是主人」 | `OWNER_EMAIL` 跟登入邮箱不一样（大小写没关系） |
| 「这个月的 AI 预算用完了」 | 调高 `AI_MONTHLY_BUDGET_MYR`，Redeploy |
| iPhone 拍的照片读不到 | 设定 → 相机 → 格式 → 选「最兼容」（不要 HEIC） |
| 读取失败：relation "people" does not exist | `schema.sql` 没跑 |
