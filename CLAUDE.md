# 给 Claude 的项目记忆

每次新对话都会先读这份。改了做法、做了决定，就更新这里（写清日期）。

## 跟用户怎么合作

- 用中文沟通。用户是溪岸（SAIL）/ RICCIONE REKA 这边的人，不写代码：
  - 说结果和怎么用，不讲实现细节
  - 用户能做的决定，用选项问
- **先 brainstorm 再执行**：新功能先列出几条路和取舍，用户选了再动手。
- 做完：
  - 开 draft PR，附预览链接和截图 / 录屏
  - 用户看过说「合并」才合并
- 新对话的开场白一般是：「继续做 UKIR STUDIO（blueprint/）……这次要做：第几项」。项目用 `blueprint/README.md`、`blueprint/ARCHITECTURE.md` 的说明。
- **少推几次**（2026-11-19 真的撞到）：
  - Vercel 是免费方案，一天最多 100 次部署；每推一次，5 个项目（visi、space-network、sail-render、kira、wish）各算一次，不管改的是不是它的东西。
  - 用完后所有软件 24 小时内出不了预览、也更新不了正式版。
  - 所以：做完一段再推，不要每个小 commit 都推。根治的办法排在 KIRA 阶段 1B（见 `docs/checkups/kira-2026-11-19.md` 问题 3b）。

## 三条原则（UKIR STUDIO）

1. **图纸必须准确**：
   - 位置、比例、文字都来自设计师的原稿或设计师核对过的数据
   - 展厅播放「停下来就是原图」：停点上逐像素等于原图，有测试锁住
2. **AI 只能建议、不能编**：
   - AI 给的东西（框、建议）要设计师核对、打勾才算数
   - 给客户看的文案（设计特点等）要老板审过：`.claude/skills/interior-design-expert/references/cabinet-craft.md` 第四节，和 `src/showroom/craft.js` 的 `CRAFT_COPY` 一字不差
   - 溪岸系列的说法照抄品牌官方
3. **少花 AI 费用**：
   - 能用程序算的不用 AI
   - 要用就一次看图、用便宜的模型，在界面上写明大概多少钱

## 已经做完、合进 main 的（UKIR STUDIO 展厅播放）

- #66 展厅播放：滑着看方案、「从无到有」线稿上色、3D 户型开场
- #67 房间设计特点：从图纸文字认出来 → 设计师打勾 → 老板审过定义才播
- #68 设计特点小卡片配图 + UKIR STUDIO 木纹 U 新字标

## 决定不做的（别再提）

- **2026-11-18「毛坯 → 柜子一件件出现」**：
  - 做法：SketchUp 毛坯图比对，没有毛坯图时设计师框柜子
  - 试做后用户看了效果，觉得不够理想，**不做了**
  - PR #71 已关闭、没合并；代码还能从 GitHub 的 `refs/pull/71/head` 找回

## 接下来可以做的（按建议顺序）

1. **用真的方案 PDF 测「设计特点」**（下一项）
   - 用户在对话里附上真实案子的 PDF
   - 看导入、设计特点认词（漏认 / 错认）、整套展厅播放是否顺
   - 之前全部只用样例数据测过
2. 换上溪岸自己拍的工艺特写：
   - 替换 `blueprint/public/craft/` 里 27 张「示意」图，补「离缝」
   - 同名替换，并把 `CRAFT_PHOTOS` 的 `source` 改成 `'sail'`
3. AI 方案主题建议：规则要先 brainstorm
4. 展厅播放接 D5 / SU / 3ds Max 漫游视频：先调查设计师能导出什么格式

## 软件体检（`app-checkup` skill，2026-11-19 建）

- 用户说「帮我看 X 这个软件怎么样、有什么要提升、做分阶段计划」→ 用 `.claude/skills/app-checkup/`，流程固定：
  - 摸底 → 派 3–4 个人体检 → 面试两轮 → 分阶段计划（每阶段写 model、effort、几时开新对话）→ 存进 `<app>/PLAN.md`
  - 全程每一步报进度和剩余时间（用户明确要的；「streaming responses + remaining time」指对话时这样做，不是改 app）
  - app 还不在 main 里（例：KIRA）→ 计划存 `docs/checkups/<app>-<日期>.md`
- **用量是硬限制**：
  - 第一次跑（SPACE）同一个对话撞了两次 5 小时上限；同一天 KIRA 那次也撞了两次（开着 ultracode 派 14 个人，一个都没跑完），最后是主对话一个人查完的
  - 默认跑省量版：主对话和派出去的人都用 Opus 5.5 · high，不派「怀疑者」，主对话自己重跑证明脚本核实
  - 平常的开发对话不要开 ultracode（`/effort ultracode off`）

