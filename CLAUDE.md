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
- **边做边报（2026-11-19）**：每做一段就简短说进度，并估计「大约还剩多久」；估错了马上更正。不要闷着做到最后才一次讲完。
- 新对话的开场白一般是：「继续做 UKIR STUDIO（blueprint/）……这次要做：第几项」。项目用 `blueprint/README.md`、`blueprint/ARCHITECTURE.md` 的说明。

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
- **用量是硬限制**：
  - 第一次跑（SPACE）同一个对话撞了两次 5 小时上限
  - 默认跑省量版：主对话和派出去的人都用 Opus 5.5 · high，不派「怀疑者」，主对话自己重跑证明脚本核实

## SPACE（network/）

- **2026-11-19 体检**：结论和第 0–6 阶段计划在 `network/PLAN.md` 最后一节
  - 开场白：「读 `network/PLAN.md`，做体检计划第 N 阶段」
  - 顺序（用户 2026-11-19 定的）：0 用户自己做的设定 → 1 公开页面关门 → 2 活动连拍 → 3 AI 稳定 + 补查 → 4 导入现有人脉 → 5 整理工具 → 6 每天提醒 → 7 WhatsApp 群发 → 8 小修
  - 用户的决定：两星期内有活动，所以连拍提前；每天提醒用**手机推送通知**（不是 TickTick 每日任务，试不通才退回）；FoloToy / 星系图 / NFC / 名片页改版**不冻结**
- 线上：Vercel 项目 `space-network`，Supabase 项目「SPACE NETWORK」。体检当天资料库只有 1 个人
- **2026-11-20 第 1 阶段（公开页面关门）做完、开了 PR**：合并前要先在 Supabase 把 `network/supabase/schema.sql` 整份再跑一次（`DEPLOY.md`「体检第 1 阶段升级」）。下一个是第 2 阶段「活动连拍」

## 上线流程（全部软件，2026-11-20 起）

- **合并进 main = 正式版自动更新**；别的分支 = 预览版，预览网址由 GitHub Actions 贴在 PR 留言里。详情 `DEPLOY-FLOW.md`
- 只有改到的软件才测试、出版本（登记在 `.github/apps.json`）；测试没过不上线
- Vercel 项目自己的 Git 自动部署已关掉（各 `vercel.json` 的 `git.deploymentEnabled: false` + 项目设定 deploymentPolicy），**不要再加 `ignoreCommand`**
- 新增软件：照 `DEPLOY-FLOW.md`「新增一个软件」做
- **2026-11-20 以前开的分支**（还没合 main 的）：推上去不会再自动出预览。先 `git merge origin/main` 把新流程带进来，再推一次就会出
- 推送照样要攒着推：每推一次，改到的软件各用一次 Vercel 额度（一天 100 次）

## KIRA（kira/）

- 2026-11-20 合进 main（阶段 1B），正式版 <https://kira-by-riccione-reka.vercel.app> 改成从 main 出；旧的长期分支 `claude/cabinet-measurement-tool-enhance-ymc43k` 不再用
- 体检报告和阶段计划：`docs/checkups/kira-2026-11-19.md`（在 PR #84）。下一个是阶段 2「AI 一键整屋报价」，先 brainstorm
- Supabase 是 KIRA 自己的项目「KIRA BY RICCIONE REKA」，**不是**旧报价工具那个
- 测试：`cd kira && npm test`（2026-11-20 时 303 项）

## VISI（invite/）

