# 上线流程（全部软件共用，2026-11-20 起）

## 一句话

**合并进 main = 正式版自动更新；别的分支 = 预览版。只有改到的软件才测试、出版本，测试没过不上线。**

由 GitHub Actions（`.github/workflows/deploy.yml`「测试 + 上线」）负责，不再由 Vercel 自己盯着整个仓库。

## 为什么改

以前每推一次，5 个 Vercel 项目各建一次（不管改的是不是它）。Vercel 免费方案一天只有 100 次部署，2026-11-19 当天就被吃光，全部软件 24 小时出不了新版。各项目的「没改到就跳过」（`ignoreCommand`）是建了再取消，**照样算额度**。

现在：没改到的软件**根本不建**；而且用你的 Vercel 钥匙出版本，仓库改成不公开以后，Claude 推的预览也照样出得来（Vercel 免费方案对不公开仓库只替本人的提交出版本）。

## 哪些软件

登记在 `.github/apps.json`：

| 软件 | 文件夹 | Vercel 项目 |
|---|---|---|
| KIRA | `kira/` | kira-riccione-reka |
| VISI / JOURNEY | `invite/` | visi-riccione-reka |
| SPACE | `network/` | space-network |
| UKIR STUDIO | `blueprint/` | sail-render |
| WISH | `genie/`（还在 PR #65，没进 main） | wish-riccione-reka |

没登记的（`render/` 旧版 UKIR、`crm/`、`studio/`、根目录 Delivery OS）这次没动：它们现在没有在 Vercel 自动部署。

## 每次推送发生什么

1. 「看改到哪些软件」：main 和上一次推送比；别的分支和 main 的分岔点比（整条分支改过什么）。改到 `.github/` 本身 → 全部软件都跑一次。
2. 每个改到的软件：`npm ci` + `npm test`（有测试的话）→ 出版本（main = 正式版，其他 = 预览）。
3. 预览网址自动贴到那条分支的 PR 留言里（同一则留言会更新，不会一直加）。预览网址要先登入 Vercel 才看得到。

## 常用操作

- **重新出一次版本**（例：换了环境变量）：GitHub → Actions →「测试 + 上线」→ **Run workflow** → 分支选 `main`（= 正式版）→ 填软件代号（`kira` / `visi` / `space` / `ukir` / `wish` / `all`）。
- **紧急退回上一版**：Vercel → 那个项目 → Deployments → 找上一个正常的正式版 → ⋯ → **Promote to Production**（不用等 GitHub）。
- **看为什么没上线**：GitHub → Actions → 点那一次 → 红色的那一步就是原因（测试没过、钥匙没设……）。

## 一次性设定（2026-11-20 做的，换电脑 / 换人时照这个检查）

1. **Vercel 钥匙**：vercel.com → 右上头像 → Account Settings → **Tokens** → Create（Scope 选你的团队，Expiration 选 No Expiration 或 1 年）→ 复制。
   GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**：Name `VERCEL_TOKEN`，Secret 贴上 → Add。
   钥匙到期或外泄：在 Vercel 删掉旧的、建新的，GitHub 这里按 Update 换掉。
2. **关掉 Vercel 自己的自动部署**（两层，都做了）：
   - 各软件的 `vercel.json`：`"git": { "deploymentEnabled": false }`
   - 各 Vercel 项目设定：只允许 CLI 出版本、不接受 Git 自动部署（旧分支上的 `vercel.json` 还是旧的，所以要靠这一层挡）
3. **仓库不公开**：GitHub 仓库 → Settings → 最下面 Danger Zone → Change visibility → Make private。

## 新增一个软件

1. Vercel 建项目（Root Directory = 那个文件夹）
2. `.github/apps.json` 加一行（Vercel 项目 ID 在项目 Settings → General 最下面）
3. 那个文件夹的 `vercel.json` 加 `"git": { "deploymentEnabled": false }`，Vercel 项目设定也照第 2 步关掉 Git 自动部署
4. 推一次，确认 Actions 出得了预览

## 额度

- Vercel 免费方案：一天 100 次部署。现在一次推送只用「改到的软件数」次。
- GitHub Actions：不公开的仓库每月 2,000 分钟免费。一个软件测试 + 出版本约 2–4 分钟。
