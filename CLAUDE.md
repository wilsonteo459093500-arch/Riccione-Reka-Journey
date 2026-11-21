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

## UKIR STUDIO 接下来做什么（2026-11-20 体检）

- **照 `blueprint/PLAN.md` 的第 0–10 阶段做**。开场白：「读 `blueprint/PLAN.md`，做体检计划第 N 阶段」
  - 第 0 阶段是用户自己做的设定；Claude 从第 1 阶段「展厅播放敢给客户看」开始
  - 原来的下一项「用真的方案 PDF 测」现在是第 2 阶段
  - **2026-11-21 第 2 阶段上半做完、合进 main（#101）**（体检列的认错写法全修好、忽略清单、测试数据自动抹客户资料）；下半要用户附上真的 PDF 才能做，进度和那张表在 `blueprint/PLAN.md` 最后一节
  - **2026-11-21 第 1 阶段（展厅播放敢给客户看）做完、合进 main（#104）**：进度和「还没做的」在 `blueprint/PLAN.md`「第 1 阶段做完了」。用户定的：检查清单每次都出；点左边四分之一 = 上一页；说明栏放不下只放前几条。**用户还要去展厅大屏彩排一次**（合并时还没去）。下一个：用户给了真的 PDF 就做第 2 阶段下半，没有就做第 3 阶段「认不准的地方会告诉设计师」
  - **2026-11-21 第 3 阶段（认不准的地方会告诉设计师）做完、合进 main（#106）**：「请核对这几处」清单 + 项目信息加 / 删 / 移楼层，详情在 `blueprint/PLAN.md`「第 3 阶段做完了」。下一个：有真的 PDF 就做第 2 阶段下半，否则第 4 阶段「资料不丢」
  - **2026-11-21 第 4 阶段（资料不丢）做完、开了 PR**（和第 3 阶段 #106 同时做，合并时已经接上）：首页「资料安全」、全部备份（资料夹 + 一个文件，用户选两种都要）、恢复问「更新 / 另存」、7 天提醒、自动清没用的图片、导入可取消、清除本机全部资料。`sail-render` 网址在 Vercel 上 2026-08-14 起就转到 `ukir-studio`，体检那条说法不对、不用做。详情 `blueprint/PLAN.md`「第 4 阶段做完了」。下一个：有真的 PDF 就做第 2 阶段下半，否则第 5 阶段「试点准备」
- 用户 2026-11-20 定的：
  - **先修展厅播放，再修 PDF 导入**
  - 3D 户型图**继续改进**（第 7 阶段，先 brainstorm 具体是慢、贵还是不准）
  - 设计特点卡片上别家品牌的示意图**照旧放、标「示意」**，不用再提要不要藏
  - 还没正式用：只有用户自己试过，项目只在一台电脑；真的方案 PDF 手上有 1–2 份
- **仓库是公开的**（2026-11-20 核实）：
  - 真实客户的 PDF、备份档、截图、抽出来的文字**不准提交**，只放 scratchpad
  - 第 0 阶段请用户改成 Private；改之前真的 PDF 也不要进仓库
- 体检计划之外、以后可以做的：
  1. 换上溪岸自己拍的工艺特写：
     - 替换 `blueprint/public/craft/` 里 27 张「示意」图，补「离缝」
     - 同名替换，并把 `CRAFT_PHOTOS` 的 `source` 改成 `'sail'`
  2. AI 方案主题建议：规则要先 brainstorm
  3. 展厅播放接 D5 / SU / 3ds Max 漫游视频：先调查设计师能导出什么格式

## 软件体检（`app-checkup` skill，2026-11-19 建）

- 用户说「帮我看 X 这个软件怎么样、有什么要提升、做分阶段计划」→ 用 `.claude/skills/app-checkup/`，流程固定：
  - 摸底 → 派 3–4 个人体检 → 面试两轮 → 分阶段计划（每阶段写 model、effort、几时开新对话）→ 存进 `<app>/PLAN.md`
  - 全程每一步报进度和剩余时间（用户明确要的；「streaming responses + remaining time」指对话时这样做，不是改 app）
- **用量是硬限制**：
  - 第一次跑（SPACE）同一个对话撞了两次 5 小时上限
  - 默认跑省量版：主对话和派出去的人都用 Opus 5.5 · high，不派「怀疑者」，主对话自己重跑证明脚本核实
  - 2026-11-20 UKIR STUDIO 跑完整版（用户选的）：7 路 + 怀疑者共 14 人跑完了，再补派 2 人实测时撞上限被切断
