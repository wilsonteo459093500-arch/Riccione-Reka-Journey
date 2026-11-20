# SPACE · 部署指南（Vercel + Supabase）

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

## 第 2 阶段升级（已经部署过第 1 阶段的话，做这两步就好）

1. Supabase → **SQL Editor** → 把最新的 `network/supabase/schema.sql` **整份再跑一次**
   （会补上 `people.avoid_topics` 栏位，资源多一种来源 `talk`；不会删资料）
2. Vercel → Deployments → 最新那次 → ⋯ → **Redeploy**

不用加新的环境变数。

---

## 第 3 阶段升级（关系图 + 今日行动 + TickTick）

1. Supabase → **SQL Editor** → 最新的 `network/supabase/schema.sql` **整份再跑一次**
   （补上 `people.snooze_until`，给「晚点再说」用；不会删资料）
2. **TickTick（选填，但建议接）**：
   1. 电脑打开 TickTick 网页版 → 左上头像 → **设定** → **帐户** → **API Token** → 产生 / 复制
      （找不到这个选项的话：TickTick 有改过位置，搜一下设定里的「API」；真的没有，就先用下面的 .ics 方式）
   2. Vercel → Settings → Environment Variables → 加 `TICKTICK_TOKEN` = 刚刚复制的 token，勾 **Sensitive**
   3. （选填）想放进某个清单而不是收集箱：加 `TICKTICK_PROJECT_ID` = 清单 ID（TickTick 网页版打开那个清单，网址 `#p/<这一段>/tasks` 就是）
3. Vercel → Deployments → 最新那次 → ⋯ → **Redeploy**

没设 `TICKTICK_TOKEN` 也能用：「排时间」会变成「下载行事历档（.ics）」，手机点开就加进行事历。
TickTick 的 token 只在服务器，前端拿不到；这个功能不用 AI，不扣 AI 预算。

---

## 第 4 阶段升级（个人名片页 + 扫码留资料）

1. Supabase → **SQL Editor** → 最新的 `network/supabase/schema.sql` **整份再跑一次**
   （补上 `profile.card`、`people.pending_review`、`inbox` 表、互动来源 `qr`、**公开** bucket `network-card`；不会删资料）
2. Supabase → **Project Settings → API** → 复制 **`service_role`** key（Secret，不是 anon）
3. Vercel → Settings → Environment Variables：

   | Name | Value | 说明 |
   |---|---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | 第 2 步的 key | **必需**。勾 **Sensitive**；**不要**加 `VITE_` 前缀（加了会被打包进前端，等于把资料库钥匙公开） |
   | `OWNER_EMAIL` | 你登入的邮箱 | 第 1 阶段已经设了就好：别人留的资料会写进这个帐号底下 |
   | `OWNER_USER_ID` | 选填 | Supabase → Authentication → Users 里你那一列的 UID；设了就不用每次去找 |
   | `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | 选填 | Cloudflare → Turnstile → Add site（网域填你的 Vercel 网址）；两个都设才会启用。乱填的人多了再开 |

4. Vercel → Deployments → 最新那次 → ⋯ → **Redeploy**
5. 打开 SPACE →「我」→ **我的名片**：填名字、WhatsApp、介绍，上传照片（和展厅视频）→ **存名片** → 按「打开」看 `/c`
6. 下载二维码 PNG，印在名片背面 / 桌卡；或建一个活动拿专属二维码

> 公开页只读得到「我的名片」里填的东西（`profile.card`，只回认得的栏位）。你的人脉、对话、照片都还是只有你登入看得到。
> `SUPABASE_SERVICE_ROLE_KEY` 会跳过 RLS，所以只用在 `/api/card`、`/api/inbox` 这两个端点，而且每个查询都锁在 `OWNER_EMAIL` 那个帐号底下。

**NFC 贴纸**：买 NTAG215 / NTAG213（Shopee 一张几毛钱）。Android：SPACE「我的名片」→ NFC 贴纸 →「写进 NFC 贴纸」→ 贴近。iPhone：装 NFC Tools → 写 → 添加记录 → 网址 → 贴 `https://space-riccione-reka.vercel.app/c?s=nfc` → 写。
**FoloToy**：见 `network/folotoy/README.md`（要一台装了 ESP-IDF 的电脑）。

---

## 体检第 1 阶段升级（2026-11-20：公开页面关门）

**一定要先做第 1 步，再合并 / 部署新版**（新版会写 `inbox.has_photo` 和新的状态；资料库没升级的话，别人留资料会失败）。

1. Supabase → **SQL Editor** → 最新的 `network/supabase/schema.sql` **整份再跑一次**
   （补上 `inbox.has_photo`、`inbox` 的新状态 `pending` / `limited`、「删人时抹掉他留的资料」的触发器，并把以前删掉的人留下的资料抹掉；不会删别的资料）
