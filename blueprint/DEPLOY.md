# DREAMHOUSE BLUEPRINT · 上线指南（Vercel）

纯前端：没有数据库、没有环境变量、没有服务器。第一次上线约 5 分钟，之后每次 push 到 `main` 自动重新部署。

> ⚠️ 先决条件：`blueprint/` 必须已经在 `main` 分支上（合并这次的 PR 之后）。
> Vercel 导入页面的 Root Directory 下拉框读的是默认分支；找不到 `blueprint` 时，
> 按 [`studio/DEPLOY.md`](../studio/DEPLOY.md) 第 0 节的办法处理（硬刷新 / 部署后在 Settings 里手动填 Root Directory）。

## 1) 在 Vercel 新建一个独立项目

1. 打开 <https://vercel.com/new>
2. 选 GitHub repo `wilsonteo459093500-arch/Riccione-Reka-Journey` → **Import**
3. **Configure Project**：

   | 字段 | 填什么 |
   |---|---|
   | **Project Name** | `dreamhouse-blueprint`（随便起，决定默认网址） |
   | **Framework Preset** | 自动检测为 **Vite** |
   | **Root Directory** | 点 **Edit** → 选 **`blueprint`** ⚠️ 最关键的一步 |
   | Build / Output | 留空（默认 `npm run build` / `dist`） |
   | Environment Variables | 一个都不用填 |

4. **Deploy**，约 1 分钟后拿到 `dreamhouse-blueprint-xxxx.vercel.app`，看到登录页就成功了。

登录用的是和 **UKIR STUDIO 同一组账号密码**。

## 2) 每位设计师第一次使用

- **不填 API key 也能用**：上传 PDF → 自动排版 → 修改 → 导出 PPT，全部离线完成。
- 要用 AI 功能（AI 润色标题 / Material Board 实拍排版），在右上角 ⚙️ 设置里粘贴 Google AI Studio 的 key
  （<https://aistudio.google.com/apikey>，和 UKIR STUDIO 用的是同一种 key）。key 只存在本机浏览器。

## 3) 字体（导出的 PPT 要好看，打开 PPT 的电脑需要装）

| 字体 | 用在 | 下载 |
|---|---|---|
| 思源宋体 Source Han Serif CN | 中文标题与正文 | <https://github.com/adobe-fonts/source-han-serif/releases> |
| Outfit | 英文小标题、编号 | <https://fonts.google.com/specimen/Outfit> |
| Ogg | 页脚品牌字、人名（付费字体，没装会自动用替代字体） | — |

网页里的预览会自动用 Google Fonts 的等效字体（Noto Serif SC / Outfit），不需要安装。

## 4) 数据存在哪里

项目和图片存在**各自电脑浏览器的 IndexedDB** 里（清浏览器数据会清掉）。
换电脑 / 发给同事：导出时点「下载项目备份」，对方在首页「导入项目备份」即可。

## 常见问题

- **PDF 很大（20–60 MB）解析慢** → 正常，几十张 4K 效果图要逐张解码压缩，约 20–60 秒；页面上有进度。
- **识别出的标题 / 材料不对** → 在「页面」里直接改；材料在「材料清单」里改一次，所有页面同步。
  原稿排版越规范（每页左上角「空间名 English」、材料样板旁边写「柜体 & 柜门 / 名称 编号」），识别越准。
- **导出的 PPT 字体不对** → 打开 PPT 的电脑没装上面的字体。
