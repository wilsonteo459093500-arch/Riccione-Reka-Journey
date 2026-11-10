# Plan: KIRA 第二版「橱柜框框画像」（画色块进阶编辑）

## Context
- **为什么做**：第一版已经上线（https://kira-by-riccione-reka.vercel.app，云端登录，顶栏显示已同步）。
  - 现在业务只能靠模板做柜子：先定总宽、门数，再给每格选单元。
  - 遇到不规则的柜子，例如中间开一个开放格、左边上面玻璃下面抽屉，就做不出来，还是要回去找设计师。
- **第二版要做到**：业务在同一个柜子上直接「画框框」：切格子、改类型、改尺寸、每格单独选系列。价钱照样由旧工具的 `computeItem` 算。
- **用户已定的规则**：
  - **入口**：任何柜子都能切到「画框框」。另外加一个「空白柜子」模板，从一个大框开始画。
  - **画过框框后又改模板设定**：先问「会把手画的框框还原成模板，确定吗？」。
  - **每格单独选系列**：同系列合并成一行，不同系列分开列。
  - **底层架空区**：照现在的规则，按总高算。
  - **电脑**：拖着画框。**手机**：点格子，再切一刀。
  - **颜色和名称**：用品牌色。格子名称不变：玻璃柜体区 / 封闭区 / 开放区 / 抽屉区 / 底层架空区。
  - **数据**：直接在现有的切分树上切，不另立一套模型。
- **不能变的**：
  - 旧报价工具和它的网址零改动，只改 `kira/`。
  - 没有单独设系列的柜子，报价**逐行**和现在一模一样。
  - 正式网址要等用户试过预览、说可以，才推上去。

## 1. 数据：存在哪里
- 框框就存在 `cab.frames[].body`。现在就存在这里，载入时也不重算，所以**不用迁移旧资料**。
- 格子（leaf）多一个可选字段 `series: { door?, carcass? }`。没有这个字段就跟柜子的系列。
- 抽屉格一律带 `drawers` 数量。没有数量时价钱算 0 套，图却会画出抽屉。
- 柜子多一个 `custom: true`：在画框框里改过任何东西就设上，还原成模板后清掉。
- **格子怎么认**：用「路径」，也就是从 body 往下数第几个孩子，例如 `"1.0"`。
  - 不给 leaf 加 id。复制柜子时 frame id 会变，路径不受影响。
  - 所有框框资料都在 frame 里面，也不受影响。
- **底层架空区就是 `frame.base`**（kind `raised`），不是新的格子类型。
  - 加成格子类型会算成 0 元，还会拉低同一栏其他格的延米价。
  - 在画框框里点最下面那条，就能改「踢脚 / 柜脚 / 底层架空 / 悬挂 / 无」和高度。
  - 价钱照现在的规则：高度并入最下面那格，按总高算。
  - 改底座高度后，柜身高 = 总高 − 底座。差额由每一栏最高的那格吸收，保证切分加起来刚好等于柜身高。
  - 选悬挂或无时，底座高度一律设成 0（用 `normBase`），因为 `bodyHeight` 不看 kind，照样会减掉 h。

## 2. 纯逻辑：`kira/src/planner/blocks.js`（新）
- 所有函数都**返回新树，不改原物件**。
- 尺寸一律是整数 mm，加起来刚好等于宽或柜身高。
- 吸附 10 mm；每格最小 `MIN_BLOCK = 100` mm。