- **2026-11-19 体检**：结论和分阶段计划在 `.claude/plans/visi.md`
  - 不放 `invite/PLAN.md`：`invite/` 整个资料夹直接上线，放进去会变成公开网页，合并时还会触发正式版部署
  - 开场白：「读 `.claude/plans/visi.md`，做体检计划第 N 阶段」
  - 第 0 阶段 ①、第 1、2a、2b、2c、3 上半 **2026-11-20 做完、合进 main**（#97 一次合并；#88 / #91 / #94 / #96 已并进去）
  - **下一步：第 3 阶段下半（放真实案例照片）**，卡在等用户的 zip：
    - 用户要在**正式版**的公司案例库「审核 → 多选 → 导出给 VISI」。本机案例库存在浏览器里、跟网址绑在一起，**预览网址打开是空的**
    - 正式版 **2026-11-21 已更新到 #97**（合并当下 Vercel 额度用完，隔天用 Run workflow 补出，线上核对过）：按钮已经在了，就等用户导出
    - 收到 zip 后的步骤写在计划「第 3 阶段（下半）开了头」那一节：`import-builtin.mjs` → `same-shot.mjs` → 老板审图 → `retire.mjs`
  - 2b 用户定的：上传的照片**默认只给上传时开着的那位客户**（勾「公司共用」才全部客户自动配）；贴别的客户的需求卡**自动另开**；两个分页同时改**提醒并停存**
  - 顺序（2026-11-20 重排）：2a 发给客户的字、名字、号码都对 → 2b 不串图、不丢资料 → 3 图片 → 4 文案 → 5 手机 → 6 更顺手 → 7 让销售用起来（含跟进记录）→ 8 团队共用 → 9 更快 / 离线
  - 用户 2026-11-20 定的：五个系列的设计理念**现在的字就是对的**（来源是溪岸 2025 品牌手册，不是企业手册），不改，英文要审；邀请函把 Setia Alam 说成吉隆坡是**故意的**，不改；照片走「每个空间精选约 20 张放进内置图库」；公司案例库**冻结**
  - 用户的决定（2026-11-19）：先补完体检再动手；手机做轻的（贴卡、看预览、发文案，导出留给电脑）；方案存公司云端**要做**，排后段
  - 用户还决定：新方案**一律双语**；方案不满意的是**图片和文案**（不是版面）
- 用户说：VISI **还没正式给销售用**，四个原因都有：没培训、图库照片不够、销售习惯旧做法、方案还没到他要的样子。销售用电脑和手机
- 线上：Vercel 项目 `visi-riccione-reka`。2026-11-21 正式版已更新到 #97；没设 Supabase 的两个环境变数
  - 补部署：对「最后一个改到 `invite/` 的 commit」开 production 部署；对没改到 `invite/` 的 commit 开会被项目的规则取消
- 本机跑：`cd invite && python3 -m http.server <端口>`，开 `/visi.html`（没有 `/api` 也能用）
  - 测试：`node --test tools/caselib/test/`、`node tools/caselib/test/visi-cases.mjs`（浏览器，只测公司案例库那一段）
  - VISI 规则测试（2026-11-20 起）：`node --test tools/visi/test/*.test.mjs`（`load.mjs` 在 Node 里载入 VISI 的脚本，不用浏览器）
  - `tools/caselib/test/handlers.test.mjs` 载入失败 = `invite/node_modules` 没装：先 `cd invite && npm ci`（装好后 152 项全过）
  - GitHub 上线流程**不跑** VISI 的测试（`invite/package.json` 没有 `test`）：推之前自己跑上面两条
  - 浏览器实测：这个环境不让开本机伺服器，用 Playwright 的 `context.route` 直接从磁碟回档案

## 部署备忘（Vercel：全部 app 共用一个免费帐号）

- **一天只能部署 100 次**（2026-11-19 撞到，错误码 `api-deployments-free-per-day`）
  - 每次 push，每个 Vercel 项目都记一次（没改到、被跳过的看起来也算）→ **提交攒在一起再 push**，不要改一点推一次
  - 撞到之后，那天合并进 main 的东西不会上线，之后也不会自己补（#74 很可能就是这样漏掉的）→ 合并后要看正式版是不是真的更新了
  - **2026-11-20 又撞到**。查了过去 24 小时约 90 次部署：一半（45 次）来自旧分支 `ccr-eb67bc6b-ecbura`（#65 走进去）。
    没合 main 的旧分支每推一次，Vercel 还是替每个项目各建一次（建了再取消、建失败都算）→ **还在用的旧分支要先合 main**
  - 上线流程里出版本失败现在会**亮红灯**（2026-11-20 修：以前是绿灯，PR 留言只写 `undefined`）
  - 补正式版：GitHub Actions「测试 + 上线」→ Run workflow → 分支 main、填软件名（例 `visi`）。只用 1 次额度。
    不要按「重跑失败的」：改到 `.github/` 的那次推送是全部软件一起跑，重跑会用 4 次
  - 改 `.github/` 里的东西 = 全部软件各出一次版本：跟别的改动攒在一起推

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
