# UKIR STUDIO · 架构说明

> 设计师把自己的方案 PDF（WPS / PowerPoint 导出）丢进来 → 自动生成「Dreamhouse Blueprint」品牌提案 PPT（可编辑）。
> 版式 B「格物」：公司封面 / 品牌 / 公司 / 服务页是品牌画册，方案页满版大图与图文页穿插，方案章节封面用 Material Board；
> 华文 / English / 中英三种语言；全部在浏览器本机完成。
> Material Board 也能单独用（首页 → `#/boards`），接替旧版 UKIR STUDIO（`/render`）的同名功能。

## 数据流

```
PDF ──import/pdfExtract.js──▶ rawPages（文字行 + 图片框（按裁切 / 旋转后的样子）+ 缩略图）
        ──import/analyze.js──▶ analysis（楼层 / 空间 / 视角 / 材料，纯函数，可在 Node 测）
        ──import/importPdf.js──▶ Project（engine/model.js，图片存进 IndexedDB → 'asset:<id>'）
Project ──engine/deck.js renderDeck()──▶ 渲染页 [{ bg, els }]（engine/spec.js 元素规格）
        ├─ components/SlideCanvas.jsx  网页预览（所见即所得）
        └─ engine/pptx/writer.js       导出 .pptx（真文本框 / 真图片，可在 PPT 里改）
```

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/theme.js` | 设计系统：画布 1920×1080、颜色（B 纸色 / 墨色 / 灰 / 细线）、字体角色（思源黑体 Light + Hanken Grotesk；英文大标题 Ysabeau Office）、字体下载链接 |
| `src/engine/model.js` | **数据模型契约**（Project / Slide 结构说明 + 工厂函数）——所有模块都按它读写 |
| `src/engine/spec.js` | 元素规格（rect / img / text）+ 文字宽度估算 + 图片裁切计算 |
| `src/engine/b/kit.js` | B「格物」版式工具：12 栏网格、字级（中 / 英）、固定行高的文字块、中英并排 / 上下对照、照片裁切、属性列表 |
| `src/engine/b/design.js` | 方案页：方案封面、楼层章节页、满版大图 / 图文效果图页、本案材料、本案团队；`planViews` 整套排版计划 |
| `src/engine/b/company.js` | 公司页 = 品牌画册（19 页）：栏位文字（中 / 英默认稿）、照片位、`renderCompanyB` / `companyFieldsB`；`deckChapters`（隐藏了章节时目录与「第几章」重排） |
| `src/engine/b/text.js` | 均衡断行（方案页、公司页的大标题 / 名称共用）：折成两三行时各行长短接近，不留落单的一个词 |
| `src/engine/metrics.js` | 三种字体的实测字宽（估算换行用） |
| `src/engine/lang.js` · `glossary.js` | 提案语言（华文 / English / 中英）、翻译记忆、词典自动英文、缺英文提醒 |
| `src/engine/deck.js` | `renderDeck(project, { meta })` → 渲染页（每页的提醒、缺英文清单） |
| `src/engine/pptx/` | `buildPptx(slides, { loadImage })` → .pptx（JSZip，浏览器 / Node 通用） |
| `src/store/db.js` | IndexedDB：projects / assets |
| `src/store/assets.js` | `'asset:<id>'` ↔ Blob / object URL / 尺寸；`storeBlob`、`preloadProjectAssets`、`resolveUrl`、`metaOf`、`loadForPptx`、`toInlineImage` |
| `src/ai/` | Gemini 客户端（`gemini.js`）、设置（`settings.js`）、标题润色（`polish.js`）、AI 翻译（`translate.js`）、3D 全屋立体图（`dollhouse.js`） |
| `src/import/` | PDF 解析：`pdfExtract.js`（pdf.js）、`analyze.js`（纯函数）、`labels.js`（词典与文字解析）、`importPdf.js`（编排） |
| `src/moodboard/` | Material Board（移植自旧版 UKIR STUDIO，只保留 material board 功能）；`migrate.js` = 同网址时把旧版材质库 / 画板搬过来 |
| `src/components/` | 界面：首页 / 编辑器 / 检查器 / 材料清单 / 导出 / 设置 / 独立画板（`BoardsPage.jsx`） |
| `src/lib/` | 编辑器状态（`useProjectState.js`：撤销重做、带版本号的自动保存）、项目备份（`bundle.js`，含画板）、复制 / 删除项目 |
| `public/template/` | 公司页照片（`b/` = 品牌画册的照片、深色 logo、Instagram 二维码） |
| `test/` | `npm test`：纯函数与导出结构测试（Node，无需浏览器） |

## 模块间约定（接口）

- **改项目**：编辑器持有 `project` state，子组件拿到 `onChange(updater, { history?, coalesce? })`，`updater = (project) => newProject`（不可变更新）。
  AI 生成的结果（立体图、平面图）用 `history: false`，不进撤销历史。
- **保存**：`saveProject(project, expectedRev)` 带版本号，库里版本不同 / 已删除 → `ProjectConflictError`（不覆盖）；编辑器暂停保存并提示刷新。
- **文字放不下**：B 版式不缩字号 —— 文字块按实测字宽算好行数和固定行高（`b/kit.js block()`），放不下就换一种排法或截短，并在页面上提醒设计师。
- **提醒 → 一键修复**：页面提醒是中文句子，`fixForWarning(text, { key })`（`components/editor/ops.js`）认出该跳到哪一栏 / 做什么；
  公司页的提醒写的是栏位名（「说明 · 品牌」「正文（英文）」），要传这一页用的公司页 `key` 才对得上栏位。
- **旧项目**：打开时 `upgradeProject`（`lib/project.js`）升级到 B：效果图版式交还自动排版、旧版选的楼层图抄到楼层页、
  公司页按旧模板元素序号的改写（数字键）意思一样的搬到新栏位；搬不过来的留在数据里，页面上提醒，设计师点「知道了」清掉。
- **语言**：`project.info.lang` = 'zh' | 'en' | 'bi'；英文来自翻译记忆 `project.translations[中文]`（整套共用）与词典；公司页的英文在 `slide.overridesEn[栏位]`。
- **存图**：`storeBlob(blob, { projectId })` → `'asset:<id>'`；同步读：`resolveUrl(src)`（预览）、`metaOf(src)`（尺寸）。
- **提示**：`notify({ type: 'ok' | 'warn' | 'error', text })`。
- **AI 设置**：`settings`（`ai/settings.js`）；没 key 时调用 `onOpenSettings()`。
- `importPdfFile(file, { onProgress(stage, done, total) })` → `Project`（已存好全部图片、已排好整套页面）。
- `<MoodBoard project settings notify onOpenSettings onUseAsCover={async (blob, meta) => …} />`
  —— `meta = { source: 'board' | 'flatlay' | 'upload', orientation: 'portrait' | 'landscape' | 'square' }`；
  MoodBoard 会 await 它并自己弹成功 / 失败提示（壳层出错直接抛）。封面上 Board 整张放在右侧，任何比例都不裁。
  画板存在独立的 IndexedDB，删项目时要一起调 `removeBoardsOf(projectId)`（`src/moodboard/store.js`）。
- `<DollhousePanel project settings notify onOpenSettings onChange />` —— 立体图页 = `kind: 'view', tag: '3d', layout: 'full'`，
  插在该层章节页之后；不进楼层空间清单、不参与 AI 润色。
- `<PolishDialog project settings notify onOpenSettings onApply onClose onlySlideIds? />` —— 内部跑
  `polishProject(project, settings, { onProgress, onlySlideIds })` → `[{ slideId, before, patch }]`（只给建议），
  设计师勾选后 `onApply(patches)`，编辑器用 `applyPolishPatches(project, patches)` 套用（只改 subtitle / roomEn / notes，材料永远不动）。

## 设计原则

1. **所见即所得**：预览与导出共用一份元素规格；不要在任一端单独「微调」。
2. **一套版式规则**：网格、字级、颜色只在 `engine/b/kit.js` 定义；页面只用它来拼。照片不压暗、图上不放字；没有页码、页脚和装饰线。
3. **AI 只是加分项**：没有 API key 也能完整走完「上传 → 编辑 → 导出」；AI 功能（润色 / Material Board 实拍 / 3D 立体图）按需使用。
4. **数据在本机**：项目与图片存在设计师浏览器的 IndexedDB；PDF 不上传任何服务器。
