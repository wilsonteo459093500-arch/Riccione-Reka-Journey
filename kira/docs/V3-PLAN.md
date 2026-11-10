# Plan: KIRA 第三版「户型图框框」

## Context
- 第二版已上线（画框框、飘板、高柜内侧见光板）。业务现在能把柜子做出来，但看不到柜子放在屋子哪里，也没法检查走道够不够宽。
- 第三版：上传户型图 → 定比例 → 在图上画柜子框 → 跟积木柜双向同步 → 走道宽度检查 → 报价单多一页「平面索引图」。
- 用户已定：
  - 图片放 **Supabase Storage**（报价里只存链接）。
  - 支持 **JPG / PNG 照片截图 + PDF**。
  - **每份报价可以有多张户型图**（例：楼下 / 楼上）。
  - 在图上画框后，**先问选哪个模板**，尺寸带过去，之后两边都能改。
- 不能变：旧报价工具和它的网址零改动，只改 `kira/`；没放到户型图上的柜子，报价逐行和现在一样；先出预览，用户说可以才推正式网址。

## 0. 先收尾：PDF 印 SAIL 标志（用户更正：对客户一律用 SAIL BY RICCIONE REKA，KIRA 只是内部用）
- 撤回刚才未 commit 的「KIRA BY RICCIONE REKA」改动：`QuotePrint.jsx`、`exportExcel.js`、`textQuote.js` 的文字全部回到 SAIL（`git checkout` 这三个文件）。
- 三张正式标志仓库里都有，**复制**到 `kira/public/brand/`（缩到约 600 px 宽；`invite/`、`blueprint/` 不动）：
  | 报价单页 | 现在的文字标题 | 换成 |
  |---|---|---|
  | 封面 / 汇总页 | RICCIONE | `blueprint/public/template/b/riccione-logo-ink.png`（RICCIONE®，墨色）→ `riccione-logo.png` |
  | 定制橱柜 | SAIL BY RICCIONE REKA | `invite/assets/img/brand/logo-ink.png`（sAil 溪岸 by Riccione Reka）→ `sail-logo.png` |
  | Loose Furniture | RICCIONE FURNITURE | `invite/assets/img/brand/riccione.png`（RICCIONE FURNITURE 橙黑）→ `riccione-furniture-logo.png` |
- `QuotePrint.jsx` 的 `Head`：多一个 `logo` 参数，有就印图（高约 40 px，`alt` = 原来的品牌文字），没有就照旧印文字。Excel / WhatsApp 是纯文字，照旧写 SAIL BY RICCIONE REKA / RICCIONE FURNITURE。
- `public/sw.js` 的预先缓存加这三张图（离线也印得出标志）。
- 长图（html-to-image）：同源图片，截图前先等图片载入；e2e 检查长图里有标志、EN 报价单文字照样不夹中文（标志是图片，不算文字）。
- 测试、build 通过 → commit → 推预览分支 `ccr-757ae046-u62dz3` 给用户看。

## 1. 数据
- 记录多一个 `plans: Plan[]`（旧记录没有 = 空，`sync.js cleanRecord` 补成 `[]`，不改 schema 版本）。
  - `Plan = { id, name:'楼下 Ground', image:{ path, w, h, kind:'img'|'pdf', page }, scale:{ a:[x,y], b:[x,y], mm } | null, walls?:[] }`
  - 比例：用户点两个点、打真实长度 → `mmPerPx = mm / 距离(px)`。没定比例前不能画柜子。
- 柜子多一个可选 `place: { planId, x, y, rot }`（mm，户型图坐标；rot 0/90/180/270）。
  - 柜子在图上的样子 = 用现成的 `cabinetWalls(cab)`（`planner/templates.js`）+ 每个 frame 的 `x / W / D`，算俯视外框（厨房 L/U 一样能画）。新函数放 `planner/plan.js`：`cabinetFootprint(cab)` → 多边形，`placeOnPlan(poly, place)`。
- 价钱不看 `place`，所以放不放到图上都不影响报价。

