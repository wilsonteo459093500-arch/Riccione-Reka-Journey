# UKUR · 部署指南 (Vercel)

和 UKIR STUDIO 一样简单：**不需要 Supabase、不需要 API key**，纯前端，5 分钟上线。

## 1) 在 Vercel 创建独立项目

> 这个 repo 里每个 app 都是独立的 Vercel 项目，各自指向自己的子目录。
> UKUR 要**再开一个**项目指向 `measure/`。

1. 打开 https://vercel.com/new
2. 选择本 repo → **Import**
3. **Configure Project** 页面:
   - **Project Name**: `ukur`（随便起）
   - **Framework Preset**: 自动检测为 **Vite**
   - **Root Directory**: 点 **Edit** → 选 **measure** ⚠️ 最关键的一步
   - Build Command / Output Directory 保持默认
4. 不需要任何环境变量，直接 **Deploy**

拿到网址打开，看到上传页即部署成功。手机上「添加到主屏幕」就能当 app 用。

## 2) 没有登录门

拿到网址的人就能用。因为图纸和测量**全部只存使用者自己的浏览器**，
服务器上没有任何数据，也没有 API 费用，所以不设登录。
不想公开就别把网址外发；真要控制访问，可以在 Vercel 开 Password Protection（Pro 计划）。

## 3) 费用

零。没有后端、没有第三方 API，只有静态托管。

## 常见问题

- **PDF 打不开 / 转圈很久** —— 首次传 PDF 会另外下载 pdf.js（约 100KB gzip），
  网慢时等一下；扫描版大 PDF 渲染也要几秒。
- **量出来偏差大** —— 检查标定线是不是贴着尺寸线的两个端点画的，基准越长越准；
  再用「校验」分类量一条图纸上标注过的尺寸对一下误差。
- **换了设备图就没了** —— 数据只存本机浏览器，这是刻意的（图纸不上传）。
  要转移就用「标注图 / CSV / 摘要」导出。
- **手机上点不准** —— 先双指放大再点；点歪了切到「选择」模式拖端点微调。
