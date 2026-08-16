# PUMM ROUNDTABLE · 运维系统

私董会（peer advisory roundtable）的运维工具。10 位非同业的中小企业老板固定坐一张桌，
每月一次半天，轮流把真实问题拿上桌 —— 这个系统让桌长能把一场会跑完并留下记录，
不靠 Excel 和记忆。

> **老板帮老板。** 给答案的必须是同桌的老板，桌长只控流程、不给答案。

**第一版的验收标准：桌长在散会后十分钟内，能把一场会录完。**

---

## 五个模块

| 模块 | 对应 TABLE 步 | 做什么 |
|---|---|---|
| 会员与桌 | T 上桌 | 名单、**行业查重**、年费状态、NDA、在桌／出局、缺席预警 |
| 排期与出席 | T 上桌 | 一键排全年、案主自动排序、出席登记 |
| 会议运行 | A 只问 · B 出策 | 六段计时器、提问记录、建议逐条（**含提议人**） |
| 承诺追踪 | L 锁诺 | 1 诺 30 天、**锁诺时标注建议来源**、下场开场自动带出未结承诺、达成率 |
| 案例资产 | E 留证 | 每场一页归档、检索、导出成招募素材（匿名版） |
| 招募 | 传 | prospects pipeline：线索→邀请→参观→洽谈，行业冲突提前预警（桌长专属） |

外加**看板**（四个自动计算的数字 + **建议贡献榜**）与**提醒**（五条规则，
一键复制；接上 WhatsApp Cloud API 后每天早上 9 点全自动发送，见 DEPLOY.md 第 7 节）。

**建议贡献榜**：案主锁诺时自己点「这个行动主要来自谁的建议」，看板就有了
『谁的建议最常被采纳』的榜 —— 被采纳是案主投的票，不是桌长评的。
这是「老板帮老板，不是顾问给答案」从口号变成排行榜的那一步。

**会中语音输入**：陈述／提问／建议三个输入框都带麦克风按钮（浏览器自带
Web Speech API，语音不经过任何第三方服务器），旁边可切换 华/EN/BM
识别语言；不支持的浏览器自动隐藏按钮，退化回打字。

**v1.2 · 按「普通老板试用反馈」补的一轮**：
- 会员：同桌**名单**页（姓名/公司/行业/电话）、排期页**出席自助预报**（我会到/请假）、
  「我的」页**自改 PIN**（预设 1234 未改会提醒）、承诺**自评完成 + 进度备注**
  （正式结案仍在下一场桌上复盘）
- 桌长：开场时**按预报预填**出席、开会当天**看板置顶直达开场**、
  会中**断线恢复**（段落/案主/计时器存本地，刷新锁屏回来接着开，计时按真实时间续走）、
  计时到点**响声+震动**（可静音）、手机**底部导航栏**（开会时自动隐藏防误触）
- Case Record 新增**打印/存 PDF** 与 **分享长图**（WhatsApp 直接发）
- 「载入示范数据」加二次确认；本地模式在看板显眼提示

---

## 系统强制执行的桌规

不是提示，是拦下来不给存：

- **同桌行业不得重复** —— 新增会员时对同桌在册会员查重（忽略大小写与空格差异）
- **一桌 10 人满席** —— 满了就不能再加，除非先让人出局
- **年费未到账 / NDA 未签 → 不算入桌** —— 不计入在桌人数、不能被排成案主、不进出席率分母
- **无故缺席累计 2 次** —— 系统预警桌长，**出局由桌长按一次**，系统不自动踢人
- **每条建议都必须挂建议人** —— 没有「匿名」选项

请假（excused）与无故缺席（absent）分开记：只有无故缺席才累计出局。

---

## 角色与权限

**这不是技术偏好，是信任设计。会员敢不敢讲真问题，取决于理事会看不看得到内容。**