2. 选填 · Vercel → Environment Variables：

   | Name | 预设 | 说明 |
   |---|---|---|
   | `AI_PUBLIC_MONTHLY_BUDGET_MYR` | `5` | 公开页陌生人拍名片、AI 读名片一个月最多花多少（另外算，不会吃光你自己的 AI 预算）。花完了照样收资料，只是名片留给你在「新朋友」按「AI 读名片」 |

3. 合并后 Vercel 会自动部署
4. 验收：用另一部手机扫码留资料，填一个**你已经存过的人的电话** → SPACE「新朋友」出现一张新的卡、上面写「像是你已经存过的 ×××」；那个旧的人资料**没被改**；按「合并进 ×××」→ 新的电话 / 邮箱 / 留言补进旧的人，新卡消失

改了什么：
- 限次：先在 `inbox` 占名额再数，同时送很多次也绕不过；同 IP 每小时 20 次，带名片照片的每小时 8 次；全部加起来每小时 300 次、带照片 60 次（被挡的不算进总数，一个人狂刷不会吃掉别人的名额）
- 已经存过的人不会被公开表格改到：一律进「新朋友」，你按「合并」才算。公司总机（03-、1300）和 `info@` / `sales@` 这种公用邮箱不拿来认人
- 先把人存好再让 AI 读名片（最多等 20 秒）；AI 卡住、出错、没额度，人都已经存好了
- 删掉一个人：他在 `inbox` 留的名字、电话、邮箱、留言一起抹掉（只留时间和加盐的 IP，限次用）
- 隐私说明加了「名片照片和资料会交给海外的 AI 服务（Anthropic）读」那句；同意条款版本改成 `pdpa-2026-11-20`

---

## 体检第 4 阶段升级（2026-11-20：把现有人脉搬进来）

**一定要先做第 1 步，再合并 / 部署新版**（新版存人时会写 4 个新栏位；资料库没升级的话，导入会跳「资料库还没升级」，编辑人物也会失败）。先合第 2、3 阶段（#90、#92）再合这个。

1. Supabase → **SQL Editor** → 最新的 `network/supabase/schema.sql` **整份再跑一次**
   （`people` 加 4 个栏位：`salutation` 称呼、`birthday` 生日、`import_source` 从哪导入、`first_due` 第一次提醒日；都有预设值，不会动到已经有的资料）
2. 合并后自动部署

验收（在你的 Android 手机上，用 Chrome 或装到主画面的 SPACE）：
1. 「人脉」→ 右上角「导入」→「从手机通讯录挑」→ 勾 5 个人 → 回到 SPACE 的清单：5 个人都勾好了，称呼猜好了（错的直接改）→「加入 5 人」
2. 「今日」：这 5 个人**今天不会出现**；之后 4 个月里每隔几天出现一个，写「从手机通讯录导入的，还没在 SPACE 记过联系」
3. 点其中一个人 → 「资料」那里有「称呼」；按 WhatsApp → 预填「Hi 称呼，」
4. 找一个 WhatsApp 群 → ⋮ →「更多」→「汇出聊天」→「不附媒体」→ 存到手机 → SPACE「导入」→「WhatsApp 群」→ 选那个 .txt：群名会自动当标签，没存名字的人显示号码（可以顺手写名字）
5. 同一份档案再导入一次 → 刚才加的人都显示「已在 SPACE」、不能再勾

## 体检第 3 阶段升级（2026-11-20：AI 稳定 + 补查）

**资料库不用升级**（`schema.sql` 没改；这次查过，以后要重跑也安全）。合并后 Vercel 自动部署就好；先合第 2 阶段（#90）再合这个。

验收：
1. 打开一个有公司的人 → 「深度分析」→ 一分钟内一定有结果或一句看得懂的话（不会再是「出错了（504）」）
2. 「我」→ 这个月的 AI 费用：每按一次 AI 功能，数字马上加上去；关掉 app 再开，数字一样（服务器记的）
3. 「新朋友」里只拍了名片的人 →「AI 读名片」→ 出现「AI 读的，对一下再存」，改一个字 →「存进去」→ 资料是你改的那个
4. 「记对话」→ Plaud → 贴一份很长的逐字稿（超过 3 万字）→ 出现「分成 N 段」→ 按 → 整理第 1 段、存 → 自动放第 2 段
5. 手机和电脑同时开 SPACE：电脑改一个人的备注 → 手机切回 SPACE（离开超过 1 分钟）→ 看得到电脑改的
6. 「我」→「汇出全部（JSON）」→ 再按「从备份补回」选刚汇出的档案 → 应该说「备份里的资料现在都在，不用补」

---