## 2. 图片存储（Supabase Storage）
- 新 SQL `kira/supabase/kira_plans_storage.sql`（可重复执行）：建私有 bucket `kira-plans`；登录同事可读、可上传；只有上传的人能删。用户在 Supabase SQL Editor 执行一次。
- `services/planImages.js`：
  - 上传前压缩：长边 ≤ 3000 px、JPEG 0.85，户型线条还看得清。
  - PDF：用 `pdfjs-dist` 在浏览器把选的那一页渲成图片再上传（只在打开 PDF 时动态载入，平常不加重）。
  - 读：signed URL；手机端用 Cache API 存一份，离线也能看。
  - 预览版 / 本机模式（没设 Supabase）：图片存 IndexedDB，路径 `local:…`；登录后自动补传（同报价的待同步规则）。
- 删除户型图：先删报价里的引用，再删图片；云端删失败就排队重试（沿用 `sync.js` 的 tombstone 写法）。

## 3. 画面：报价编辑页多一个「户型图 Floor plan」区
- 位置：每份报价的设计页最上面一块（手机：「设计」tab 最上面，可收起）。新组件 `components/plan/PlanBoard.jsx`。
- 流程：
  1. **上传**（照片 / PDF；PDF 多页先选页）→ 给户型图取名。
  2. **定比例**：点两点（例：一道墙两端）→ 打长度（米，可打 2700）。
  3. **画柜子**：电脑拖框、手机点两下（起点 / 终点），沿墙方向；画完弹出选模板（同 `TemplatePicker`），宽 = 框长、深 = 框深，房间 = 当前选的房间。之后打开 `CabinetEditor`。
  4. **已有的柜子**：在列表里按「放到图上」→ 点位置、可转 90°。
  5. **双向同步**：
     - 在图上拖柜子边 → 改 `spec.W` / `spec.D`（走第二版的 `updateSpecKeep`，手画框框照样保留）。
     - 在柜子编辑器改尺寸 → 图上的框跟着变（外框每次由 `cabinetFootprint` 算，不另存尺寸）。
- 画法：SVG（同 `SvgShapes` 写法）；底图 `<image>`，柜子用第二版的色块颜色、标 K1/K2；拖拉沿用 `BlockEditor.jsx` 的 pointer 写法（`setPointerCapture`、`getScreenCTM().inverse()`、撤销 / 重做）。
- 缩放 / 平移：两指缩放、滑鼠滚轮；手机返回键先关户型图全屏（`useBackClose`）。

## 4. 走道宽度检查
- `planner/plan.js` 的 `aisleWarnings(plan, cabinets)`：同一张图上，两个柜子正面相对时，量正面之间的距离。
  - 厨房 < 900 提醒「走道太窄」，900–1000 提示「偏窄」；衣柜前 < 600（开门）提醒。数字放在一个常数表，以后好调（依据 `interior-design-expert` skill 的数值）。
  - 柜子互相重叠也提醒。
- 显示：图上两柜之间画红色量线 + 数字；柜子编辑器的「提醒」区也列出来。只提醒，不挡出价。

## 5. 报价单「平面索引图」页
- `QuotePrint.jsx`：有户型图的报价，在定制橱柜明细前加一页（每张户型图一页）：底图 + 柜子外框 + K1/K2 编号 + 图例（编号 → 柜名、房间）。
- 长图（`utils/longImage.js`）、打印 / PDF 都要出得来；图片用 data URL 先载入，避免截图时还没下载完。Excel / WhatsApp 不加图，只在柜名旁加「见平面图」。
- 输出语言规则照旧（EN 报价不夹中文）。

## 关键文件
- 新建：`kira/src/planner/plan.js`、`kira/src/services/planImages.js`、`kira/src/components/plan/PlanBoard.jsx`、`kira/supabase/kira_plans_storage.sql`、`kira/test/plan.test.mjs`、`kira/docs/V3-PLAN.md`（这份计划）
- 修改：`components/quote/QuotationView.jsx`（放 PlanBoard、放柜子）、`QuotePrint.jsx`（索引图页）、`components/quote/sync.js`（`plans` 清洗 + 图片待上传）、`planner/validate.js`（接走道提醒）、`package.json`（`pdfjs-dist`，固定版本）、`public/sw.js`（cache → `kira-v4`）、`test/e2e.browser.mjs`、`kira/DEPLOY.md`（Storage 设定步骤）
- 沿用：`cabinetWalls`、`updateSpecKeep`、`TemplatePicker`、`CabinetEditor`、`BlockEditor` 的拖拉写法、`useBackClose`、`MeterInput`、`sync.js` 的待同步规则、`axo.js` 的 `wallToWorld`