| 角色 | 看得到 |
|---|---|
| 桌长 Chair | 全部 + 主持模式 |
| 记录员 Recorder | 案例建立／编辑／归档、排期、承诺、提醒 |
| 会员 Member | **只有**自己的承诺、桌规、日期 —— 看不到别人的案例 |
| Star Director 理事会 | **只有**统计数字与出席率 —— 看不到任何案例内容 |

权限矩阵在 `src/constants.js` 的 `CAPABILITIES`，每个页面进来前都过一次 `can(role, ...)`。
案例正文只有一个入口（`cases` 页），会员与理事会的导航里根本没有这一项。

> ⚠️ **第一版的权限跑在浏览器里。** 数据库那一层还没锁 —— 拿到网址与 anon key 的人，
> 技术上能读到案例。加固脚本已写好（`supabase/harden.sql`，前提是先开邮箱登录，
> 步骤在脚本文件头），开第二桌之前务必执行。这一点在 README 写明，
> 是因为它关系到会员对这张桌的信任，不该含糊过去。

---

## 看板的四个数

| 指标 | 算法 | 目标 |
|---|---|---|
| 出席率 | present / 已登记人次（已结束场次，理事会不计入） | ≥ 80% |
| 续会率 | 续费会员 / 上年度会员 | ≥ 80% |
| 案例数 | cases 计数 | 三场累计 ≥ 5 |
| 承诺达成率 | done / 总承诺 | 越高越好 |

前三个是试点桌的成败判定，看板会直接给判语：
**三个数不全达标 → 修流程再跑一轮，不开第二桌。**

数据不足时显示 `—`，不会拿 0% 冒充「达标失败」。

---

## 自动提醒（半自动，讲清楚）

规格里的五条规则都实现了，但**第一版没有后端排程**：系统算出「今天该发什么、发给谁、
发什么字」，桌长在「提醒」页按一下复制，贴进 WhatsApp。规则是自动的，送达是人工的。

| 触发 | 动作 |
|---|---|
| 会前 7 天 / 1 天 | 向全体会员发出席确认 |
| 会后当天 Case Record 未填 | 提醒记录员 |
| 承诺到期前 3 天（含逾期） | 提醒案主 |
| 同一会员无故缺席第 2 次 | 通知桌长 |
| 年费到期前 30 天（未续会） | 提醒续会 |

要升级成全自动发送，Edge Function 已写好，照 DEPLOY.md 第 7 节接上即可。

---

## 数据模型

五张表（规格的四张 + 招募 prospects）：

```
members      id, name, company, industry, tableId, joinedAt,
             feeStatus(unpaid|paid), feeAmount, feeDueDate, renewalStatus,
             ndaSigned, status(active|removed), role, pin

sessions     id, tableId, date, presenterIds[1-2], status(scheduled|running|closed),
             attendance{ memberId: present|excused|absent }, takeaways[]

cases        id, sessionId, presenterId, problemStatement,
             questions[{ text, askerId }],
             advices[{ text, advisorId }],     ← 最关键的字段
             commitmentText, commitmentDue, archivedAt

commitments  id, caseId, sessionId, memberId, content,
             dueDate(= session.date + 30d), status(open|done|missed), reviewNote,
             sourceAdviceIds[]           ← 采纳闭环：案主标的「来自谁的建议」

prospects    id, name, company, industry, phone, referrerId,
             status(lead|invited|visited|joining|declined), visitedSessionId, notes
```

**`cases.advices[].advisorId` 是全系统最关键的字段** —— 日后要证明「老板帮老板」
而不是「顾问给答案」，靠的就是这一栏。所以给建议时必须选人，没有匿名选项。

**出席记录挂在 `sessions.attendance` 上**，没有独立的 attendance 表。语义与规格里的
attendance 表一致（present / excused / absent），第二版拆表时可以直接平移。
`tableId` 每张表都留着了，但第一版单桌，桌信息写死在 `src/constants.js` 的 `TABLE`。

---

## 技术栈与数据策略

