# KIRA by RICCIONE REKA · 柜子规划报价

让没有设计背景的业务 5 分钟出橱柜报价：选模板 → 打总宽 → 自动分门、画立面图和 3D 小图 → 出报价单（PDF / 长图 / WhatsApp）。

- **独立 app**：自己的目录 `kira/`、自己的 Vercel 项目和网址。旧报价工具（PR #6，`quote.html`）一行都没改，照常可用。
- **价格**：从旧报价工具原样复制 `src/constants/pricing.js`（门板 / 柜体 / 开放柜系列价、延米 vs 平米、抽屉、系数、岩板不折扣、设计师版）。以后**只在 KIRA 改价**。复制来源与指纹记在 `VENDOR.json`。
- **数据**：本机先存（`kira.records.v1`，离线也能报价）；配置 Supabase 后和旧工具**同一套登录**，资料在新表 `kira_projects`（全员共享，只有做的人能删）。旧表 `quotes` 只读（导入旧报价用）。

## 开发

```bash
cd kira
npm install
npm run dev           # http://localhost:5181
npm test              # 价格黄金值等 Node 测试
npm run build         # 产物在 dist/
npm run check:vendor  # 检查从旧工具复制来的文件有没有被改
```

## 有意改价格表时

1. 改 `src/constants/pricing.js`
2. 更新 `test/pricing.test.mjs` 里的黄金值
3. `npm run check:vendor -- --accept`（把新指纹记进 `VENDOR.json`）

## 结构

```
src/constants/pricing.js     价格表（来自旧工具）
src/components/quote/        报价界面（来自旧工具，加了 KIRA 的挂钩）
src/planner/                 积木柜：模型、模板、→ 旧工具明细的换算（bridge）
src/services/kiraRepo.js     云端（kira_projects；旧 quotes 只读）
supabase/kira_projects.sql   建表脚本（可重复执行）
public/sw.js                 离线（KIRA 自己的网址，和旧工具的 SW 无关）
```

部署见 [DEPLOY.md](./DEPLOY.md)。