- **跑之前确认对话不是计划模式**（2026-11-20 学到）：
  - 计划模式下派出去的人也只能看、不能跑，「实际操作」「客户看到的」两路会变成只读代码
  - 那次对话里机器重启了两次，两次之后都回到了计划模式（原因没查明），要用户再点一次同意才能存档、开 PR
- **名字对不上先问**：「ukur」可能是 UKIR STUDIO（`blueprint/`）、KIRA 里的「Ukur 量尺」、或没上线的 UKUR 雏形（`measure/`，分支 `claude/cabinet-length-estimator-3fku8c`）。2026-11-20 用户说的是 UKIR STUDIO
- 被切断的人不是白跑：脚本输出和截图在 scratchpad，没存成档案的输出在他们的对话记录里（workflow 的 `agent-*.jsonl`）

## SPACE（network/）

- **2026-11-19 体检**：结论和第 0–6 阶段计划在 `network/PLAN.md` 最后一节
  - 开场白：「读 `network/PLAN.md`，做体检计划第 N 阶段」
  - 顺序（用户 2026-11-19 定的）：0 用户自己做的设定 → 1 公开页面关门 → 2 活动连拍 → 3 AI 稳定 + 补查 → 4 导入现有人脉 → 5 整理工具 → 6 每天提醒 → 7 WhatsApp 群发 → 8 小修
  - 用户的决定：两星期内有活动，所以连拍提前；每天提醒用**手机推送通知**（不是 TickTick 每日任务，试不通才退回）；FoloToy / 星系图 / NFC / 名片页改版**不冻结**
- 线上：Vercel 项目 `space-network`，Supabase 项目「SPACE NETWORK」。体检当天资料库只有 1 个人
- **2026-11-20 第 1 阶段（公开页面关门）** 合进 main（#86）
- **2026-11-20 第 2 阶段（活动连拍）做完、开了 PR**：用户选了「有网络自动 AI 读」+「每张可选 ⭐ / 备注」；资料库不用升级。下一个是第 3 阶段「AI 稳定 + 补查」
- **2026-11-20 第 3 阶段（AI 稳定 + 补查）做完、开了 PR**：叠在第 2 阶段的分支上（先合 #90）；资料库不用升级。补查结论在 `network/README.md`「体检第 3 阶段」。下一个是第 4 阶段「把现有人脉搬进来」（先 brainstorm 导入画面）
- **2026-11-20 第 4 阶段（把现有人脉搬进来）做完、开了 PR**：叠在第 3 阶段（#92）上，合并顺序 #90 → #92 → 第 4 阶段；**合并前要先重跑 `schema.sql`**（people 加称呼 / 生日 / 导入来源 / 第一次提醒日）。用户选的：清单打勾、用 Android、导入的人先全放「认识」（第一次提醒分散 120 天）、WhatsApp 群用汇出的聊天记录（不用截图 AI）。称呼规则 `network/src/lib/salute.js`，导入 `network/src/lib/importer.js`。下一个是第 5 阶段「整理工具」
- **2026-11-20 第 2、3、4 阶段验收后一起合进 main**：
  - 资料库「SPACE NETWORK」已经升级好（那 4 个栏位），不用再跑
  - 验收只在电脑上模拟手机走过（通讯录挑选器是假的）；真的 Android 通讯录、真的相机连拍、真的 AI 还要用户自己照 `network/DEPLOY.md` 走一遍
  - 验收时改了一处：从手机通讯录挑的人，回到清单就是勾好的（档案 / 表格照旧不勾）
- 第 0 阶段还没做完（2026-11-20 查 Vercel）：`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` 没设（要用户在 Cloudflare 建、自己贴进 Vercel，secret 不经过对话）；`SUPABASE_SERVICE_ROLE_KEY` 还勾着 Preview

## P.L.A.Y（play/，游戏平台，2026-11-21 计划）

- 自己手机开房 → 二维码给家人朋友加入；游戏：密码机、露营达人、象棋、军棋（两人暗棋 / 翻翻棋 / 四国）、森林身份游戏（Avalon 类）、看图说故事（Dixit 类）
- 计划在 `play/PLAN.md`（第 0–10 阶段）。开场白：「读 `play/PLAN.md`，做第 N 阶段」。还没开始写程序
- **Dixit / Avalon 只做玩法同类的原创版**：名字、角色、图卡都不能用原版的；GiiKER 的密码机、露营只借玩法，外观和关卡自己做
- FoloToy（第 2 阶段）：固定「我的游戏房」二维码 + 密码机，**用户在别的对话做**