## SPACE（network/）

- **2026-11-19 体检**：结论和第 0–6 阶段计划在 `network/PLAN.md` 最后一节
  - 开场白：「读 `network/PLAN.md`，做体检计划第 N 阶段」
  - 顺序（用户 2026-11-19 定的）：0 用户自己做的设定 → 1 公开页面关门 → 2 活动连拍 → 3 AI 稳定 + 补查 → 4 导入现有人脉 → 5 整理工具 → 6 每天提醒 → 7 WhatsApp 群发 → 8 小修
  - 用户的决定：两星期内有活动，所以连拍提前；每天提醒用**手机推送通知**（不是 TickTick 每日任务，试不通才退回）；FoloToy / 星系图 / NFC / 名片页改版**不冻结**
- 线上：Vercel 项目 `space-network`，Supabase 项目「SPACE NETWORK」。体检当天资料库只有 1 个人

## KIRA（柜子规划 + 预估报价，内部用；对客户印 SAIL BY RICCIONE REKA）

- **代码不在 main**（2026-11-19 时）：
  - 正式版分支：`claude/cabinet-measurement-tool-enhance-ymc43k`（PR #58，草稿）。目录 `kira/`，说明在那条分支的 `kira/README.md`、`kira/DEPLOY.md`、`kira/docs/V3-PLAN.md`
  - 最新还没上线的：PR #75（岩板台面报价、AI 识图改进、👎 反馈）
  - 正式网址 `kira-by-riccione-reka.vercel.app`（Vercel 项目 `kira-riccione-reka`）。合并不会自动上线，做法写在 `V3-PLAN.md` 最后一节
  - 云端是自己的 Supabase 项目「KIRA BY RICCIONE REKA」（不是旧报价工具那个；文档写错了）
- **体检（2026-11-19）**：`docs/checkups/kira-2026-11-19.md`，问题、计划、每阶段的开场白都在里面。
- **老板定的（2026-11-19）**：
  - 业务还在用旧报价工具；还没换是因为「还没正式交给业务」和「还不放心价钱」
  - 预估价和签约价差 10% 左右可以接受
  - 价格表很少改，继续让 Claude 改，**不做后台改价**
  - GitHub 仓库要改成不公开（在阶段 1B 的对话里和 Claude 一起做，当场确认还能上线）
  - AI 自动报价：现阶段要「业务助手」（AI 出草稿、业务确认才发）；全自动回客人是长期想法，要先用真实案子验证准确度
- **阶段**（照顺序，一个阶段一个新对话）：
  1. 1A 修钱（AI 加的柜子不跟楼高、设计师净价版 Excel 岩板行、比例检查、折扣输入）→ PR #75 上线
  2. 1B 合进 main、合并 = 上线、仓库不公开
  3. 2 AI 一键整屋报价（先 brainstorm）
  4. 3 考试：5–10 个真实案子对价 + 看 AI 差多少
  5. 4 交给业务（备份、改动记录、单号和状态、教学）
  6. 5 客人自助估价（阶段 3 达标才做）
- 每个阶段的 model · effort 和开场白在体检报告里。阶段 1A 的开场白要写明：接着 PR #75 做、可以推到它的分支 `ccr-d50823fb-lcwm1r`。

## 开发备忘（blueprint/）

- 测试和构建：
  - `cd blueprint && npm test`：Node 跑全部测试（2026-11-16 时 560 项）
  - `npx vite build`：构建
- 浏览器实测（Playwright，镜像里已经装好）：
  - 先 `npx vite --port 5173`
  - 登录：`localStorage['blueprint.auth.v1']` = `src/store/auth.js` 里的 `AUTH_HASH`，设好后要 `page.reload()`，只换网址的 `#` 部分不会重新载入
  - 样例项目：在页面里 `await import('/src/engine/model.js')`（`newProject`、`assembleDeck`）、`/src/store/assets.js`（`storeBlob`）、`/src/store/db.js`（`saveProject`）建一个
  - 每次 `chromium.launch()` 是全新浏览器，IndexedDB 是空的，要重新建样例项目
  - 展厅播放网址：`#/p/<项目 id>/show`
- 截图里的中文：这台机器只有 `/usr/share/fonts/opentype/unifont/unifont.otf` 能显示
