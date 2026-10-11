# WISH 上线与展厅设置

纯前端（Vite + React + three.js），没有后端、没有环境变量、没有数据库。
这份只讲**部署**和**展厅设备怎么设**；每个功能是什么、怎么改配置，见 [`README.md`](./README.md)。

---

## 一、部署到 Vercel

在 Vercel 新建一个 project，连同一个 GitHub repo：

| 设置 | 值 |
|---|---|
| Project Name | `wish-riccione-reka` |
| Root Directory | `genie` |
| Framework Preset | Vite |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | 不需要 |

`genie/vercel.json` 已经设好：

- `cleanUrls`：网址是 `/wish`、`/quiz`、`/studio`（不带 `.html`）；
- `/assets/*` 长缓存（文件名带指纹，更新后不会拿到旧的）、基本的安全头；
- 只有 `genie/` 改了才重新部署。

上线后的网址（`<网址>` = Vercel 给的域名，或在 Settings → Domains 绑定自己的）：

| 网址 | 给谁 / 放哪里 |
|---|---|
| `https://<网址>/wish` | **展厅 iPad 主屏幕图标** —— 客户许愿模式 |
| `https://<网址>/` | 入口页（员工）：许愿模式大按钮、两个功能、本机蓝图 |
| `https://<网址>/quiz` | 许愿之旅（客人自己的手机、分享链接） |
| `https://<网址>/studio` | 3D 梦想工作室（设计师电脑） |
| `https://<网址>/studio?demo=1` | 展厅大屏 / 电视 演示 |
| 任何网址加 `?lang=en` | 直接用英文打开 |

---

## 二、展厅 iPad（客户许愿模式）

### 1. 主屏幕图标 = `/wish`

1. 用 **Safari** 打开 `https://<网址>/wish`；
2. 分享按钮 → **添加到主屏幕**（Share → Add to Home Screen），名字会是「WISH 许愿」，图标是暮色里的金色神灯（`public/apple-touch-icon.png`）；
3. 以后都从这个图标打开：全屏、没有网址栏。

> 不要再把 `/quiz?from=…` 放主屏幕（旧做法）：许愿模式的音乐、员工区、下一位客人都在 `/wish` 里。
> 陪同人：`/wish` 用这台 iPad 上次在入口页选的陪同人（团队只有一个人时自动选这一位）。

打开后是开场画面：客人点「**中文开始**」或「**Begin in English**」—— 这一下同时开音乐、全屏、保持屏幕常亮。

### 2. 声音

- 音量调到约 60–70 %（或接一个小音箱）。**不需要耳机**：夫妻和销售要听得到彼此。
- iPadOS 17 以上，侧边的静音开关不会让许愿模式没声音；更旧的系统请确认没开静音。
- 声音被系统暂停时（来电、切去别的 App、锁屏回来），左下角的音乐胶囊会变成「**轻触继续音乐**」，碰一下就回来；客人在页面上随便点一下也会接上。
- 音乐会自己变：许愿时跟着每一关换情绪，揭晓之后渐弱（蓝图约 50 %、3D 约 25 %），蓝图 / 3D 10 分钟没人碰再淡到很小，一碰就回来。颂钵、风铃默认关（`src/shared/config.js` 的 `CONFIG.wishLayers`）。

### 3. 不锁屏、不打扰

| 要做的 | 中文系统 | English iPadOS |
|---|---|---|
| 永不自动锁屏（**保持插电**） | 设置 → 显示与亮度 → 自动锁定 → **永不** | Settings → Display & Brightness → Auto-Lock → **Never** |
| 通知不弹出来 | 控制中心 → 专注模式 → **勿扰模式** | Control Centre → Focus → **Do Not Disturb** |
| 关掉低电量模式（会让屏幕常亮失效） | 设置 → 电池 → 低电量模式 → 关 | Settings → Battery → Low Power Mode → Off |

许愿模式自己也会请求「屏幕常亮」（Wake Lock），但系统设定优先，所以上面三项一定要设。

### 4. 引导式访问（Guided Access）—— 客人出不去

**设一次：**
设置 → 辅助功能 → 引导式访问 → 打开；「密码设置」里设一个员工密码；「显示自动锁定」选 **永不**。
（Settings → Accessibility → Guided Access → On → Passcode Settings → Set Guided Access Passcode；Display Auto-Lock → Never）

**每天开始：** 从主屏幕打开 WISH → **连按三下顶部按钮**（有 Home 键的 iPad：连按三下 Home 键）→ 左上角「选项」里：
顶部按钮 **关**、音量按钮 **开**、触摸 **开**、时间限制 **关** → 右上角「开始」。

