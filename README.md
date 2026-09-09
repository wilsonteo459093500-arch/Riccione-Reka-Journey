# 溪岸 SAIL · Delivery OS

全屋定制项目交付管理工具。围绕 **SAIL 方法论**的五个章节（Vision · Blueprint · Craft · Arrival · Signature）组织项目，让 SD / SS / WH / 采购在同一套流程上协作。

> 📁 本 repo 还包含四个独立 app（共用 repo、各自独立部署）：
> - **Sail CRM** — 销售 / pipeline / 售后管理。代码在 [`/crm`](./crm)，部署指南见 [`crm/DEPLOY.md`](./crm/DEPLOY.md)。
> - **UKIR STUDIO**（by RICCIONE REKA）— AI 效果图工作室：照片/草图秒变照片级效果图，给设计师减负。代码在 [`/render`](./render)，部署指南见 [`render/DEPLOY.md`](./render/DEPLOY.md)。
> - **CIPTA STUDIO**（by RICCIONE REKA）— 内容工作台：上传一条参考视频 + 你的原片/案例图，拆出配方、排好剪辑方案、写好发布文案。代码在 [`/studio`](./studio)，部署指南见 [`studio/DEPLOY.md`](./studio/DEPLOY.md)，工具调研见 [`studio/RESEARCH.md`](./studio/RESEARCH.md)。
> - **RICCIONE REKA JOURNEY** — 客户需求卡 + 展厅邀请函（纯静态，无需构建）。代码在 [`/invite`](./invite)，说明见 [`invite/README.md`](./invite/README.md)。

## 功能

- **看板** — 项目按当前章节自动归位，支持按成员筛选
- **日报总览** — 早会速览：汇总各工地最新安装日报、安全状态，一键复制全天摘要到 WhatsApp / WeChat
- **Method** — 五章节品牌手册（可打印作培训 / 销售材料）
- **项目详情** — Gate 勾选、备注、Drive 链接、风险登记、缺陷追踪
- **表单** — 五份可填写核查表（空间问卷 / 量尺 / 场地检查 / 安装 QC / 验收）
- **安装每日报告** — 安装期每天 EOD 填写：进度、问题、照片、退场前 4 项安全检查（水/电/门窗/清理），可单条复制到 WhatsApp
- **团队** — 按岗位查看工作负载
- **风险** — 跨项目汇总
- **客户分享视图** — 只读进度报告，可打印 / 复制文字

## 技术栈 & 数据策略

Vite + React 18 + Tailwind CSS。**两种数据模式**：

- **本地模式**（默认）：项目元数据存于当前浏览器 IndexedDB，仅本机可见。
- **云端同步模式**：配置 Supabase 后启用 —— 多设备 / 多人共享同一份数据、实时同步、邮箱登录。

**混合存储原则 (Hybrid Storage)**：

> 应用只是 UI；你的资产（文件）放在你能控制的地方。

- 结构化数据（项目、Gate、日报、缺陷）→ Supabase（你账号、随时 CSV 导出）
- 所有文件 / 照片 / PDF → **Google Drive / Dropbox 链接**，应用从不存二进制
- 这样应用挂了、平台涨价、你想换工具 —— 数据都跟着你走，文件永远是你的

## 云端同步设置（可选）

要让全团队共享数据，按以下步骤接入 Supabase（免费额度足够小团队）：

