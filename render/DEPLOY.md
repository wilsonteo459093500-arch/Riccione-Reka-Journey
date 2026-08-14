# UKIR STUDIO · 部署指南 (Vercel)

比 CRM 更简单：**不需要 Supabase**，纯前端，5 分钟上线。

## 1) 在 Vercel 创建独立项目

> 现有 repo 已有 Delivery OS 和 CRM 两个 Vercel 项目。Render 是第三个独立 app，
> 要**再开一个** Vercel 项目指向 `render/` 子目录。

1. 打开 https://vercel.com/new
2. 选择 GitHub repo `wilsonteo459093500-arch/Wilson` → **Import**
3. **Configure Project** 页面:
   - **Project Name**: `sail-render`（随便起）
   - **Framework Preset**: 自动检测为 **Vite**
   - **Root Directory**: 点 **Edit** → 选 **render** ⚠️ 最关键的一步
   - Build Command / Output Directory 保持默认
4. 不需要任何环境变量，直接 **Deploy**

拿到 `sail-render-xxxx.vercel.app` 网址后打开，看到工作台界面即部署成功。

## 2) 每个使用者自己配 API key

1. 打开 https://aistudio.google.com/apikey （Google 账号登录）
2. **Create API key** → 复制
3. 在 app 右上角「配置 API key」粘贴 → 「测试连接」→ 保存

key 只存在各自设备的浏览器里；换设备/换浏览器要重新粘贴一次。

## 3) 费用

按量计费，默认模型约 **US$0.04/张**。一天出 50 张也就 ~US$2，
没有月费。用量可在 Google AI Studio 后台查看，也可设配额上限。

## 常见问题

- **测试连接失败 / 403** → key 复制不完整，或该地区需要在高级设置里填中转代理地址
- **提示限流 (429)** → 免费额度每分钟有请求数限制，等一会儿或减少同时生成张数
- **生成的图不见了** → 历史只存本机浏览器（IndexedDB），清浏览器数据会清掉；重要图记得下载