**结束：** 连按三下 → 输入密码 → 结束。

### 5. 员工区（客人看不到）

**长按 WISH 字标约 3 秒**（许愿之旅、蓝图在左下角，3D 页在右下角），一圈金线画满就打开：

| 按钮 | 做什么 |
|---|---|
| 下一位客人 | 清空这一位的进度和称呼、取消静音、音乐回到平静。在许愿之旅 / 蓝图页**不重新载入**（展厅断网也能用）；在 3D 页才重新载入。 |
| 设计师版 | 在蓝图页打开设计师版（谈话提示、色号、出图关键词…）。许愿模式里**只有这里**能打开。 |
| 结束许愿模式 | 音乐 1.5 秒淡出、放开屏幕常亮、退出全屏，回到入口页（本机蓝图默认折叠）。 |
| 语言 | 中文 / English，音乐不会断。 |

客人中途走开：许愿进行中 3 分钟没人碰，潘吉会问「还在吗？」，再 30 秒没回应就自动换下一位客人。
蓝图页和 3D 页**不会**自动清空（设计师可能对着讲很久），只把音乐淡到很小。时间在 `CONFIG.idle` 改。

### 6. 每天的清单

- **开店**：插上充电线 → 从主屏幕打开 WISH → 连按三下开始引导式访问 → 放在展台上，等客人选语言。
- **每位客人之后**：员工区 → 下一位客人（客人自己走开也会自动重来）。
- **关店**：员工区 → 结束许愿模式 → 连按三下结束引导式访问。
- 客人的蓝图存在这台 iPad 上（最多 200 份），在入口页「员工 · 本机蓝图」里看 / 删除；打开的是设计师版（`?staff=1`），不要当着客人打开。

### 网络

第一次打开要网络。之后「下一位客人」不需要网络；进 3D、换语言会重新载入页面，需要网络。

---

## 三、设计师电脑

- 打开 `https://<网址>/studio`；第一次用「AI 识别平面图」时，在 ⚙️ 设置里填 Gemini key（只存在那台电脑的浏览器里）。
- 客人的档案：蓝图页「在 3D 里看见它」会带着档案进来；或者 WhatsApp 收到的链接（带 `?staff=1`，打开就是设计师版）。

## 四、展厅大屏 / 电视

- 打开 `https://<网址>/studio?demo=1`：示范户型自动环绕 + 一天的光影，**永远不显示客人的名字**。
- 浏览器全屏：Chrome 按 F11（Mac：⌃⌘F）；想开机就是演示，可以用 kiosk 方式启动：
  `chrome --kiosk "https://<网址>/studio?demo=1"`
- 退出演示：长按左下角 WISH 字标 1.5 秒，或按 Esc。
- 把电脑的睡眠、屏保关掉。

---

## 五、放上有授权的风景照片

许愿之旅每一关背后是一处马来西亚 / 四川的风景（`/wish` 的开场也用第一张）。没有照片的那一关会显示代码画的风景。

1. 照片必须有授权（自己拍的、买了授权的，或免费授权并写上摄影师）；
2. 放进 `genie/public/scenes/`，用场景 id 命名：`welcome` · `intuition` · `life` · `treasure` · `wishes` · `nogo` · `dusk`
   - 大图 `<id>.webp`（约 2000 px 宽，< 400 KB）+ 小图 `<id>-sm.webp`（约 1200 px），WebP、质量 70–80、去掉 EXIF；
3. 在 `genie/src/quiz/scenes.js` 对应的条目填 `photo`、`photoSm`、`photoW`、`credit`、`focus`（每个字段的意思写在那个文件最上面）；
4. 部署后在 iPad 上走一遍：竖屏两边会被裁掉，重点不对就调 `focusPortrait`。

---

## 六、其他托管 / 本地预览

`npm run build` 之后，把 `genie/dist/` 整个放到任何静态托管（Netlify、Cloudflare Pages、自己的服务器）。
托管不支持 cleanUrls 也没关系：`/wish.html`、`/quiz.html`、`/studio.html` 一样能用（页面之间的链接都带 `.html`）。

```bash
cd genie
npm install
npm run dev       # http://localhost:5173/  /wish.html  /quiz.html  /studio.html
npm test          # 纯函数测试 + 中英词典完整性
npm run build     # 生产构建到 dist/
npm run preview   # 本机预览 dist/
```
