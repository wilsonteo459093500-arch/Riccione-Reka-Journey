# TORA by Riccione Reka · 部署指南 (Vercel)

和 UKIR STUDIO 一样：**纯前端，不需要数据库、不需要 API key**，5 分钟上线。

## 1) 在 Vercel 创建独立项目

> 这个 repo 里已经有好几个 Vercel 项目（Delivery OS / CRM / Render / Studio）。
> TORA 要**再开一个**，指向 `site/` 子目录。

1. 打开 https://vercel.com/new
2. 选择 GitHub repo `wilsonteo459093500-arch/Riccione-Reka-Journey` → **Import**
3. **Configure Project** 页面：
   - **Project Name**：`tora-riccione-reka`（随便起）
   - **Framework Preset**：自动识别为 **Vite**
   - **Root Directory**：点 **Edit** → 选 **site** ⚠️ 最关键的一步
   - Build Command / Output Directory 保持默认
4. 不需要任何环境变量，直接 **Deploy**

拿到 `tora-riccione-reka.vercel.app` 网址后用手机打开，看到「今天做哪份报告？」即成功。
（可在 Vercel → Settings → Domains 绑一个好记的域名，例如 `site.你的域名.com`。）

## 2) 发给现场主管

1. 把网址发到主管的 WhatsApp。
2. 让他们**加到主屏幕**（像 App 一样打开、没信号也能用）：
   - iPhone：用 **Safari** 打开 → 底部「分享」→「添加到主屏幕」
   - Android：用 **Chrome** 打开 → 右上角「⋮」→「添加到主屏幕 / 安装应用」
3. 第一次打开：「设置」里填自己的**名字 + 电话**（进场通知、检查人、签名会自动带入）。
4. 「项目」里建项目：楼盘、单位、客户、SO、地址、导航链接、预计安装天数。

> 💡 iPhone：**先加到主屏幕再开始填资料**。主屏幕 App 和 Safari 的资料是分开存的；
> 已经在 Safari 里填了，就用「设置 → 导出备份」，再在主屏幕 App 里「从备份恢复」。
>
> 📶 第一次联网打开后，整个 App 会缓存在手机上，之后工地没信号也能打开、填写、导出。

## 3) 数据存在哪里？

- 报告、照片、签名**只存在各自手机的浏览器里**（IndexedDB），不上传任何服务器。
- 导出的 PDF / Word / Excel 由手机本地生成，再通过系统分享发到 WhatsApp / 邮件 / 云盘。
- 换手机或清浏览器之前：「设置 → 导出备份」，在新手机「从备份恢复」（视频多时可勾选「不含视频」，文件小很多）。恢复时本机较新的报告会保留。
- iPhone 注意：没加到主屏幕的网站，Safari 可能在 **7 天没打开**后清掉本地数据 —— 所以一定要加到主屏幕，重要报告及时导出。

## 常见问题

- **分享按钮变成了下载** → 这台设备 / 浏览器不支持系统分享（多见于电脑）。下载后再手动发送即可。
- **iPhone 分享到 WhatsApp 只有照片没有文字** → WhatsApp 的限制。先点「复制文案」，分享照片后在对话框里粘贴。
- **照片很多 / 有视频** → 分享按钮会自动分成几组（安卓一次最多 10 个文件、50MB），按顺序点；超过 45MB 的视频请在 WhatsApp 里从相册选。
- **更新后提示「需要联网加载一次」** → App 刚更新、新版本还没缓存，连网点「重新加载」即可，报告不会丢。
- **PDF 生成慢** → 照片多时每页要几秒（全部在手机上完成）。一份 3–5 页的报告通常 10 秒内。
- **照片会不会很大** → 拍照后自动压缩到长边 1600px，一张约 200–400 KB；PDF 里清晰可打印。
- **改了模板 / 想加新报告** → 见 `README.md`「新增一种报告」。
