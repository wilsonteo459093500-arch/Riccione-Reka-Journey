# 溪岸 SITE · 现场报告

现场主管用手机填报告，一键出 **PDF / Word / Excel / WhatsApp 文案**。
每个检查项都能直接拍照，报告里照片就排在对应项目下面；签名用手指签。

部署：见 [`DEPLOY.md`](./DEPLOY.md)（Vercel，Root Directory 选 `site`，无需任何环境变量）。

## 七种报告（按项目流程排序）

| # | 报告 | 来源 | 主要输出 |
|---|---|---|---|
| 1 | 复尺确认表 Final Measurement Checklist | `Final_Measurement_Checklist.xlsx` | PDF / Excel（是 · 否 · N/A 三列打勾）+ 客户签名 |
| 2 | 场前审核表 Pre-Installation Site Audit（5O） | `Pre-installation_Site_Checklist.docx` | PDF，自动给出 GO / 有条件开工 / NO-GO 建议 |
| 3 | 进场通知 Site Entry Notice | 现用 WhatsApp 文案 | WhatsApp 文案（格式与现在一模一样）+ 可选 PDF |
| 4 | 每日安装汇报 Daily Installation Report | 现用 WhatsApp 文案 | WhatsApp 文案 + 进度 / 卫生 / 水电门窗照片 + 退场视频；预计工期自动倒数 |
| 5 | 安装质检清单 Installation Quality Checklist | `Sail-Installation-Quality-Checklist-CN-EN.docx` | PDF，自动统计合格 / 不合格 / Punch |
| 6 | 完工终检表 Final Inspection Report | `Template_Sail_Final_Inspection_Report_Internal.docx` | PDF，不合格项一键生成整改记录（问题照片 + 复验照片） |
| 7 | 交付执行清单 Handover Checklist | `Template_Sail_Handover_Checklist_Internal.docx` | PDF，30 天 / 1 年回访日期自动带出 |

所有文字（中英文、标准、规则、声明）都按原表逐字转录。

## 使用流程

1. **设置**：填名字、电话（自动带入进场通知、检查人、签名人）。
2. **项目**：楼盘 / 单位 / 客户 / SO / 地址 / 导航 / 预计安装天数，填一次全部报告自动带入。
3. **首页选报告 → 选项目** → 逐项点「合格 / 不合格」、写备注、拍照（不合格必须写处理方案，会红框提醒）。
4. 底部 **预览 & 导出**：
   - 看填写提醒（漏项、缺照片、关键项不过）→ 点一下跳回对应位置；
   - 生成 PDF / Word / Excel → 系统分享直接发 WhatsApp / 邮件 / 存云盘；
   - 进场通知 / 每日汇报：**复制文案** 或 **分享文案 + 照片 / 视频**。
5. 明天的日报：首页报告右侧「⋯ → 照这份再写一份」，文字保留，照片清空，预计工期自动减一天。

草稿自动保存在手机里；没信号也能填写（加到主屏幕后离线可用）。

## 技术

Vite + React 18 + Tailwind。全部在手机本地运行，没有后端：

- 存储：IndexedDB（项目 / 报告 / 照片 Blob / 设置），`src/lib/db.js`
- 照片：拍照后本地压缩（长边 1600px JPEG），`src/lib/images.js`
- PDF：React 渲染 A4 页面 → `html2canvas-pro` → `jspdf`（图片型 PDF，中文在任何手机上都不会乱码），`src/components/doc/` + `src/lib/export/pdf.js`
- Word：`docx`，`src/lib/export/docx.js`
- Excel：`exceljs`（报告页 + 数据页，方便筛选 / 导入 Lark），`src/lib/export/xlsx.js`
- 三种导出库都是**按需加载**，首屏不背这些体积
- 离线：`public/sw.js`（页面网络优先，静态资源缓存优先）

### 架构：一份模板，四种输出

```
templates/*.js (纯数据：字段 / 检查项 / 签名 / 统计规则)
        │
        ├─► 填写页（components/Editor.jsx 按节渲染）
        │
        └─► lib/docmodel.js  模板 + 填报数据 → 文档块
                 ├─► PDF   components/doc/ + export/pdf.js
                 ├─► Word  export/docx.js
                 ├─► Excel export/xlsx.js
                 └─► 文案  lib/text.js（模板自带 text() 或通用摘要）
```

### 新增一种报告

1. 复制 `src/templates/qualityCheck.js` 改成新文件（契约见 `src/templates/schema.js` 顶部注释）。
2. 在 `src/templates/index.js` 登记。
3. `npm test` —— 会自动用假数据把每个模板走一遍 PDF 之外的所有导出。

模板 `id` 发布后不要改（已存的报告靠它找模板）。

## 开发

```bash
cd site
npm install
npm run dev           # http://localhost:5173
npm test              # 模板 / 文档模型 / Word / Excel / 文案（纯 Node）
npm run test:browser  # PDF 渲染（需要 Playwright + Chromium），输出到 test/out/
npm run build
```