| 函数 | 用途 |
|---|---|
| `leafBoxes(frame)` | 列出每格 `{path, x, y, w, h, node}`。`model.js` 的 `layoutLeaves` 多传一个 path 参数，旧的调用方式不变 |
| `cutLines(frame)` | 列出分隔线 `{path, k, dir, pos, from, to}`，用来拖线 |
| `splitLeaf(body, path, dir, at?)` | 切一刀，默认对半。父节点是同方向时，直接插进父节点，不多套一层。新格子复制类型和里面；抽屉数按高度比例分，每格至少 1 |
| `carveRect(body, path, rect)` | 电脑拖框：一格里拖出的长方形，最多切 4 刀，变成独立的一格。离格子边 60 mm 以内自动贴齐；不到 100 mm 的边不切 |
| `moveCut(body, path, k, delta)` | 拖分隔线，两边各至少 100 mm |
| `resizeLeaf(body, path, axis, mm)` | 在设定栏打宽或高。差额由右边或上面那格吸收；是最后一格就由前一格吸收 |
| `removeLeaf(body, path)` | 删掉这格，并到旁边那格。只剩一个孩子的切分自动收起 |
| `setLeaf(body, path, patch)` | 改类型、抽屉数、全展/半展、里面、系列。改类型时给默认值：抽屉 = max(1, round(h/200)) 个，厨房全展、其他半展；空位的里面 = appliance |
| `fitBody(body, W, Hb, mode)` | 把尺寸修整到刚好等于 W 和 Hb。底座改高度用 `'tallest'`；空白柜子改尺寸用 `'scale'`（等比例） |

## 3. 计价：每格系列（没设系列时完全不变）
**`bridge.js` 的 `frameQuantities`**
- 每一段带上该格的**实际系列** key。新增 `resolveLeafSeries(cab, node, defaults)`，把 `leaf.series` 叠在 `resolveSeries` 上，规则照旧：
  - 门板 A–K；柜体只有 A–C；开放格跟门板。
- 数量 `q` 按 key 分组累计。
- `pricedH`、`linear`、`Hm` **仍然整个柜体只算一次**，所以分组不会改变延米/平米算法。
- 底座高度跟着最下面那格的系列；转角那段用柜子的系列。
- 合计的 `q` 保留，给其他地方用。

**`frameItems`**
- 每个「部位 + 系列」一条明细。
- 和柜子系列相同的那一组，沿用原来的 id（`…:closed`）。其他组的 id 加后缀 `…:closed@C-A`，`kira` 标签多带 `series`。
- 抽屉套数跟着抽屉格那一组走。
- 「全是开放格」照旧用整个柜体合计判断。见光板照旧跟柜子的门板系列。

**同系列合并、不同系列分开**
- key 用的是实际系列：单独设成 A、柜子本来也是 A，就算同一组。
- 报价单和 Excel 现有的合并规则是「部位 + 单价 + 单位」（`QuotePrint.jsx:187-197`、`exportExcel.js:92-104`），不用改逻辑，刚好显示成「门板 A 2.40㎡」「门板 C 0.60㎡」两行。

**为什么价钱不变**
- 没设系列时只有一组，累计顺序也一样，所以数字逐位相同。
- `computeItem` 对长度是线性的，所以同系列分组再加起来，等于原来的总价。

**一键比价**（柜子 A/B/C、整份报价 A/B/C）
- 只换柜子的系列；单独设过系列的格子保持不变。
- 比价卡下面写一句「有 N 格单独选了系列，不跟着换」。

**「怎么算的」**：部位名照旧，系列已经在描述里。

## 4. 画面：色块立面图可以点
**`elevation.js`**
- `normFrame` 带上 `id`。
- `blocks` 样式的每个色块 rect 加 `hit: 'frameId|path'`，底座条加 `hit: 'frameId|base'`。
- scene 多回传 `frames: [{id, X0, y0, W, Hb}]`，拖拉时用来换算坐标。
- 新选项：`selected` 给选中的格子画金色粗框；`sizes: true` 在格子里多写「600×900」。
- `drawing` 样式的输出不变，现有的 deepEqual 测试会保证。

**`palette.js`**：`BLOCK_COLORS` 加 `raised`（沙色，同现在）；选中色用 `T.gold`。

**`SvgShapes.jsx`**
- 加 `children`、`svgRef` 和 pointer 事件透传。
- shape 上的 `hit` 输出成 `data-block` 属性，给 e2e 测试用。
- 报价单小图、模板卡片也用 SvgShapes，不受影响。

