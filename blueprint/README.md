# DREAMHOUSE BLUEPRINT · 方案 PPT 生成器

> by RICCIONE REKA · 溪岸 SAIL

设计师做好方案（WPS / PowerPoint 导出的 PDF）→ **丢进来 → 自动生成「Dreamhouse Blueprint」品牌提案 PPT**。
公司封面、品牌、公司、服务页沿用已定稿的模板；方案页由 PDF 自动识别排版；
**方案章节的封面用 Material Board**（AI 实拍级材质摆盘）。导出的是**可编辑的 .pptx**，
在 PowerPoint / WPS / Keynote 里继续改字、换图都没问题。

目的：**缩短做提案的时间，同时让提案更好看、更好讲。**

> 独立 app，与 Delivery OS / CRM / UKIR STUDIO / CIPTA STUDIO 共用 repo、各自部署。上线见 [`DEPLOY.md`](./DEPLOY.md)，
> 代码结构见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

## 设计师怎么用（4 步）

1. **上传方案 PDF** —— 自动识别：楼层、每页的空间名、效果图、材料样板（名称 / 编号 / 待确认）、标注说明；客户名、地点、日期从文件名读。
2. **检查与修改** —— 左边整套页面，中间所见即所得，右边改字 / 换图 / 换版式（满版 ↔ 框图）/ 调材料；点画布上的字直接跳到对应输入框。
   材料在「材料清单」里改一次，所有页面同步。可开「对照原稿」逐页核对。有 API key 时可一键「AI 润色标题」。
3. **Material Board 封面** —— 本案材料自动导入画板，可再加道具（客户故事），AI 实拍排版出图 → 「设为方案封面」。
   也可以直接上传在 UKIR STUDIO 做好的 Material Board。
4. **导出 PPT** —— 一键下载 `.pptx`；还可以下载项目备份发给同事。

## 原稿怎么做，识别最准

| 原稿习惯 | 生成结果 |
|---|---|
| 每页左上角写「空间名 + 英文」，如 `客厅 LIVING AREA`、`主人房U形衣橱+化妆台（白天）` | 标题「客厅」「主人房 · U形衣橱 · 化妆台 · 白天」+ 英文小标题 |
| 楼层分隔页写 `GROUND FLOOR 一楼设计图` | 楼层章节页「一楼」+ 本层空间清单 |
| 材料样板图旁边 / 上面写「柜体 & 柜门 / 浅川橡 AG273 /（待确认）」 | 材料行：样板 + 用途 + 名称 + 编号；待确认会在编辑器里标出 |
| 效果图上的箭头标注文字 | 变成页面上的「设计说明」 |
| 文件名 `2026.8.6 Muar - Mr Lau - GF L1.pdf` | 客户 Mr Lau、地点 Muar、日期 2026 · 08 |

## 数据与费用

- **全部在浏览器本机完成**：PDF 不上传任何服务器；项目与图片存在本机 IndexedDB。
- **AI 是可选的**：不填 key 也能完整「上传 → 编辑 → 导出」。AI 润色 / Material Board 实拍排版用 Google Gemini（与 UKIR STUDIO 同一种 key），按量计费。
- 登录用 UKIR STUDIO 同一组账号密码。

## 公司固定页改版

公司页（封面、品牌、公司、服务、封底）来自已定稿的 Blueprint PPT。要改：

1. 在 PowerPoint 里改好定稿 PPT（保持页序：1 封面、2 目录、3–13 品牌与公司、14 方案章节页、54–59 服务与封底）
2. 解压 `.pptx`，运行 `python3 scripts/extract_template.py <解压目录> .`（以及 `scripts/build_base_parts.py`）
3. 提交 `src/engine/companyTemplate.js` 与 `public/template/`

项目相关文字（客户 · 地点、日期、楼层）在模板里是 `{{token}}`，会按项目自动填写。

## 开发

```bash
cd blueprint
npm install
npm run dev      # 本地开发
npm test         # 纯函数 + 导出结构测试（Node）
npm run build    # 生产构建到 dist/
```
