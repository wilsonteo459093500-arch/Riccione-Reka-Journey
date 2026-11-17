# S.T.A.R

**Strong Ties Are Riches** —— 只给自己用的人脉 app。名字的四个字母就是四个动作：

| | | |
|---|---|---|
| **S**eek | 寻找 | 扫名片、认识新的人 |
| **T**reasure | 珍惜 | 记下他的兴趣、对话、合照 |
| **A**ssist | 帮助 | 先想「我能给他什么」 |
| **R**econnect | 再联系 | 提醒今天该找谁（第 3 阶段） |

灵感来自 Starlink：你是中间的星，每个人是一颗卫星，圈层（核心 5 / 重要 15 / 活跃 50 / 认识 150）就是一层层轨道。

方法来自康妮《如何结交比你更优秀的人》和卡耐基《人性的弱点》。
规划和分阶段计划见 [`PLAN.md`](./PLAN.md)，部署见 [`DEPLOY.md`](./DEPLOY.md)。

## 第 1 阶段做了什么

- **登入**：Supabase 邮箱 + 密码；所有表都有 owner，RLS 只让本人读写；照片在私有 bucket，看图用 1 小时的签名网址
- **扫名片**（手机）：拍正面（+ 背面）→ 手机先缩图 → `/api/scan-card`（Haiku 5.5）→ 检查 / 修改 → 存
  - 自动认出「可能已经存过」（电话末 9 码、邮箱、名字 + 公司），电话或邮箱一样时默认「更新这个人」
  - 自动挑 WhatsApp 号码（`012-345 6789` → `60123456789`）
- **深度分析**（按按钮才跑）：
  1. `/api/company`：Sonnet 5.5 + 网页搜索查公司背景，存进 `companies.background`，同一家公司不重查
  2. `/api/assess`：4 个维度评分（能带来家具生意 / 超级连接者 / 有我缺的资源 / 我能帮到他）、一句话总结、建议圈层、**我可以给他什么（家具以外）**、他有的 / 需要的资源、下次可以聊的话题
- **人物页**：圈层（核心 5 / 重要 15 / 活跃 50 / 认识 150）、WhatsApp / 电话 / 邮件、资源三栏、商会 / 圈子 + 职位、公司背景 + 来源、见面 / 互动时间线、合照（可以标多个人、设头像）、兴趣 / 标签 / 备注
- **我**：这个月 AI 费用（对 RM50 预算）、圈层人数、我的资料（AI 评分时当「我」的背景）、汇出 JSON
- **电脑**：左边列表、右边详情

## 第 2 阶段做了什么：对话输入与分析

**入口**：人物页「见面 / 互动」的「加对话」、列表右上「记对话」（手机）、左边栏「记对话」（电脑）。路由 `#/p/<id>/talk`、`#/talk`。

| 来源 | 怎么进来 | 处理 |
|---|---|---|
| **Plaud 逐字稿** | 贴上，或上传 Plaud 汇出的 `.txt` / `.srt` / `.vtt` | 字幕档去掉序号、时间轴，同一个讲者连续的句子接起来 |
| **语音备注** | 手机键盘的麦克风直接说（中文 / 英文都行）；打到一半离开不会丢 | 当成第一人称的备注 |
| **WhatsApp 聊天记录** | 汇出对话（不附加媒体）：iPhone 的 `.zip`、Android 的 `.txt` 都收 | 在手机上解析（iPhone / Android、日月年 / 月日年 / 年月日、AM/PM、中文「上午 / 下午」、多行讯息、媒体、已删除、系统讯息）；选「他是谁 / 我是谁」；**记住上次导入到哪一则，下次只送新的**；从档名猜是谁 |
| **WhatsApp 截图** | 最多 6 张 | AI 先把截图里的对话抄成文字存起来（截图本身不存） |

**AI**：`/api/analyze-talk`（Haiku 5.5，结构化输出）整理出 标题、摘要、气氛（-2 ~ +2）、兴趣、他有的、他需要的、**我可以帮他的**、近况 / 家人、**谁答应了什么**、要避开的话题、提到的人、下次可以聊。对话放在 `<conversation>` 标签里，里面的指示不会照做。

**勾选**：AI 整理的东西全部先给你勾，勾了才写进档案：
- 兴趣 → `people.interests`；要避开的话题 → `people.avoid_topics`（人物页名字下面显示「别聊：…」）
- 他有的 / 需要的 / 我能帮他的 → `resources`（`source = 'talk'`，💬 标记，detail 写「哪天的对话」）。深度分析只会换掉上一次 AI 推测的（✦），对话来的会留着，而且会送进评分
- 近况 → 接在「我的备注」后面（`【2026-11-17】女儿明年读大学`，同一句不重复）
- 答应的事 → 人物页最上面的「答应过的事」，打勾 = 做完（存在 `interactions.ai.action_items[].done`；第 3 阶段「今日行动」会拿来用）
- 原文 → `interactions.transcript`（私密）；整理结果（只留勾过的）→ `interactions.ai`；见面 / 电话 / 讯息会更新「上次联系」

**不想跑 AI**：「只存原文」直接存成一笔互动。

**Plaud API**：查过了（2026-11）—— Plaud **没有给个人 app 用的公开 API**（官方说用 Plaud MCP / CLI 读自己的录音；Developer Platform 是给硬件厂商的 Embedded SDK）。所以用汇出的文字档。如果以后 Plaud 开放了，加一个 `/api/plaud-import` 就好，后面的整理流程不用改。

## 结构

```
api/                    Vercel serverless（AI key 只在这里）
  _lib/auth.js          验证 Supabase token、OWNER_EMAIL、每月预算闸门
  _lib/ai.js            Anthropic client、JSON 解析、错误翻译
  _lib/cost.js          价目表 + 费用计算（前后端共用）
  scan-card.js          名片识别（Haiku 5.5，结构化输出）
  company.js            公司背景（Sonnet 5.5 + web search，server-side fallback）
  assess.js             4 维度评分 + 我能给他什么（Sonnet 5.5，结构化输出）
  analyze-talk.js       对话整理（Haiku 5.5，结构化输出；截图也走这里）
src/
  lib/logic.js          纯函数：圈层、评分、电话、去重、搜索（有单元测试）
  lib/talk.js           纯函数：WhatsApp 解析、字幕清理、承诺、合并（有单元测试）
  lib/repo.js           资料层：Supabase / IndexedDB 两套，画面不直接碰
  lib/store.jsx         全局状态 + 动作（存名片、深度分析、照片…）
  components/           PeopleList / ScanCard / TalkImport / PersonDetail / PhotoGrid / Settings / Login
supabase/schema.sql     13 张表 + RLS + 私有 bucket
test/                   node --test（API 用假的 client，不花钱）
```

## 资料模型（第 1 阶段定稿）

`profile` 我的资料 · `companies` 公司（含背景）· `people` 人物 · `circles` + `person_circles` 商会 / 圈子 ·
`resources` 资源标签（has / needs / give；来源 manual / ai / talk）· `interactions` 互动（含逐字稿、AI 整理、承诺）·
`photos` + `photo_people` 照片 · `events` + `attendance` 活动出席（第 5 阶段用）·
`relationship_snapshots` 关系分数快照（第 3 阶段画趋势）· `ai_usage` AI 用量

`people.affinity`（Sims 好感度 0–100）现在固定 50，第 3 阶段加衰减公式（可以用每笔对话的 `ai.mood.score`）。
第 2 阶段加了 `people.avoid_topics`（要避开的话题）。