## 5. 新组件：`kira/src/components/planner/BlockEditor.jsx`
**画面位置**：手机在上，电脑在左，显示色块立面图（含尺寸）。
- 厨房、电视柜这种多柜体的，上面有一排选择：「全部 | 地柜 墙A | 吊柜 墙A …」。选一个就只画那一个，放大来改。
- 手机默认选第一个柜体。

**电脑（滑鼠 / 笔）**
- 点一下：选中格子。
- 在格子里拖：画框，有虚线预览和尺寸。放开就切出新格子，类型用上面「画笔」选的那种，默认开放区。
- 拖分隔线：改两边的尺寸，边拖边显示 mm。
- 快捷键：Delete 删格；Ctrl+Z 撤销、Ctrl+Shift+Z 重做；Esc 取消选中。

**手机（手指）**：点格子选中，下面设定栏出现：
- 类型（品牌色）：封闭区 / 开放区 / 玻璃柜体区 / 抽屉区 / 空位（不计价）。
- 「竖切一刀」「横切一刀」：对半切，切完自动选左边或下面那格。
- 宽、高：用 `MeterInput`，打 0.45 或 450 都可以。
- 抽屉数（`Stepper`）和全展/半展。
- 里面：层板 / 挂衣杆 / 空。只影响图，不影响价。
- 系列：「跟柜子（A）」加 A–K 门板；柜体 A/B/C 放在折叠里。
- 「删掉这格」。
- 分隔线用手指也能拖：把手做粗、透明，`touch-action: none`。
- 手指在格子上拖不会画框，免得误画。

**两种设备都有**
- 撤销 / 重做按钮。
- 「还原成模板」按钮，按了会先问。
- 选中底座条时，改底座种类和高度。

**技术做法**
- 照 `MeasureTool.jsx` 的拖拉做法：`setPointerCapture`，拖完存一步撤销。
- 指针换成 mm 用 `svg.getScreenCTM().inverse()`。
- 拖的时候冻结 viewBox；把手大小按屏幕 px 算。
- 手机格子设定栏用 `useBackClose`：按返回键先关设定栏。
- 所有改动都经过 `setCab(c => …)`，所以价钱条、比价、提醒、关闭前问「还没保存」全部照常。

## 6. 接进 `CabinetEditor.jsx`
- 顶部加模式切换：「模板设定 Template | 画框框 Blocks」。
  - Preview 的 mode 提到 CabinetEditor 管。
  - 画框框模式下，手机预览高度从 40vh 加到大约 55vh。
- **画框框模式**：设定栏上半换成格子设定。下面的系列、比价、见光板、颜色、提醒、怎么算的照旧。
- **模板设定模式**：
  - 如果 `cab.custom`，顶部一条提示：「这个柜子的框框是手画的，改下面的设定会还原成模板」。
  - 任何 `setSpec` / `setUnit` 先弹确认：「会把手画的框框还原成模板，确定吗？」。
    - 确定：重算柜子，清掉 `custom`。
    - 取消：什么都不变，`MeterInput` 会自动跳回原值。
  - `KitchenSettings` 和 `TvShoeSettings` 都经过 `setSpec`，所以只要改 CabinetEditor 一个地方。
- 名称、系列、见光板、颜色这些不重算柜子的设定，不用问。

## 7. 空白柜子模板（新）
- **模板**：`templates.js` 加 `blank`（空白柜子 Blank），`spec = {kind:'tall'|'base'|'wall', W, H, D, y, base}`。
- **默认尺寸**：
  - 高柜：1.20 宽 × 到楼高 × 0.60 深，踢脚 100。
  - 地柜：0.85 高、0.60 深。
  - 吊柜：0.75 高、0.35 深、离地 1.50，悬挂。
