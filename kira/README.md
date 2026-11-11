# KIRA by RICCIONE REKA · 柜子规划报价

让没有设计背景的业务 5 分钟出橱柜报价：选模板 → 打总宽 → 自动分门、画立面图和 3D 小图 → 出报价单（PDF / 长图 / WhatsApp）。

- **独立 app**：自己的目录 `kira/`、自己的 Vercel 项目和网址。旧报价工具（PR #6，`quote.html`）一行都没改，照常可用。
- **价格**：从旧报价工具原样复制 `src/constants/pricing.js`（门板 / 柜体 / 开放柜系列价、延米 vs 平米、抽屉、系数、岩板不折扣、设计师版）。以后**只在 KIRA 改价**。复制来源与指纹记在 `VENDOR.json`。
- **数据**：本机先存（`kira.records.v1`，离线也能报价）；配置 Supabase 后和旧工具**同一套登录**，资料在新表 `kira_projects`（全员共享，只有做的人能删）。旧表 `quotes` 只读（导入旧报价用）。
- **同步**（`src/components/quote/sync.js`，Node 测试 `test/sync.test.mjs`）：每条记录比 `updatedAt`——本机有没上云的改动且比云端新才上传，否则以云端为准；上线 / 回到前台 / 实时重连都先拉云端再推；离线删除记成 tombstone，有网重试；本机模式做的报价第一次登录时自动上传；不替别人上传；退出登录先推、再清本机；两个标签页（tab）互相合并；本机空间满会提示（没上云的一定保住）；离线 / 登录过期也能用本机资料打开。

## 第一版有什么

| 功能 | 说明 |
|---|---|
| 4 种模板积木 | 衣柜 · 厨房（一字 / L / U / 二字 + 电器高柜）· 电视柜 / 展示柜 · 鞋柜 / 玄关柜 |
| 积木规则 | 先定总宽 → 每扇门最宽 600 自动平分（可 +/−）→ 每格点单元；默认尺寸照用户定的（地柜 850×600、吊柜 750 离地 1500 深 350、衣柜深 600 顶柜 500、电视低柜 400×400 离地 250、鞋柜深 350 架空 150…） |
| 价格 | 全部换算成旧工具的标准明细，由旧工具的 computeItem / computeQuote 算钱：封门 = 门板 + 柜体；开放格 = 投影价（系列跟门板）；玻璃门 = 门板 × 系数表（默认 1.5）+ 柜体；抽屉 = Blum 套数（厨房全展、其他半展）；踢脚 / 柜脚 / 底层架空按总高；电器空位不计；露出侧边加见光板；L/U 每面墙各量到墙角 |
| 图 | 线稿立面图（含挂衣杆 / 层板 / 水槽 / 炉灶示意）+ 轻量 3D（左右转 ±45°），报价单每个柜子明细旁边印小图 |
| 比价 | 单个柜子 A / B / C 并排；整份报价 A / B / C 总价并排；整份报价默认系列、柜子可改 |
| 输出 | PDF（品牌照旧 SAIL BY RICCIONE REKA）· 一张长图 · WhatsApp 一键打开客户对话 · Excel · 设计师双价 / 净价版 |
| 旧报价 | 从旧工具云端只读导入接着改；「对价报告」把旧柜体行换成积木柜重算，差异必须为 0 |
| 新人 | 第一次打开有引导 · 示范报价 · 每格小提示 · 30 秒短视频（`npm run demo:video` 生成 public/help/kira-demo.webm） |
| 手机 | 底部 3 tab（客户 / 设计 / 报价）· 编辑器上图下设定 · 底部常驻价钱条 · 离线可用 · 可加到主屏幕 |

## 开发

```bash
cd kira
npm install
npm run dev           # http://localhost:5181
npm test              # 价格黄金值 / 积木换算 / 模板 / 对价 / 立面 / 3D / 同步 的 Node 测试
npm run test:browser  # 浏览器端到端（先 npm run build && npm run preview）
npm run build         # 产物在 dist/
npm run check:vendor  # 检查从旧工具复制来的文件有没有被改
```

## 有意改价格表时

1. 改 `src/constants/pricing.js`
2. 更新 `test/pricing.test.mjs` 里的黄金值
3. `npm run check:vendor -- --accept`（把新指纹记进 `VENDOR.json`）

## 结构

```
src/constants/pricing.js     价格表（来自旧工具）
src/components/quote/        报价界面（来自旧工具，加了 KIRA 的挂钩）
src/planner/model.js         积木柜数据模型（mm；柜身切分树）
src/planner/templates.js     衣柜模板 + 模板登记（kitchen.js / tvshoe.js）
src/planner/bridge.js        积木柜 → 旧工具标准明细（价格规则都在这里）
src/planner/importOld.js     导入旧报价 + 对价报告
src/render/                  线稿立面图 elevation.js · 轻量 3D axo.js（纯数据 → SvgShapes.jsx 画）
src/components/planner/      加柜子 / 编辑器 / 柜子卡片 / 导入 / 新人引导
src/planner/plan.js          第三版户型图纯逻辑：比例、柜子俯视外框、放置 / 旋转、图上拖边改尺寸、走道检查
src/components/plan/         户型图 PlanBoard（上传 / 定比例 / 画框 / 放柜子）· 报价单平面索引图 PlanFigure
src/services/planImages.js   户型图图片：压缩、PDF 渲页、Supabase Storage / 本机 IndexedDB
supabase/kira_plans_storage.sql  户型图图片的 Storage 设定（可重复执行）
api/plan-ai.js               户型图 AI 识图（Vercel function；钥匙在服务器；正式版要登录、预览要团队密码）
src/planner/planAi.js        AI 读图结果 → 建议柜子（长度对齐、方向、厨房 L / U / 二字）→ 勾选后加入报价
src/planner/wallSnap.js      AI 的墙线贴到图上真正的墙（深色带、朝房间那一面、角落 / 门口截断）+ 自动去黑边 / 白边
src/services/planAi.js       浏览器去边 / 框选、缩图、带身份、调 /api/plan-ai
src/services/kiraRepo.js     云端（kira_projects；旧 quotes 只读；分页读完，不受 1000 行上限）
src/components/quote/sync.js 本机 ↔ 云端合并 / 待同步 / 待删除 / 标签页合并 / 本机容量（纯函数）
src/components/auth/AuthGate.jsx  登录；离线 / token 过期时用本机登录记录打开（不卡在登录页）
src/components/ui/ErrorBoundary.jsx  出错兜底（不白屏，提示重新载入）
supabase/kira_projects.sql   建表脚本（可重复执行）
public/sw.js                 离线（KIRA 自己的网址，和旧工具的 SW 无关；只把 200 的 HTML 存成离线首页）
```

部署见 [DEPLOY.md](./DEPLOY.md)。
