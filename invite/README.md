# RICCIONE REKA JOURNEY

溪岸 · 邀约体验网站

给「WhatsApp 聊上 → 填需求卡 → 做初步方案 → 发邀请函 → 客人到馆」这条动线做的一套静态网页。
纯 HTML / CSS / JS，没有构建步骤、没有后端 —— 丢到任何静态托管上就能用。

```
客户在 WhatsApp 聊上
      ↓
① brief.html    客户需求卡（客户填，3 分钟）
      ↓          填完 → 内容自动回到销售的 WhatsApp
销售读需求卡 → 做一版初步方案
      ↓
② index.html    邀请函（带客人姓名 · 日期 · 邀请人）
      ↓
客人到馆
```

`create.html` 是销售端的内部工具，一次填资料，同时生成上面两条链接和对应的 WhatsApp 文案。

---

## 三个页面

| 文件 | 给谁 | 做什么 |
|---|---|---|
| `brief.html` | 客户 | 6 组问题的需求卡：联络方式 · 房产 · 定制范围与风格 · 家庭与生活习惯 · 预算与决策 · 到馆时段。填完打开 WhatsApp，内容已经排版好，客户按发送即可。 |
| `index.html` | 客户 | 邀请函。封面写着客人的名字 → 谢谢信 → 关于我们 → 60 分钟流程 → 这场体验会带走什么 → 9 步停车指引 → 结尾。中英双语可切换。 |
| `create.html` | 销售（内部） | 生成上面两条链接 + WhatsApp 文案。已加 `noindex`，但仍建议不要外发。 |

---

## 怎么用（销售）

1. 打开 `create.html`，第一次填一下「我是谁」（姓名 / 职称 / WhatsApp），浏览器会记住。
2. **刚聊上客户** → 填客户称呼和他的 WhatsApp → 复制①的文案，或直接点「用 WhatsApp 发送」。
3. **客户填完需求卡**，内容会以文字形式发到你的 WhatsApp。读完，做一版初步方案。
4. **约好时间之后** → 回到 `create.html` 填日期时间，在「给客户的一句话」里写下邀请的理由
   （例：「您提到厨房永远收不干净 —— 我们照着您的平面图画了三种做法」）→ 发②邀请函。

> 那一句话会印在邀请信里。有理由的邀请，和「欢迎参观」是两件事。

---

## 配置

只需要改 `assets/js/config.js`：

```js
host:       { name, role, wa }   // 默认邀请人（链接没带参数时用）
briefInbox: '60189661919'        // 需求卡送到哪个 WhatsApp
venue:      { address, hours, phone }
team:       [...]                // 团队成员
briefEndpoint: ''                // 选填，见下
```

### 需求卡要不要存进数据库

默认只走 WhatsApp（客户按发送，你在手机上收到文字）。
想同时存一份，把 `briefEndpoint` 填上任何接受 JSON POST 的地址即可 ——
Formspree、Supabase Edge Function、Google Apps Script 都行。送出时会 POST：

```json
{ "host": "Wilson Teo", "submittedAt": "…", "text": "整段文字", "data": { "name": "…", "budget": "…" } }
```

失败不会打断客户，WhatsApp 那条路照走。

---

## 链接参数

**邀请函** —— 由 `create.html` 生成。参数都是可读的短词，链接里不会出现电话号码、
中文乱码（`%E5%A5%B3%E5%A3%AB` 那种），也不会有 base64：

```
/invite?for=Peggy&title=ms&on=2026-08-26
```

| 参数 | 意思 | 例 |
|---|---|---|
| `for` | 客人称呼 | `Peggy` |
| `title` | 称谓代号 | `mr` `ms` `mrs` `miss` `teacher` `designer`（直接写中文也认） |
| `on` `at` | 日期 · 时间 | `2026-08-26` `15:00`（14:00 是默认值，会省略） |
| `mins` | 时长，默认 60 | `90` |
| `from` | 邀请人代号，取自 `config.js` 的 `team[].code` | `wilson` |
| `note` | 印在信里的那一句话（勾选才会带上） | |
| `open=1` | 跳过封面动画，预览用 | |

