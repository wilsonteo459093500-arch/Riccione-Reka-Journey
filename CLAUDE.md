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

## FoloToy（network/folotoy/，PR #81 未合并，2026-11-19）

- 已做：
  - 像素封面（2026-11-19：整片像素夜空 + 原创像素星星 S.T.A.R，**不放公司字标**；原本木纹太沉闷）→ 名片二维码
  - 口袋机菜单 16 项：蜡烛生日歌（吹气熄）、木鱼、手电筒、计时器、倒数、番茄钟、叠叠乐、落落方块、记忆三色、求签、抽奖、解压（泡泡纸、狂按挑战、捏捏乐）
  - 阶段 A（2026-11-18）做完：落落方块 + 三个解压游戏都做了；游戏画面会收到按下 / 放开（main.c）；截图 `firmware/pocket3-screens.png`
  - 阶段 B（2026-11-18）做完：手机找 FoloToy（每个模式都开蓝牙）；app v0.2
  - 阶段 C（2026-11-18）做完：小助理（73 句审过）；2026-11-19 改名 **S.T.A.R**、换成原创像素星星（程序里还叫 deku_*）；app v0.5；截图 `firmware/deku-screens.png`、`firmware/cover.png`
  - 阶段 D（2026-11-19）做完：每日晨报（Gmail → app → 蓝牙 → FoloToy）；app v0.6；截图 `firmware/news-screens.png`
  - **角色不照抄**：用户给过 Pac-Man、Mario 星星、Luma 当参考，都是游戏公司角色，不能用在名片设备上；照参考的感觉画原创的（`tools/star_art.py`）
  - 车用遥控器（BLE 媒体键）
  - SPACE 车控 Android app v0.1（`android/`：按住下开微信读书、按住确定选朋友打 WhatsApp）
- 用户真机测过：名片、车用遥控器（YouTube / 语音助理 OK）。口袋机、app、找 FoloToy、DEKU、晨报还没回报（用户 2026-11-18：暂时没机会试，先往下做）
- 待用户给：求签签文审核、抽奖真奖项、微信读书「抓画面结构」
- 下一步（用户要省 token、分阶段）：
  - ~~**A** 落落方块 + 解压游戏~~ 已做（不用俄罗斯方块 / Tetris 名字）；等用户真机试按键手感
  - ~~**B** 手机找 FoloToy~~ 已做（2026-11-18，等用户真机试）：
    - 用户选：车用模式照旧常开蓝牙；名片 / 口袋机**低频广播**（约每秒一次）、只认配对过的手机（新手机要在车用模式配对）
    - app v0.2 按「让 FoloToy 响」→ 嘀嘀响 + 红白闪 + 信号格；「最后在哪里」（断线时间 + 手机位置）、「忘了带提醒」（断线 45 秒，可关）
    - 不做：反过来找手机
    - 截图 `firmware/find-screens.png`；做法见 README「手机找 FoloToy」、PLAN「阶段 B」
  - ~~**C** DEKU~~ 已做（2026-11-18）；句库用户审过 73 句全部「要」，已放进韧体 + app v0.4：
    - 用户选：口袋机菜单「DEKU 讲笑话」；名人原话 Claude 起草 + 出处、用户打勾；笑话：冷笑话谐音 / 马来西亚日常 / 家具装修
    - 审核网页 https://claude.ai/artifact/4DcXNNxeknMGqygntM4W6V，用户贴回「要：J01 … 不要：…」
    - 以后加句子：`lines.json` 加 draft → `tools/make_deku_review.py` 重发审核网页 → 用户贴回 → 改 status → `python3 tools/make_deku.py` → `tools/make_font.py`（不要接 `| head`，会写一半）→ `build.sh`、`android/build.sh`（版本号 +1）→ sim 截图
    - FoloToy 断行用 `deku_wrap()`（标点不放行首）；出处太长在人名后换行（make_deku.py `rough_width`）
    - 郭鹤年只有二手报道（界面新闻；jiemian.com 这个环境连不上），提醒用户对《郭鹤年自传》
  - ~~**D** 每日晨报~~ 已做（2026-11-19，app v0.6，等用户真机试）：
    - 用户选：经手机 app、不用 Wi-Fi；Gmail 应用程序密码（IMAP，只读）；显示**三件事 + 九栏全部**（+ 信里「对你的生意」5 点）；列表只放标题、确定看摘要；**按住确定手机念**；自动（7:00 后、每 30 分钟查到拿到今天的）+ app「存好，现在更新」
    - 晨报信：每天约 7:00 从用户 Gmail 寄给自己，主题「每日晨报 DAILY MORNING BRIEF · 日期」；全文只在 HTML；样本 `android/app/src/test/resources/brief-2026-11-18.html`（编辑说明内文已删）；「对你的生意」框夹在第四、第五栏中间；标题可能有 `<span>【家具】</span>` 徽章
    - app 只搜主题有「DAILY MORNING BRIEF」的信（旧格式「每日晨报 · 2026年11月10日」不认）
    - 格式 / 封包见 `main/news_model.h`；样本 `brief-sample.txt` 由 app 测试产生，FoloToy host 测试、sim 读同一份（改了 Brief.kt 要更新它）
    - 字型 `font_news_20.c`（GB2312 + 峇等，约 7,450 字）编译时产生、不进仓库；`NEWS_EXTRA`（make_font.py）加字 → 重跑 make_font.py（更新 `assets/news_chars.txt`）
    - 分区表换成 `partitions_space.csv`（app 让出最后 256KB）：用户第一次要烧整份 `SPACE-card-full.bin`
    - 这个开发环境连不上 imap.gmail.com：Gmail 只用模拟回应测过，真的登入要用户试
    - 截图 `firmware/news-screens.png`
  - 之后：星座、读书（还没问用户）
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
