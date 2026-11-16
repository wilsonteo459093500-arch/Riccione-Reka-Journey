# 人脉簿

只给自己用的人脉 app（灵感：康妮《如何结交比你更优秀的人》+ 卡耐基《人性的弱点》）。
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

## 结构

```
api/                    Vercel serverless（AI key 只在这里）
  _lib/auth.js          验证 Supabase token、OWNER_EMAIL、每月预算闸门
  _lib/ai.js            Anthropic client、JSON 解析、错误翻译
  _lib/cost.js          价目表 + 费用计算（前后端共用）
  scan-card.js          名片识别（Haiku 5.5，结构化输出）
  company.js            公司背景（Sonnet 5.5 + web search，server-side fallback）
  assess.js             4 维度评分 + 我能给他什么（Sonnet 5.5，结构化输出）
src/
  lib/logic.js          纯函数：圈层、评分、电话、去重、搜索（有单元测试）
  lib/repo.js           资料层：Supabase / IndexedDB 两套，画面不直接碰
  lib/store.jsx         全局状态 + 动作（存名片、深度分析、照片…）
  components/           PeopleList / ScanCard / PersonDetail / PhotoGrid / Settings / Login
supabase/schema.sql     13 张表 + RLS + 私有 bucket
test/                   node --test（API 用假的 client，不花钱）
```

## 资料模型（第 1 阶段定稿）

`profile` 我的资料 · `companies` 公司（含背景）· `people` 人物 · `circles` + `person_circles` 商会 / 圈子 ·
`resources` 资源标签（has / needs / give）· `interactions` 互动（含逐字稿、AI 摘要栏位，第 2 阶段用）·
`photos` + `photo_people` 照片 · `events` + `attendance` 活动出席（第 5 阶段用）·
`relationship_snapshots` 关系分数快照（第 3 阶段画趋势）· `ai_usage` AI 用量

`people.affinity`（Sims 好感度 0–100）现在固定 50，第 3 阶段加衰减公式。