## 这个对话只做到这里（省 token）
- commit PDF 的 SAIL 标志（第 0 节）+ 把这份计划存成 `kira/docs/V3-PLAN.md`（含第二版上线方式：合并后要用正式版设定重新构建），推预览分支 `ccr-757ae046-u62dz3`，给用户预览链接看新标志。
- 第三版本身在**新对话**做：开新对话时说「照 `kira/docs/V3-PLAN.md` 做第三版，分支 `ccr-757ae046-u62dz3`（或新开一个），只改 kira/，先出预览」。

## 步骤（新对话里做，每步 commit，推预览分支）
1. （本对话已做）PDF 印 SAIL 标志 commit + 推预览（第 0 节）。
2. `plan.js` 纯逻辑：比例、柜子俯视外框、放置 / 旋转、拖边改尺寸、走道检查 + 测试。
3. 存储：SQL 脚本、`planImages.js`（压缩、PDF 渲页、IndexedDB 本机模式、离线缓存）、`sync.js` 加 `plans`。
4. `PlanBoard`：上传 → 定比例 → 画框选模板 → 放已有柜子 → 双向同步 → 走道提示。
5. 报价单平面索引图页 + 长图。
6. 收尾：sw `kira-v4`、引导卡、e2e、build、找 1 个独立 agent 复查、推预览给用户试；用户说可以 → 合并 → 用正式版设定重新构建上线（同第二版的做法）。

## 验证
- `npm test`：原有 180 个全过 + 新测试：
  - 比例换算、柜子外框（单柜、厨房 L/U、转角）、旋转后位置。
  - 图上拖边 → `spec.W` 改了、手画框框保留；编辑器改尺寸 → 外框跟着变。
  - 走道：两柜相对 800 / 950 / 1200 的提醒等级；重叠提醒。
  - 没放到图上的柜子：报价明细和现在逐项相同（第二版基准快照照跑）。
  - `cleanRecord`：旧记录没有 `plans` 也正常。
- `npm run build` 通过。
- Playwright（电脑 1280×800、手机触控 390×844）：上传示范户型图 PNG → 定比例 2.70 m → 画 2.4 m 柜子 → 选衣柜 → 编辑器总宽 2.40 → 图上拖到 3.0 m → 编辑器显示 3.00；放第二个柜子正对、相距 0.8 m → 出现走道提醒；报价单有平面索引图页、长图有图；PDF 上传选第 2 页；返回键先关户型图全屏；没有浏览器错误。
- 正式网址：用户在 Supabase 执行 Storage SQL 后，在预览版（本机模式）和正式版（云端）各试一次上传。

## 色卡照片（不在本计划里，回覆用户怎么传）
- 180 张建议：每张照片的文件名 = 色号 + 名称（例：`W012 暖白 Warm White.jpg`），另附一张清单（Excel：色号、名称、门板 / 柜体能不能用、属于哪个系列）。
- 传法：GitHub 网页上传到仓库新文件夹（一次最多 100 个文件，分两次），或打包成 zip（网页上传单个文件 ≤ 25 MB）。收到后我压缩成小图放进 KIRA 的颜色选项，替换现在的 6 个占位色。

---

## 背景：第二版怎么上线的（第三版上线时照做）
- 正式网址 https://kira-by-riccione-reka.vercel.app（Vercel 项目 `kira-riccione-reka`，Root = `kira/`）的正式版是从分支 `claude/cabinet-measurement-tool-enhance-ymc43k` 构建的。
- **合并到这个分支不会自动更新正式网址**（只会出一个预览版）。上线做法：PR 合并后，用 Vercel 把「现在的正式部署」重新部署、带上最新 commit、target = production（`create_deployment`：`deploymentId` = 当前正式部署、`withLatestCommit: true`、`target: 'production'`）。这样会用正式版的 Supabase 设定重新构建；**不要**直接 promote 预览版（预览版没有 Supabase 设定，会变成本机模式）。
- 上线后检查：正式网址的 `/sw.js` 是新 cache 名；请用户确认顶栏「已同步」、旧报价都在。
- 预览分支：`ccr-757ae046-u62dz3`（固定预览网址 https://kira-riccione-reka-git-dc9a46-wilsonteo459093500-3777s-projects.vercel.app）。
- 第二版完成状态：测试 180/180、浏览器 39/39；报价单印正式标志（RICCIONE® / sAil 溪岸 / RICCIONE FURNITURE，`public/brand/`）。对客户一律用 SAIL BY RICCIONE REKA，KIRA 只是内部名称。
