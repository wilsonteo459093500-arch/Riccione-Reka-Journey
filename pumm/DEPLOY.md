# PUMM ROUNDTABLE 运维系统 · 部署指南（Vercel + Supabase）

按这个顺序做，大概 15 分钟能让全桌在手机和电脑上用起来。

> ⚠️ 这个 app 里存的是会员在保密协议下讲出来的真实问题。部署前先读一遍
> 第 5 节「保密与权限」—— 那一节不是技术细节，是这张桌子的信任基础。

---

## 1) 在 Vercel 创建独立项目（5 分钟）

> 本 repo 里已经有几个各自独立部署的 app（Delivery OS / CRM / UKIR / CIPTA）。
> PUMM 是**再开一个** Vercel 项目，指向 `pumm/` 子目录。

1. 打开 https://vercel.com/new
2. 选 GitHub repo `wilsonteo459093500-arch/Riccione-Reka-Journey` → **Import**
3. **Configure Project**：
   - **Project Name**: `pumm-roundtable`
   - **Framework Preset**: 会自动检测为 **Vite**
   - **Root Directory**: 点 **Edit** → 选 **pumm** ⚠️ 这一步最关键，不选就会去 build 别的 app
   - Build Command / Output Directory 用默认（`npm run build` / `dist`）
4. Environment Variables 先空着也能 deploy
5. **Deploy** → 等 1–2 分钟

拿到网址后打开，看到「进桌」登录页就成了。首次进入用 **桌长 / PIN `1234`**。

---

## 2) 创建 Supabase 项目（5 分钟）

> 不接 Supabase 也能用，但数据只存在**当下这台浏览器**里 —— 换手机、换电脑、
> 记录员那台机器，各看各的。一张真跑的桌子建议一定要接。

1. https://supabase.com → GitHub 登录 → **New project**
   - **Name**: `pumm-roundtable`
   - **Region**: **Southeast Asia (Singapore)** — 离马来西亚最近
   - **Plan**: Free（这个规模绰绰有余）
2. 等它 init 完（约 2 分钟）
3. 左侧 **SQL Editor** → **New query** → 把 `pumm/supabase/schema.sql` 整份粘进去 → **Run**
   - 看到 "Success. No rows returned" 就对了
   - 这一步建好 4 张表（members / sessions / cases / commitments）+ 索引 + RLS + realtime
4. **Project Settings → API**：
   - 复制 **Project URL**（像 `https://xxxx.supabase.co`）
   - 复制 **anon public** key（一长串 `eyJhbGci...`）

---

## 3) 把密钥填进 Vercel（3 分钟）