- **`build(spec, cab)`**：保留现有的框框，按新尺寸用 `fitBody(...,'scale')` 等比例缩放。第一次建时就是一个大封闭区。
  - 空白柜子没有「模板原样」可以还原，所以改尺寸**不问、不还原**。
- **要补齐的接口**：`walls`、`summary`、`frameName`，`TemplatePicker` 就会自动列出来（加一个图示）。
- **设定栏**：新的 `BlankSettings.jsx`，可改柜体种类、尺寸、底座。
- 新建空白柜子直接进画框框模式。
- `templateOf` 遇到不认得的模板，照旧退回衣柜。

## 8. 其他小改
- **`public/sw.js`**：cache 名 `kira-v2` 改成 `kira-v3`，让大家的手机马上换新版。旧版不认得 `leaf.series` 和空白模板，会算错价。
- **新手引导 / 帮助**：加一张「画框框」说明卡。30 秒示范片等第二版上线时重录。
- 所有新文字都中英双语。

## 关键文件
- **新建**：
  - `kira/src/planner/blocks.js`
  - `kira/src/components/planner/BlockEditor.jsx`
  - `kira/src/components/planner/BlankSettings.jsx`
  - `kira/test/blocks.test.mjs`
  - `kira/test/bridge-series.test.mjs`
  - `kira/test/fixtures/items-baseline.json`
- **修改**：
  - `kira/src/planner/`：`bridge.js`、`model.js`、`templates.js`、`explain.js`
  - `kira/src/render/`：`elevation.js`、`palette.js`、`SvgShapes.jsx`
  - `kira/src/components/planner/`：`CabinetEditor.jsx`、`TemplatePicker.jsx`、`Guide.jsx`
  - `QuotationView.jsx`（比价那句提示）
  - `kira/public/sw.js`
  - `kira/test/e2e.browser.mjs`
- **沿用现成的**：
  - `model.js`：`layoutLeaves`、`leaf`、`vsplit`、`hsplit`、`splitEven`、`LEAF_TYPES`、`BASE_KINDS`
  - `templates.js`：`normBase`
  - `bits.jsx`：`MeterInput`、`Stepper`、`Segmented`、`Section`、`Collapse`、`useBackClose`
  - `useConfirm`（`UIProvider.jsx`）
  - `MeasureTool.jsx` 的拖拉写法
  - `BLOCK_COLORS`
  - `validateCabinet`：已经会逐格提醒太窄、抽屉太浅、挂衣不够高

## 步骤（每步 commit）
1. **先存基准**：改 `bridge.js` 之前，用现在的代码产生明细快照，写进 `test/fixtures/items-baseline.json`。
   - 范围：所有模板 × 每种单元 × 底座 × 系列，加上示范报价。
   - 内容：`cabinetItemsFor` 的全部明细，含 id、数量、旗标。
2. 写 `blocks.js` 和它的测试。
3. 改 bridge 做每格系列，加测试。基准快照必须逐项相同。
4. `elevation.js` / `SvgShapes.jsx` 加标记。
5. 写 `BlockEditor`，接进 `CabinetEditor`，加还原提示。
6. 加空白柜子模板。
7. 收尾：
   - 跑 e2e、build。
   - 找一个独立 agent 复查，确认的问题修好。
   - commit + push，出**预览链接**给用户试。
   - 正式网址等用户说可以再推。

## 验证
1. **`cd kira && npm test`**：原有 144 个全过，另加新测试：
   - **快照**：没设系列时，所有明细（id、数量、旗标）和改之前完全一样；示范报价总价一样。
   - **每格系列**：
     - 同系列合并成一行。
     - 不同系列分开列，总数等于逐格相加。
     - 延米柜分组后，延米/平米算法不变。
     - 开放格跟门板，抽屉套数不变。
   - **`blocks.js`**：随机做 500 次切、拖、删之后，检查：
     - 尺寸都是整数，加起来刚好等于宽 / 柜身高。
     - 每格至少 100 mm。
     - 价钱等于直接用同一棵树算出来的价钱。
   - **立面图**：色块带 hit 标记；`drawing` 样式输出不变。
   - **空白柜子**：改尺寸时等比例缩放，不还原。