**需求卡** `/invite/brief?from=wilson&for=Peggy`

`from` 决定填完之后送到谁的 WhatsApp。名单在 `config.js` 的 `team`，
不在名单里的人会自动退回 `by=姓名&wa=号码` 的长格式 —— 所以新同事记得加一行。

旧的短参数（`n` `t` `d` `h` `by` `wa` `msg`）和 `?i=<base64>` 都还认得，发出去的旧链接不会失效。

---

## 部署

**现在就能打开的：** 根目录的 `npm run build` 会把整个 `invite/` 原样复制进 `dist/invite/`
（见 `package.json` 的 build script），所以 root 那个 Vercel 项目每次部署都会带上这套页面：

```
<部署网址>/invite/index.html    邀请函
<部署网址>/invite/brief.html    需求卡
<部署网址>/invite/create.html   销售端
```

不用改 Vercel 任何设置。等要用自己的域名（例如 invite.riccione.com.my）再按下面开独立项目。

**独立部署（推荐，链接才好看）**

在 Vercel 新建一个 project：

| 设置 | 值 |
|---|---|
| Project Name | `riccione-reka-journey` |
| Root Directory | `invite` |
| Framework Preset | Other |
| Build Command | 留空 |

出来的网址就是 `riccione-reka-journey.vercel.app`，链接长这样：

```
riccione-reka-journey.vercel.app/?for=Mr%20Tan&on=2026-08-25    邀请函
riccione-reka-journey.vercel.app/brief                          需求卡
riccione-reka-journey.vercel.app/create                         销售端
```

有自己的域名之后，在 Vercel 的 Domains 里接上去（例如 `journey.riccione.com.my`）就更干净。
`invite/vercel.json` 已经开了 `cleanUrls`，所以路径里不会出现 `.html`。

其它选择：Netlify（publish directory 填 `invite`）、GitHub Pages、自己的服务器 —— 整个目录丢进去就行。

本地预览：

```bash
cd invite && python3 -m http.server 8899
# 打开 http://localhost:8899/create.html
```

部署后记得在 `index.html` 里把 `og:image` 换成绝对网址，WhatsApp 的链接预览才会出图。

---

## 换作品 / 案例

邀请函「关于我们」里的五个系列是可以点开的 —— 点一下打开灯箱，左右翻看，手机上可以滑动。

**现在放的是公司手册里各系列的空间实例，不是马来西亚的真实交付案例。**
等你们有客户家的实拍照，换掉会更有说服力。做法：

1. 把照片放进 `assets/img/cases/`（宽度 1000px、JPEG 质量 ~76 就够）
2. 打开 `assets/js/cases.js`，改 `window.SAIL_CASES` 这个数组：

```js
{
  slug: 'skeleton',                     // 随便取，只要不重复
  zh: '骨骼线', en: 'Skeleton Line',     // 卡片标题
  tagZh: '古典与现代的对话', tagEn: '…',  // 标题下那行小字
  descZh: '…', descEn: '…',
  photos: [
    { src: 'skeleton-1.jpg', zh: '主卧 · 通顶衣柜与过道', en: '…' },   // 第一张是封面
    …                                                                // 想放几张放几张
  ]
}
```

系列本身也可以整组换成「XX 花园 · 三房单位」这类真实案例 —— 结构一样，卡片数量自动跟着数组走。

---

## 换素材

- 照片在 `assets/img/`（`steps/` 是 9 步停车指引，`brand/` 是标志与导航二维码）。
  换同名文件即可，建议宽度 ≤ 1600px、JPEG 质量 ~78。
- 文案直接改 HTML。中英文分别写在 `<span class="zh">` / `<span class="en">` 里，
  语言切换只是显示其中一组。
- 颜色 · 字体在 `assets/css/invite.css` 顶部的 `:root` 变量里。

素材来自 *Riccione Company Profile 2026* 与 *RICCIONE Parking Directory*。