1. 回到 Vercel 的 `pumm-roundtable` 项目 → **Settings → Environment Variables**
2. 加两条（Production / Preview / Development 三个环境都勾）：

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` |

3. **Deployments** → 最新那条 → **⋯ → Redeploy**（环境变量只在构建时读入）
4. 重新打开网址，页头右上角会显示 **☁ 云端** —— 显示「本地」就是没读到变量。

---

## 4) 开桌前的准备（10 分钟）

1. 用 **桌长 / 1234** 登录 → **会员与桌**
2. 先把「桌长」「记录员」两条改成真人的姓名／公司／行业／PIN
3. 一个个加会员。加的时候注意：
   - **行业写具体** —— 这一栏是桌规查重的依据，重复会被系统拒绝
   - 年费到账、NDA 签好之后，才把那两项打勾 —— **两项齐了才算「在桌」**
4. **排期与出席** → **排全年** → 选第一场日期（例：某月第 3 个星期五）→ 生成 12 场
5. 把网址发给全桌，每人用自己的名字 + PIN 登录，先看一次「桌规」页

> 想先试跑：桌上没人时「会员与桌」有个**「载入示范数据」**按钮，
> 一桌 10 人 + 3 场会 + 案例 + 承诺。⚠️ 它会**覆盖**现有数据，加了真人之后就别按了。

---

## 5) 保密与权限 —— 开第二桌之前必须做

第一版的角色权限**跑在浏览器里**：会员和理事会的导航里根本没有「案例资产」这一页，
但**数据库那一层还没锁**。也就是说，拿到网址 + anon key 的人技术上能读到案例正文。

现在这样够用的前提是：**网址只发给这一桌的人，anon key 不外流**。

跑顺了、要开第二桌之前，按 `supabase/schema.sql` 末尾的「加固」一节补上：
Supabase 邮箱登录 + `profiles` 表 + 基于角色的 RLS 策略。那之后，理事会即使拿到
key 也读不到案例正文。

**想立刻撤销所有人的访问**：Supabase → Settings → API → 轮换 anon key →
更新 Vercel 环境变量 → Redeploy。

---

## 6) 一场会当天怎么用

1. 桌长手机／笔电打开 → **排期与出席** → 找到今天那场 → **开场**
2. 六段按顺序走，每段有计时器（预定时间到会闪，但不会自己跳段 —— 桌长说了算）：

   | 段 | 时间 | 在系统里做什么 |
   |---|---|---|
   | 承诺复盘 | 30′ | 按「全部标到」再改没来的人；上场未结承诺逐条点「做到了／没做到」 |
   | 案主陈述 | 15′ | 把问题记成一句话 |
   | 只提问 | 30′ | 每问选提问人 + 打字 + Enter |
   | 轮流给建议 | 40′ | 系统预填下一个还没开口的人，打字 + Enter；顶上显示「已开口 6/9」 |
   | 锁诺 | 15′ | 一件事，到期日自动 = 会期 + 30 天 |
   | 收尾 | 10′ | 每人一句 takeaway → 散会前检查三项 → **散会** |

3. 散会后（或当晚）记录员进 **案例资产** 补完整、按「归档」
4. **提醒** 页看今天该发什么，一键复制贴进 WhatsApp 群

两位案主时，「下一段」按钮会先带你把同一段走完第二位，再进下一段。

---

## 7) WhatsApp 自动提醒（可选，约 30 分钟）

不做这一步，「提醒」页照常能用（算好文案、一键复制）。做了这一步，
五条提醒每天早上自动发到会员 WhatsApp，桌长完全不用管。

1. **Meta 侧**（一次性）：
   - https://developers.facebook.com → 创建 App（类型 Business）→ 添加 **WhatsApp** 产品
   - 拿到 **Phone Number ID** 和一个**永久 System User Token**（App 面板 → WhatsApp → API Setup；
     临时 token 只活 24 小时，要在 Business Settings → System Users 里生成永久的）
   - ⚠️ WhatsApp 规矩：企业主动发消息要用**已审核模板**，自由文本只能发给
     24 小时内回过你消息的人。最简单的过渡做法：入会时让每位会员先给这个号码发一句
     「hi」；正式一点就把提醒文案在 Meta 后台申请成 utility 模板。
2. **Supabase 侧**：
   ```bash
   supabase functions deploy send-reminders
   supabase secrets set WHATSAPP_TOKEN=EAAxxxx WHATSAPP_PHONE_ID=1234567890
   ```
3. **每天定时跑**（SQL Editor 执行一次；先在 Database → Extensions 打开 `pg_cron` 和 `pg_net`）：
   ```sql
   select cron.schedule(
     'pumm-daily-reminders',
     '0 1 * * *',   -- UTC 01:00 = 马来西亚早上 9 点
     $$
     select net.http_post(
       url     := 'https://<你的项目ref>.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
     );
     $$
   );
   ```
4. 验证：Edge Functions → send-reminders → Logs，每天 9 点会有一条
   `x/y 发送成功` 的记录，失败会写明原因（没电话号码 / 超出 24h 窗口）。

会员的电话就用「会员与桌」里那一栏，01x 开头的马来西亚号码会自动转成国际格式。

## 8) 数据库权限加固（开第二桌前必做）

第 5 节讲过：现在数据库层没锁。真正锁上按 `supabase/harden.sql` 文件头的
五个步骤做 —— 核心是先开邮箱登录、每位会员一个账号，然后执行那份脚本。
执行完之后，案例正文在数据库层就只有桌长与记录员读得到，
会员只读得到自己的承诺，理事会连表都碰不到。

⚠️ 顺序别反：先改前端登录、再跑 harden.sql。先跑脚本的话 PIN 登录会读不到数据。

## 9) 备份

- **承诺追踪** 页有「导出 CSV」
- **案例资产** 里每个案例可下载文字档（会内版／匿名招募版）
- Supabase 后台 **Table Editor** 每张表都能导 CSV
- 换工具、平台涨价、系统不用了 —— 数据都跟着你走

---

## 常见问题

**页头显示「本地」不是「云端」** — 环境变量没读到。确认两个变量名一字不差、
三个环境都勾了，然后 **Redeploy**（不是 refresh 页面）。

**加会员被拒，说行业重复** — 这是桌规在起作用，不是 bug。同桌不能有两个同业老板。
真要加，先把占着那个行业的人改行业或标成出局。

**某人不出现在「案主」可选名单里** — 年费未到账或 NDA 未签。补齐这两项才算在桌。

**看板数字是「—」** — 还没有已结束的场次或还没满一年，不是算错。
系统不拿 0% 冒充数据。

**改了会员角色，那个人还是旧权限** — 他重新登录一次就好（登录态存在浏览器页签里）。
