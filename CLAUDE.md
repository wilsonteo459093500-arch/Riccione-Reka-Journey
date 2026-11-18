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

## FoloToy（network/folotoy/，PR #81 未合并，2026-11-18）

- 已做：
  - 木纹封面 → 名片二维码
  - 口袋机菜单 16 项：蜡烛生日歌（吹气熄）、木鱼、手电筒、计时器、倒数、番茄钟、叠叠乐、落落方块、记忆三色、求签、抽奖、解压（泡泡纸、狂按挑战、捏捏乐）
  - 阶段 A（2026-11-18）做完：落落方块 + 三个解压游戏都做了；游戏画面会收到按下 / 放开（main.c）；截图 `firmware/pocket3-screens.png`
  - 车用遥控器（BLE 媒体键）
  - SPACE 车控 Android app v0.1（`android/`：按住下开微信读书、按住确定选朋友打 WhatsApp）
- 用户真机测过：名片、车用遥控器（YouTube / 语音助理 OK）。口袋机、app 还没回报
- 待用户给：求签签文审核、抽奖真奖项、微信读书「抓画面结构」
- 下一步（用户要省 token、分阶段）：
  - ~~**A** 落落方块 + 解压游戏~~ 已做（不用俄罗斯方块 / Tetris 名字）；等用户真机试按键手感
  - **B** 手机找 FoloToy（蓝牙常开取舍待定）
  - **C** DEKU 句库：笑话 + 稻盛和夫 / 郭鹤年 / Musk 原话附出处，用户审过才放；对它说话用关键词，不用 AI
  - **D** Wi-Fi：星座、新闻（Grok 邮件）、读书
- 怎么做：
  - 照 `network/folotoy/README.md`、`network/PLAN.md`
  - 编译：`build.sh`；截图：`sim/run.sh`；app：`android/build.sh`
  - 新画面照 `games_screen.c` / `pocket_model.c` 的写法；格子多的画面用一个物件的 draw 事件画（落落方块、泡泡纸），不要开几百个物件
  - 这台容器 Docker 要先 `sudo dockerd &` 才能 `build.sh`
- 编 Android 要 `dl.google.com`：已建个人环境 riccione-reka-journey
- Vercel 免费方案一天 100 次部署，推太多会被挡（不是程序问题）

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