Vite + React 18 + Tailwind，与本 repo 其他几个 app 同构。**两种数据模式**：

- **本地模式**（默认）：存在这台浏览器的 IndexedDB，只有这台设备看得到。
- **云端同步模式**：配置 Supabase 后启用 —— 全桌共享同一份数据、实时同步。

跟 Sail Delivery OS 一样遵守**混合存储原则**：结构化数据进 Supabase（随时 CSV 导出），
应用从不存二进制文件。

## 云端同步设置（可选）

1. 在 [supabase.com](https://supabase.com) 新建一个 project。
2. **SQL Editor** 里执行 `supabase/schema.sql`（建表 + RLS + 实时）。
3. **Project Settings → API** 复制 `Project URL` 与 `anon public` key。
4. 本地开发：`cp .env.example .env.local` 并填入两个值。
5. 部署（Vercel / Netlify）：在平台环境变量里设置这两个值，重新构建。

## 开发

```bash
cd pumm
npm install
npm run dev      # http://localhost:5175
npm run build    # 生产构建到 dist/
npm test         # 桌规／看板／提醒／排期／贡献榜的逻辑测试（34 项，无需依赖）
```

首次启动会自建三个账号：**桌长 / 记录员 / Star Director**，PIN 都是 `1234`
（在「会员与桌」里逐个改掉）。桌上没人时，「会员与桌」页有一个
**「载入示范数据」** 按钮：一桌 10 人 + 3 场会 + 3 个案例 + 承诺，
五秒钟看懂这系统在干嘛。⚠️ 它会**覆盖**现有数据，只在空桌时用。

## 结构

```
src/
  constants.js            # 桌规、TABLE 五步、角色权限矩阵、看板目标 —— 改规则先改这里
  utils.js                # 纯函数：查重、出席、看板算法、提醒、导出（有测试）
  seed.js                 # 开局三账号 + 示范数据集
  services/
    repo.js               # 一层抽象盖住 Supabase / IndexedDB 两个后端
    supabase.js storage.js
  components/
    Shared.jsx            # 卡片 / 按钮 / 徽章 / 弹窗 / 权限墙
    LoginScreen.jsx Header.jsx
    views/                # dashboard · members · prospects · schedule · run
                          # · commitments · cases · reminders · rules · me
    modals/MemberFormModal.jsx
test/logic.test.mjs       # node test/logic.test.mjs
supabase/
  schema.sql              # 建表脚本（宽松策略，网址即密码）
  harden.sql              # 数据库层权限加固（开第二桌前执行）
  functions/send-reminders/  # WhatsApp 每日自动提醒（Edge Function）
```

---

## 开发优先顺序（对照规格第 8 节）

- [x] 1. 四张表 + 能录一场会（主持模式六段流程）
- [x] 2. 出席登记 + 看板（四个数 + 试点判定）
- [x] 3. 自动提醒（半自动：规则自动、送达人工）
- [x] 4. 会中计时器；手机端可用（响应式，桌长可拿手机主持）

## 下一步（按值得做的顺序）

1. **数据库层权限加固** —— 脚本已写好（`supabase/harden.sql`），前提是先开
   邮箱登录，步骤在脚本文件头 + DEPLOY.md 第 8 节。开第二桌前必须做。
2. **WhatsApp 全自动发送** —— Edge Function 已写好
   （`supabase/functions/send-reminders`），照 DEPLOY.md 第 7 节接上
   Meta 的 token 就跑。⚠️ 改提醒规则时 `src/utils.js` 与该函数要两边同步。
3. **会员个人价值账单** —— 跑满三场有真实数据后做：我拿到几条建议、我给出几条、
   我被采纳几次、年度一页回顾。这是续会武器（贡献榜是它的第一块）。
4. **Case Record 出 PDF** —— 现在靠浏览器打印（已写好 print 样式）与纯文字导出。
5. **拆 attendance 表 + 多桌** —— 等真的要开第二桌再做，别提前上多租户架构。
