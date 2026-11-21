# UKIR STUDIO · 上线指南（Vercel）

纯前端：没有数据库、没有环境变量、没有服务器。之后每次 push 到 `main` 自动重新部署（只有 `blueprint/` 有改动时才会构建）。

> ⚠️ 先决条件：`blueprint/` 必须已经在 `main` 分支上（合并这次的 PR 之后）。

## 方式 A（推荐，已采用）：接管旧版 UKIR STUDIO 的网址

旧版 UKIR STUDIO 是 Vercel 项目 **`sail-render`**（代码在 `render/`）。把它的根目录换成 `blueprint`，同一个网址打开就是新版：

1. Vercel → 项目 `sail-render` → **Settings → Build and Deployment → Root Directory** 改成 **`blueprint`** → Save
   （Framework 仍是 Vite；Build / Output 留空，用 `blueprint/vercel.json`）
2. **Deployments** → 最新一次 `main` 部署 → **Redeploy**（或 push 一次 `main`）
3. 打开网址，看到「UKIR STUDIO · 提案工作台」登录页就成功了

同一网址的好处：设计师浏览器里**旧版的材质库、画板、登录、API key 第一次打开新版时自动搬过来**（首页会提示
「已从旧版 UKIR STUDIO 搬来 N 个材质、M 块画板」，在首页「Material Board」里）。旧版数据只读不删。
（登录账号 2026-11 重设过：旧版的登录不再沿用，每台设备要用新账号登录一次；材质库、画板、API key 照旧搬过来。）

**回滚**：万一有问题 → Deployments 里找到换根目录之前的那次生产部署 → **Instant Rollback**；
再把 Root Directory 改回 `render`，旧版就完全恢复（新版搬家时没动旧数据）。

## 方式 B：单独一个新网址

1. 打开 <https://vercel.com/new> → 选 GitHub repo `wilsonteo459093500-arch/Riccione-Reka-Journey` → **Import**
2. **Root Directory** 点 Edit → 选 **`blueprint`**；Framework 自动识别 Vite；环境变量一个都不用填 → **Deploy**

注意：浏览器数据跟着网址走，旧版里存的材质库 / 画板不会出现在新网址里。

## 访问保护

Vercel 的 **Deployment Protection → Vercel Authentication**：
- 「Standard Protection」（新项目默认）：只保护预览网址，**生产网址设计师直接能打开**（再加 app 自己的登录）。
- 「All Deployments」：连生产网址也要先登录 Vercel —— 设计师没有 Vercel 账号就打不开。`sail-render` 目前是这个设置，
  如果设计师打不开，到 Settings → Deployment Protection 改成 Standard Protection。

## Vercel 免费方案的部署额度

免费方案每天最多 100 次部署。这个 repo 连着好几个 Vercel 项目，一次 push 每个项目都会算一次（被 Ignored Build Step 跳过的除外）。
看到「Deployment rate limited — retry in 24 hours」就是额度用完了：等额度恢复后在 Deployments 里点 Redeploy 即可。

## 每位设计师第一次使用

- **不填 API key 也能用**：上传 PDF → 自动排版 → 修改 → 导出 PPT，全部离线完成。
- 要用 AI 功能（AI 润色标题 / Material Board 实拍排版 / 3D 全屋立体图），在右上角 ⚙️ 设置里粘贴 Google AI Studio 的 key
  （<https://aistudio.google.com/apikey>，和旧版 UKIR STUDIO 用的是同一种 key；同网址时会自动沿用）。key 只存在本机浏览器。

## 字体（导出的 PPT 要好看，打开 PPT 的电脑需要装）

| 字体 | 用在 | 下载 |
|---|---|---|
| 思源宋体 Source Han Serif CN | 中文标题与正文 | <https://github.com/adobe-fonts/source-han-serif/releases> |
| Outfit | 英文小标题、编号 | <https://fonts.google.com/specimen/Outfit> |
| Ogg | 页脚品牌字、人名（付费字体，没装会自动用替代字体） | — |

网页里的预览会自动用 Google Fonts 的等效字体（Noto Serif SC / Outfit），不需要安装。

## 数据存在哪里

项目和图片存在**各自电脑浏览器的 IndexedDB** 里（清浏览器数据会清掉）。首页「资料安全」写着浏览器答没答应长期保存、
每个项目上次备份几天前（改过、7 天没备份变黄）。
- 平时：首页「全部备份」→「备份到资料夹」（Chrome / Edge；第一次选一个资料夹，建议是会自动同步的 Google Drive / OneDrive 资料夹）
- 换电脑 / 交还电脑：「打包成一个文件」，新电脑首页「导入备份」；单个项目也可以在卡片上备份、发给同事
- 交还电脑：首页最下面「清除本机全部资料」

`sail-render.vercel.app` 在 Vercel 上 2026-08-14 起已经自动转到 `ukir-studio.vercel.app`（307），只发 `ukir-studio` 这个网址给设计师。

## 常见问题

- **PDF 很大（20–60 MB）解析慢** → 正常，几十张 4K 效果图要逐张解码压缩，约 20–60 秒；页面上有进度。
- **识别出的标题 / 材料不对** → 在「页面」里直接改；材料在「材料清单」里改一次，所有页面同步。
- **导出的 PPT 字体不对** → 打开 PPT 的电脑没装上面的字体。
- **同一个项目开了两个标签页** → 后保存的那个会暂停保存并提示刷新，不会互相覆盖。