## 上线流程（全部软件，2026-11-20 起）

- **合并进 main = 正式版自动更新**；别的分支 = 预览版，预览网址由 GitHub Actions 贴在 PR 留言里。详情 `DEPLOY-FLOW.md`
- 只有改到的软件才测试、出版本（登记在 `.github/apps.json`）；测试没过不上线
- Vercel 项目自己的 Git 自动部署已关掉（各 `vercel.json` 的 `git.deploymentEnabled: false` + 2026-11-21 把 KIRA / VISI / SPACE / UKIR 四个 Vercel 项目和 GitHub 的连接断开），**不要再加 `ignoreCommand`**。免费方案没有 Deployment Policy，别再试
- 新增软件：照 `DEPLOY-FLOW.md`「新增一个软件」做
- **2026-11-20 以前开的分支**（还没合 main 的）：推上去不会再自动出预览。先 `git merge origin/main` 把新流程带进来，再推一次就会出
- 推送照样要攒着推：每推一次，改到的软件各用一次 Vercel 额度（一天 100 次）
- **2026-11-21 修了两个坑**：
  - 版本没出成（例：额度用完 `api-deployments-free-per-day`）以前照样显示成功、PR 留言写「undefined」。现在一定亮红灯，留言写「没出成」。合并后还是到 Vercel 看一眼那一版是不是 READY
  - 额度是被旧分支吃掉的：还没合 main 的分支每推一次，Vercel 自己给每个连着的项目各建一版。断开连接后不会了
  - WISH 的 Vercel 项目故意还连着（`genie/` 只在 PR #65 的分支上，靠 Vercel 自己出预览）；PR #65 合了 main 以后再断开

## KIRA（kira/）

- 2026-11-20 合进 main（阶段 1B），正式版 <https://kira-by-riccione-reka.vercel.app> 改成从 main 出；旧的长期分支 `claude/cabinet-measurement-tool-enhance-ymc43k` 不再用
- 体检报告和阶段计划：`docs/checkups/kira-2026-11-19.md`（在 PR #84）。下一个是阶段 2「AI 一键整屋报价」，先 brainstorm
- Supabase 是 KIRA 自己的项目「KIRA BY RICCIONE REKA」，**不是**旧报价工具那个
- 测试：`cd kira && npm test`（2026-11-20 时 303 项）

## VISI（invite/）

- **2026-11-19 体检**：结论和分阶段计划在 `.claude/plans/visi.md`
  - 不放 `invite/PLAN.md`：`invite/` 整个资料夹直接上线，放进去会变成公开网页，合并时还会触发正式版部署
  - 开场白：「读 `.claude/plans/visi.md`，做体检计划第 N 阶段」
  - 第 0 阶段 ①、第 1 阶段、第 2a、2b 阶段 **2026-11-20 做完**（2a = PR #88，2b 接在 2a 后面）；下一步是第 2c 阶段（防冒充：签名链接）
  - 2b 用户定的：上传的照片**默认只给上传时开着的那位客户**（勾「公司共用」才全部客户自动配）；贴别的客户的需求卡**自动另开**；两个分页同时改**提醒并停存**
  - 顺序（2026-11-20 重排）：2a 发给客户的字、名字、号码都对 → 2b 不串图、不丢资料 → 3 图片 → 4 文案 → 5 手机 → 6 更顺手 → 7 让销售用起来（含跟进记录）→ 8 团队共用 → 9 更快 / 离线
  - 用户 2026-11-20 定的：五个系列的设计理念**现在的字就是对的**（来源是溪岸 2025 品牌手册，不是企业手册），不改，英文要审；邀请函把 Setia Alam 说成吉隆坡是**故意的**，不改；照片走「每个空间精选约 20 张放进内置图库」；公司案例库**冻结**
  - 用户的决定（2026-11-19）：先补完体检再动手；手机做轻的（贴卡、看预览、发文案，导出留给电脑）；方案存公司云端**要做**，排后段
  - 用户还决定：新方案**一律双语**；方案不满意的是**图片和文案**（不是版面）