2. **`npm run build`** 通过。
3. **Playwright**：电脑 1280×800，手机触控 390×844。
   - **电脑**：
     - 空白柜子 → 拖出一个框 → 改成开放区 → 价钱等于预期值。
     - 拖分隔线 → 尺寸改变 → Ctrl+Z 回到原样。
   - **手机**：
     - 衣柜 → 画框框 → 点一格 → 竖切一刀 → 选系列 C。
     - 报价单出现「门板 A」「门板 C」两行，总价对。
   - **还原提示**：改过框框后改总宽 → 出现「会把手画的框框还原成模板」。
     - 按取消：框框还在。
     - 按确定：还原成模板。
   - **返回键**：先关格子设定栏，再问是否保存。
   - 没有浏览器错误。
4. **零影响**：
   - `git diff --stat origin/main -- . ':!kira'` 为空。
   - 正式网址不动，只出预览。

---

## 背景：第一版（已完成，已上线）
- **网址和账号**：
  - KIRA 正式版：https://kira-by-riccione-reka.vercel.app（Vercel 项目 `kira-riccione-reka`，Root = `kira/`）。
  - Supabase 项目 `lsdcepovckusvseeolik`，表 `kira_projects`，已关闭公开注册。用户已能登录，顶栏显示「已同步」。
  - 只有 Production 设了 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`；预览版是本机模式。
- **代码和部署**：
  - 分支 `claude/cabinet-measurement-tool-enhance-ymc43k`，PR #58（draft）。最新 commit f4ca29f。
  - 测试 144/144，浏览器测试 25/25。
  - `kira/vercel.json` 的 ignoreCommand：正式版每次都 build；预览版只在 `kira/` 有改动时才 build。
- **旧工具零改动**：`git diff --stat origin/main -- . ':!kira'` 为空。旧工具从没接过云端，所以「导入旧报价 / 对价报告」显示空的，属于正常。
- **等用户提供或决定**：
  - 色卡照片和名称。
  - 报价单 PDF 要不要印新标志（现在照旧印 SAIL BY RICCIONE REKA）。
  - 给同事开账号（在 Supabase → Authentication → Users，勾 Auto Confirm）。
  - PR #58 要不要合并。
  - 第四版要 Gemini key。

### 价格规则（全部落在 PR #6 的 `computeItem` 上，不改价格表）
| 部位 | 算法 |
|---|---|
| 封门格 | 门板 + 柜体（高 <1m 按延米；≥1m 按平米 L×max(H,D)） |
| 开放格 | 开放柜投影价 宽×高；系列跟门板 |
| 玻璃门 | 门板 × 系数（默认拼框玻璃门 1.5）+ 柜体 |
| 抽屉格 | 门板 + 柜体 + Blum 抽屉 N 套（厨房默认全展，其他默认半展） |
| 踢脚 / 柜脚 / 底层架空 | 按总高算（并入最下面那格） |
| 电器空位（整列空） | 不计价 |
| 露出的侧边 | 见光板 深×高 × 墙板价（系列跟门板） |
| L/U 转角 | 每面墙各量到墙角 |

### 分版路线
| 版本 | 内容 |
|---|---|
| 第一版 ✅ | 旧报价工具全部功能 + 4 种模板积木 + 线稿立面图 + 轻量 3D + 报价单附图 + 导入/对价 + 新手引导 |
| **第二版（本计划）** | 橱柜框框画像：画色块、每格单独选系列、空白柜子。真 3D 拖着转之后再加 |
| 第三版 | 户型图框框：上传户型图、定比例、在图上画柜子框，和积木柜双向同步、通道宽度检查、平面索引图页 |
| 第四版 | 户型图自动分析：用 Gemini 认房间/墙长/门窗，建议摆位，业务逐个接受才进报价 |