## 体检第 2 阶段升级（2026-11-20：活动连拍）

**资料库不用升级**（用的都是已经有的表：`people`、`photos`、`events`、`attendance`），合并后 Vercel 自动部署就好。

验收（在你自己的手机上，最好是装到主画面的 SPACE）：
1. 「扫名片」→ 最上面「在活动现场？用连拍」→ 新活动打个名字 →「开始拍」→ 第一次会问相机权限，按允许
2. **开飞航模式**，连拍 5 张名片（对准、按圆圈，不用等）；点其中一张 → 加 ⭐、写一句备注 →「拍完了」→ 应该写「5 张在手机等网络」
3. 把 SPACE 整个关掉（从多工画面滑掉）→ 关飞航模式 → 再打开 SPACE →「人脉」→「新朋友」：上面会写「还有 N 张在处理」，一两分钟内 5 个人都进来，名字、电话 AI 读好了；有 ⭐ 的那个有「重要」标签和你的备注
4. 「我的名片」→ 活动模式 → 刚才的活动 → 出席 5 人
5. iPhone 如果「开始拍」后是黑的 / 说打不开相机：iPhone 设定 → Safari（或 SPACE）→ 相机 → 允许；还是不行就用画面上的「用相机拍一张」，或先用相机 App 连拍、再按「相册」一次选全部

---

## 5) 验收清单（第 1 阶段）

- [ ] 手机上扫 3 张真的名片：名字、电话、公司对不对？哪里常错记下来
- [ ] 其中一个按「深度分析」：公司背景对不对？4 个维度的理由有没有引用真的事实？「我能给他什么」能不能本周就做？
- [ ] 加一张合照，标两个人；两个人的页面都看得到
- [ ] 「我」页的 AI 费用有在跳
- [ ] **换帐号测 RLS**：在 Supabase 暂时打开注册（或手动 Add user）建第二个帐号，登入后应该**一个人都看不到**、照片网址也打不开；测完删掉第二个帐号、关回注册
- [ ] 别的帐号登入后按 AI 功能 → 应该回「这个帐号不是主人」（`OWNER_EMAIL` 生效）

## 6) 验收清单（第 2 阶段：对话）

- [ ] **语音备注**：见完一个人，打开他的页面 →「加对话」→ 语音 → 用键盘麦克风说 1 分钟 → AI 整理 → 勾选 → 存；兴趣、资源、备注、「答应过的事」都有出现
- [ ] **Plaud**：一段真的录音，Plaud App 汇出 TXT（或 SRT）→ 上传 → 讲者 Speaker 1 / 2 有没有分对谁是你？
- [ ] **WhatsApp（iPhone）**：对话 → 联络人名字 → 汇出对话 →「不附加媒体」→ 存到档案 → 在 app 选那个 .zip；**再导入一次同一个档案**，应该说「没有新讯息」
- [ ] **WhatsApp（Android）**：⋮ → 更多 → 汇出对话 → 不含媒体 → .txt
- [ ] **截图**：3 张聊天截图 → 抄出来的对话对不对？
- [ ] 「答应过的事」打勾 → 移到「做完的」
- [ ] 换帐号测 RLS：第二个帐号看不到任何对话 / 逐字稿

## 7) 验收清单（第 3 阶段：关系图 + 今日行动）

- [ ] 打开 app 先看到「今日」：答应过的事（到期的排最前）、刚认识 3 天内的人、太久没联系的（核心每 2 周 / 重要每月 / 活跃每 2 个月 / 认识每 4 个月）
- [ ] 一个人按「联系过了」→ 从今日消失（除非还有答应的事没做）；「晚点再说 → 3 天后」→ 3 天内不出现
- [ ] **TickTick**：一个人按「排时间」→ 选时间 →「排进 TickTick」→ TickTick 里出现时间盒，内容有提示卡和 WhatsApp 连结；再试「一键排进 TickTick」排 3 个人，时间一个接一个
- [ ] 没设 token 时：「下载行事历档」→ iPhone 点开能加进行事历
- [ ] **提示卡**：见面前打开一个有对话记录的人 →「见面提示卡」：别聊、答应的事、上次聊什么、可以聊的话题都对吗？
- [ ] **找资源**：打「律师」「建筑师」「贷款」，结果合不合理？关系浅的有没有提醒「先联络感情」
- [ ] **星系**（电脑）：核心圈在最里面；好感度高的比较靠近中心；滑过去看得到名字和上次联系；点下去打开那个人
- [ ] 人物页「关系」：好感度条 + 半年曲线；补记一笔半年前的见面，曲线跟着变
- [ ] 换帐号测 RLS：第二个帐号的「今日」「星系」都是空的；按「排进 TickTick」应该回「这个帐号不是主人」