- 用户说：VISI **还没正式给销售用**，四个原因都有：没培训、图库照片不够、销售习惯旧做法、方案还没到他要的样子。销售用电脑和手机
- 线上：Vercel 项目 `visi-riccione-reka`。2026-11-20 正式版已更新到 #74；没设 Supabase 的两个环境变数
  - 补部署：对「最后一个改到 `invite/` 的 commit」开 production 部署；对没改到 `invite/` 的 commit 开会被项目的规则取消
- 本机跑：`cd invite && python3 -m http.server <端口>`，开 `/visi.html`（没有 `/api` 也能用）
  - 测试：`node --test tools/caselib/test/`、`node tools/caselib/test/visi-cases.mjs`（浏览器，只测公司案例库那一段）
  - VISI 规则测试（2026-11-20 起）：`node --test tools/visi/test/*.test.mjs`（`load.mjs` 在 Node 里载入 VISI 的脚本，不用浏览器）
  - `tools/caselib/test/handlers.test.mjs` 在这台机器载入失败（`invite/node_modules` 没装），跟改动无关
  - 浏览器实测：这个环境不让开本机伺服器，用 Playwright 的 `context.route` 直接从磁碟回档案

## 部署备忘（Vercel：全部 app 共用一个免费帐号）

- **一天只能部署 100 次**（2026-11-19 撞到，错误码 `api-deployments-free-per-day`）
  - 每次 push，每个 Vercel 项目都记一次（没改到、被跳过的看起来也算）→ **提交攒在一起再 push**，不要改一点推一次
  - 撞到之后，那天合并进 main 的东西不会上线，之后也不会自己补（#74 很可能就是这样漏掉的）→ 合并后要看正式版是不是真的更新了

## 开发备忘（blueprint/）

- 测试和构建：
  - `cd blueprint && npm test`：Node 跑全部测试（2026-11-16 时 560 项）
  - `npx vite build`：构建
- 浏览器测试（2026-11-21 起）：`npm run test:browser`（`test/browser/showroom.mjs` 展厅播放 + `test/browser/data.mjs` 资料不丢，自己起 Vite、建样例项目）；`SHOTS=<资料夹>` 顺便存截图。上线流程里也跑
  - 这台机器的系统语系不是 UTF-8：Chromium 下载中文文件名会变成「download」，`data.mjs` 启动时指定了 `LANG=C.UTF-8`
  - 自动清图片只清 1 小时以前存的：测试里要先把图片「放旧」（`data.mjs` 的 `ageAllAssets`）
  - **Playwright 预设的临时无痕设定档（`browser.newContext()`）里，从 IndexedDB 读回存起来的资料夹把手会让 Chromium 整个当掉**（SIGTRAP；GitHub 的机器上撞到，本机用没包装的 headless shell 重现）。一般设定档（`launchPersistentContext`）没事，所以 `data.mjs` 用一般设定档；首页也只在按「备份到资料夹」时才读那个把手
  - 本机的 Playwright 浏览器有一层包装，跟 GitHub 机器上的不完全一样：怀疑只在 GitHub 上坏时，用 `executablePath: '/opt/pw-browsers/headless_shell_as_downloaded/chrome-headless-shell'` 重现
  - 上线流程只对「有 `test:browser` 而且自己把 `playwright` 列进依赖」的软件跑浏览器测试。KIRA 也有 `test:browser`，但没列依赖、只手动跑 —— 要接进去得先在 `kira/` 加依赖并确认它在 GitHub 的机器上跑得过
  - Playwright 的 `mouse.wheel` 一律报成「有刻度的一格」，而且数值会除以屏幕缩放倍数；要模拟触控板得自己 `dispatchEvent(new WheelEvent(...))`
  - `waitForFunction` 传 async 函数不会等它的结果，要轮询就在 Node 这边写循环
- 浏览器实测（Playwright，镜像里已经装好）：
  - 先 `npx vite --port 5173`
  - 登录：`localStorage['blueprint.auth.v1']` = `src/store/auth.js` 里的 `AUTH_HASH`，设好后要 `page.reload()`，只换网址的 `#` 部分不会重新载入
  - 样例项目：在页面里 `await import('/src/engine/model.js')`（`newProject`、`assembleDeck`）、`/src/store/assets.js`（`storeBlob`）、`/src/store/db.js`（`saveProject`）建一个
  - 每次 `chromium.launch()` 是全新浏览器，IndexedDB 是空的，要重新建样例项目
  - 展厅播放网址：`#/p/<项目 id>/show`
- 截图里的中文：这台机器只有 `/usr/share/fonts/opentype/unifont/unifont.otf` 能显示
