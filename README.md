# 溪岸 SAIL · Delivery OS

全屋定制项目交付管理工具。围绕 **SAIL 方法论**的五个章节（Vision · Blueprint · Craft · Arrival · Signature）组织项目，让 SD / SS / WH / 采购在同一套流程上协作。

## 功能

- **看板** — 项目按当前章节自动归位，支持按成员筛选
- **Method** — 五章节品牌手册（可打印作培训 / 销售材料）
- **项目详情** — Gate 勾选、备注、附件（上传 / 云盘链接）、风险登记
- **表单** — 四份可填写核查表（空间问卷 / 量尺 / 安装 QC / 验收）
- **团队** — 按岗位查看工作负载
- **风险** — 跨项目汇总
- **客户分享视图** — 只读进度报告，可打印 / 复制文字

## 技术栈

Vite + React 18 + Tailwind CSS。数据存于浏览器 IndexedDB（附件以 base64 单独存储）；若宿主页面提供 `window.storage` 共享运行时则自动复用。

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
  constants/              # stages / forms / storage keys
  utils/                  # 纯函数 helpers + 示范数据
  services/storage.js     # IndexedDB 键值存储（含 window.storage 适配）
  hooks/useProjects.js    # 数据加载 / 迁移 / 持久化（稳定回调）
  components/
    ui/                   # 输入控件 + 确认弹窗 / Toast
    kanban/ project/ forms/ risks/ team/ client/
```