## 8) 验收清单（第 4 阶段：名片页 + 扫码留资料）

- [ ] 手机打开 `/c`：开场视频 / 照片、名字、WhatsApp 我、存我的联络方式都对；iPhone 按「存我的联络方式」→ 出现联络人预览 → 加入
- [ ] 4G 下打开 `/c` 要多久（目标：2 秒内看到名字）；视频太慢就换 720p / 剪短
- [ ] **用别人的手机**扫二维码 → 填名字 + 电话 → 勾同意 → 送出 → 「谢谢」→ 按「发 WhatsApp 给我」，讯息对不对
- [ ] SPACE「人脉」顶部出现「新朋友 1」→ 点进去：资料对、标签「扫码」、圈层「认识」、怎么认识 = 他填的 → 确认 → 消失
- [ ] **同一个人再扫一次**（同电话、换个职位）→ 不会多一个人，职位补上去、多一笔「扫码留资料」
- [ ] 只拍名片不打字 → AI 读出名字、电话（「我」页 AI 费用多一笔「扫码留的名片」）；把预算调到 0 再试 → 照样存，名字「名片待确认」→ 在新朋友按「AI 读名片」
- [ ] **活动模式**：建一个活动 → 扫活动二维码 → 页面显示「欢迎来到 …」→ 留资料 → 活动的「扫码进来的人」有他
- [ ] 不勾同意 → 送不出；同一支手机连续送 21 次 → 第 21 次说「送出太多次了」
- [ ] NFC：Android 写一张贴纸 → iPhone 碰一下 → 打开名片页；留资料 → 标签多一个「NFC」
- [ ] 「我的名片」关掉「显示留资料的表格」→ 1 分钟后 `/c` 没有表格
- [ ] 换帐号测：第二个帐号看不到「新朋友」、看不到 inbox；公开页只看得到名片内容
- [ ] FoloToy（有的话）：照 `folotoy/README.md` 烧好 → 用 iPhone 相机、Android 相机、WhatsApp 扫屏幕都扫得到

---

## 本机开发

```bash
cd network
cp .env.example .env.local   # 填好（不填 Supabase = 本机模式，资料存在浏览器）
npm install
npm run dev                  # http://localhost:5176，/api/* 也在本机跑；公开名片页 http://localhost:5176/c（没设 service role = 示范名片、表格不会真的存）
npm test                     # 单元测试（不会真的呼叫 AI）
```

---

## 费用估算

| 动作 | 模型 | 大概 |
|---|---|---|
| 扫一张名片 | Haiku 5.5 | RM0.01 以下 |
| 别人扫码时拍了名片（服务器读） | Haiku 5.5 | RM0.01 以下（超过预算就不读，照样存） |
| 查一家公司（只查一次，存起来） | Sonnet 5.5 + 网页搜索 ≤3 次 | RM0.3–0.5 |
| 评分 + 我能给他什么 | Sonnet 5.5 | RM0.1 |
| 整理一段对话（30 分钟逐字稿 / 几百则 WhatsApp） | Haiku 5.5 | RM0.01 左右 |
| 整理 6 张截图 | Haiku 5.5 | RM0.02 左右 |

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
| 别人留资料失败，Vercel 记录写「has_photo」/「inbox_outcome_check」 | 体检第 1 阶段的升级没跑：`schema.sql` 整份再跑一次 |
| 存对话时「avoid_topics column」/「resources_source_check」错误 | 第 2 阶段的升级没跑：`schema.sql` 整份再跑一次 |
| 按「晚点再说」出现「资料库还没升级」 | 第 3 阶段的升级没跑：`schema.sql` 整份再跑一次 |
| 「还没接 TickTick」 / 只有「下载行事历档」 | 没设 `TICKTICK_TOKEN`，或设了没 Redeploy |
| 「我的名片」存不了 / 上传照片说「资料库还没升级」 | 第 4 阶段的升级没跑：`schema.sql` 整份再跑一次 |
| `/c` 显示「名片暂时打不开」 | Vercel 没设 `SUPABASE_SERVICE_ROLE_KEY`（或设了没 Redeploy）；`OWNER_EMAIL` 在 Supabase 找不到 |
| 别人送出说「还没开放留资料」 | 同上：没设 `SUPABASE_SERVICE_ROLE_KEY` |
| 别人送出说「验证没过」 | 设了 `TURNSTILE_SECRET_KEY` 但 `TURNSTILE_SITE_KEY` 没设 / 网域没加进 Turnstile |
| 「TickTick 不接受这个 token」 | Token 过期或复制不完整：重新产生、贴进 `TICKTICK_TOKEN`、Redeploy |
| WhatsApp 档案「读不到讯息」 | 选错档案了；iPhone 要选整个 .zip（或里面的 `_chat.txt`） |