1. 在 [supabase.com](https://supabase.com) 新建一个 project。
2. 打开 **SQL Editor**，把 `supabase/schema.sql` 的内容粘贴执行（建表 + 权限 + 实时）。
3. 在 **Project Settings → API** 复制 `Project URL` 和 `anon public` key。
4. 本地开发：复制 `.env.example` 为 `.env.local` 并填入：

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```

5. 部署（如 Vercel / Netlify）：在平台的环境变量里设置这两个值，重新构建即可。

### ⚠️ 访问模型：开放团队 (Open-team)

当前设置**没有登录页** —— 拿到网址的人就能读写全部数据（`schema.sql` 里 RLS 用的 `to public` 策略）。
这是给互相信任的小团队用的方案：**安全靠网址保密**，不靠账号。

- 想让谁用 → 把网址发给 ta
- 想撤销访问 → 在 Supabase 换掉 anon key + 更新 Vercel 环境变量重新部署
- 想加登录 → 恢复 `src/App.jsx` 里 `<AuthGate>` 包裹, 把 `schema.sql` 里的 `to public` 改回 `to authenticated`

## 开发

```bash
npm install
npm run dev      # 本地开发服务器
npm run build    # 生产构建到 dist/
npm run preview  # 预览构建产物
```

## 结构

```
src/
  App.jsx                 # 视图路由 + 状态编排
  theme.js                # 配色
  constants/              # stages / forms / storage keys / design / calendar / team
  utils/                  # 纯函数 helpers + 示范数据
  services/
    storage.js            # IndexedDB 键值存储
    supabase.js           # Supabase 客户端（按 env 自动启用）
    repo.js               # 数据仓库抽象：本地 / 云端两套实现
  hooks/                  # useProjects, useAppointments, useTeam
  i18n/                   # 中英翻译 + LangProvider
  components/
    ui/                   # 输入控件 + 确认弹窗 / Toast
    kanban/ project/ forms/ risks/ team/ client/
    daily/ defects/ aftersales/ design/ briefing/ calendar/ settings/
supabase/schema.sql       # 一次性建表脚本
crm/                      # 独立的 Sail CRM app（单独部署）
render/                   # 独立的 溪岸 Render AI 效果图 app（单独部署）
invite/                   # RICCIONE REKA JOURNEY 邀约体验网站（纯静态）
```

## AI 协作插件（Claude Code）

本 repo 在 `.claude/settings.json` 里登记了两个 Claude Code 插件源。用 Claude Code 打开本项目并信任目录后，会自动拉取安装，**不需要手动 `/plugin install`**，插件代码也不进 repo（始终跟随上游更新）：

| 插件 | 来源 | 作用 |
| --- | --- | --- |
| [**superpowers**](https://github.com/obra/superpowers) | `obra/superpowers` | 14 个开发工作流 skill：TDD 红绿重构、系统化调试、写/执行实施计划、并行 subagent、code review 收发、git worktree、完工前验证等。常驻约 700 token。 |
| [**caveman**](https://github.com/JuliusBrussee/caveman) | `JuliusBrussee/caveman` | 21 个 skill + 3 个 agent，把回复压缩成极简"穴居人语"，实测比无提示基线省约 65% 输出 token，技术准确度不变。只压缩风格不换语言 —— 你用中文提问它仍用中文回。常驻约 1.8k token。 |

### caveman 默认模式

根目录的 `.caveman.json` 把本项目默认模式钉在 `full`（常开压缩）。这是 repo 级设置，不污染每个人的全局配置。

```jsonc
{ "defaultMode": "full" }
```

- 临时切换（仅当前会话）：`/caveman off` · `/caveman lite` · `/caveman ultra` · `/caveman wenyan`（中文文言压缩模式）
- 想改全项目默认：改 `.caveman.json` 的 `defaultMode`，可选 `off` / `lite` / `full` / `ultra` / `wenyan*`
- 只对自己关掉、不动 repo：设环境变量 `CAVEMAN_DEFAULT_MODE=off`（优先级高于 `.caveman.json`）

### 常用命令

- superpowers：skill 按场景自动触发，无需手动调用；也可 `/brainstorming`、`/writing-plans` 等直接点名
- caveman：`/caveman`（切模式）、`/caveman-stats`（省了多少 token）、`/caveman-review`、`/caveman-commit`

### 不想要插件

删掉 `.claude/settings.json` 里对应的 `extraKnownMarketplaces` / `enabledPlugins` 条目即可；或在自己的 `.claude/settings.local.json`（已被 gitignore）里把插件设为 `false` 单独覆盖：

```json
{ "enabledPlugins": { "caveman@caveman": false } }
```
