# DREAMHOUSE BLUEPRINT · 架构说明

> 设计师把自己的方案 PDF（WPS / PowerPoint 导出）丢进来 → 自动生成「Dreamhouse Blueprint」品牌提案 PPT（可编辑）。
> 公司封面 / 品牌 / 公司 / 服务页沿用定稿模板；方案章节封面用 Material Board；全部在浏览器本机完成。

## 数据流

```
PDF ──import/pdfExtract.js──▶ rawPages（文字行 + 图片框 + 缩略图）
        ──import/analyze.js──▶ analysis（楼层 / 空间 / 视角 / 材料，纯函数，可在 Node 测）
        ──import/importPdf.js──▶ Project（engine/model.js，图片存进 IndexedDB → 'asset:<id>'）
Project ──engine/deck.js renderDeck()──▶ 渲染页 [{ bg, els }]（engine/spec.js 元素规格）
        ├─ components/SlideCanvas.jsx  网页预览（所见即所得）
        └─ engine/pptx/writer.js       导出 .pptx（真文本框 / 真图片，可在 PPT 里改）
```

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/theme.js` | 设计系统：画布 1920×1080、颜色、字体（思源宋体 / Ogg / Outfit）、文字样式 |
| `src/engine/model.js` | **数据模型契约**（Project / Slide 结构说明 + 工厂函数）——所有模块都按它读写 |
| `src/engine/spec.js` | 元素规格（rect / img / text）+ 文字宽度估算 + 图片裁切计算 |
| `src/engine/layouts.js` | 方案页版式（本案材料、楼层页、满版 / 框图效果图页、Material Board 封面、服务团队） |
| `src/engine/companyTemplate.js` | 公司固定页（自动生成，来源：定稿 PPT；`scripts/extract_template.py`） |
| `src/engine/deck.js` | `renderDeck(project, { meta })` → 渲染页；公司页 token 填充与单页改字 |
| `src/engine/pptx/` | `buildPptx(slides, { loadImage })` → .pptx（JSZip，浏览器 / Node 通用） |
| `src/store/db.js` | IndexedDB：projects / assets |
| `src/store/assets.js` | `'asset:<id>'` ↔ Blob / object URL / 尺寸；`storeBlob`、`preloadProjectAssets`、`resolveUrl`、`metaOf`、`loadForPptx`、`toInlineImage` |
| `src/ai/` | Gemini 客户端（`gemini.js`）、设置（`settings.js`）、标题润色（`polish.js`）、3D 全屋立体图（`dollhouse.js`） |
| `src/import/` | PDF 解析：`pdfExtract.js`（pdf.js）、`analyze.js`（纯函数）、`labels.js`（词典与文字解析）、`importPdf.js`（编排） |
| `src/moodboard/` | Material Board（移植自 UKIR STUDIO，只保留 material board 功能） |
| `src/components/` | 界面：首页 / 编辑器 / 检查器 / 材料清单 / 导出 / 设置 |
| `public/template/` | 公司固定页图片（自动生成） |
| `test/` | `npm test`：纯函数与导出结构测试（Node，无需浏览器） |

## 模块间约定（接口）

- **改项目**：编辑器持有 `project` state，子组件拿到 `onChange(updater)`，`updater = (project) => newProject`（不可变更新）。
- **存图**：`storeBlob(blob, { projectId })` → `'asset:<id>'`；同步读：`resolveUrl(src)`（预览）、`metaOf(src)`（尺寸）。
- **提示**：`notify({ type: 'ok' | 'warn' | 'error', text })`。
- **AI 设置**：`settings`（`ai/settings.js`）；没 key 时调用 `onOpenSettings()`。
- `importPdfFile(file, { onProgress(stage, done, total) })` → `Project`（已存好全部图片、已排好整套页面）。
- `<MoodBoard project settings notify onOpenSettings onUseAsCover={async (blob, meta) => …} />`
  —— `meta = { source: 'board' | 'flatlay' | 'upload', orientation: 'portrait' | 'landscape' | 'square' }`；
  MoodBoard 会 await 它并自己弹成功 / 失败提示（壳层出错直接抛）。默认画板竖版 3:4（左文右图封面），满版封面用 16:9。
  画板存在独立的 IndexedDB，删项目时要一起调 `removeBoardsOf(projectId)`（`src/moodboard/store.js`）。
- `<DollhousePanel project settings notify onOpenSettings onChange />` —— 立体图页 = `kind: 'view', tag: '3d', layout: 'full'`，
  插在该层章节页之后；不进楼层空间清单、不参与 AI 润色。
- `<PolishDialog project settings notify onOpenSettings onApply onClose onlySlideIds? />` —— 内部跑
  `polishProject(project, settings, { onProgress, onlySlideIds })` → `[{ slideId, before, patch }]`（只给建议），
  设计师勾选后 `onApply(patches)`，编辑器用 `applyPolishPatches(project, patches)` 套用（只改 subtitle / roomEn / notes，材料永远不动）。

## 设计原则

1. **所见即所得**：预览与导出共用一份元素规格；不要在任一端单独「微调」。
2. **定稿为准**：版式坐标取自已定稿 PPT，改版式先改定稿 PPT，再重跑 `scripts/` 里的抽取脚本。
3. **AI 只是加分项**：没有 API key 也能完整走完「上传 → 编辑 → 导出」；AI 功能（润色 / Material Board 实拍 / 3D 立体图）按需使用。
4. **数据在本机**：项目与图片存在设计师浏览器的 IndexedDB；PDF 不上传任何服务器。
