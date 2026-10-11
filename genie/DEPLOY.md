# GENIE 上线

纯前端（Vite + React + three.js），没有后端、没有环境变量。

## Vercel（推荐）

新建一个 project，连同一个 repo：

| 设置 | 值 |
|---|---|
| Project Name | `genie-riccione-reka`（随意） |
| Root Directory | `genie` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

`genie/vercel.json` 已经设好：`cleanUrls`（网址是 `/quiz`、`/studio`，不带 `.html`）、缓存与安全头，
以及「只有 `genie/` 改了才重新部署」。

上线后：

- 展厅 iPad：把 `https://<网址>/quiz?from=<你的代号>` 加到主屏幕（像 App 一样全屏打开）；
- 设计师电脑：`https://<网址>/studio`，第一次用 AI 识别时在 ⚙️ 设置里填 Gemini key（只存在那台电脑）；
- 展厅大屏 / 宣传：打开工作室 → ▶ 演示模式（自动环绕 + 24 小时光影）。

## 其他托管

`npm run build` 之后把 `dist/` 整个丢到任何静态托管（Netlify、Cloudflare Pages、自己的服务器）。
如果托管不支持 cleanUrls，用 `/quiz.html`、`/studio.html` 也一样能用（页面之间的链接都是 `.html`）。

## 本地预览

```bash
cd genie && npm install && npm run dev
```
