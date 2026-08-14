# 溪岸 SAIL · Delivery OS

全屋定制项目交付管理工具。围绕 **SAIL 方法论**的五个章节（Vision · Blueprint · Craft · Arrival · Signature）组织项目，让 SD / SS / WH / 采购在同一套流程上协作。

> 📁 本 repo 还包含三个独立 app（共用 repo、各自独立部署）：
> - **Sail CRM** — 销售 / pipeline / 售后管理。代码在 [`/crm`](./crm)，部署指南见 [`crm/DEPLOY.md`](./crm/DEPLOY.md)。
> - **溪岸 Render** — AI 效果图工作室：照片/草图秒变照片级效果图，给设计师减负。代码在 [`/render`](./render)，部署指南见 [`render/DEPLOY.md`](./render/DEPLOY.md)。
> - **RICCIONE REKA Studio** — 内容工作台：上传一条参考视频 + 你的原片/案例图，拆出配方、排好剪辑方案、写好发布文案。代码在 [`/studio`](./studio)，部署指南见 [`studio/DEPLOY.md`](./studio/DEPLOY.md)，工具调研见 [`studio/RESEARCH.md`](./studio/RESEARCH.md)。

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
```
