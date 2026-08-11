# 溪岸 · 邀约体验网站 Invitation Suite

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

**邀请函** `index.html?i=<base64>`，由 `create.html` 生成。也可以手写明文参数调试：

| 参数 | 意思 | 例 |
|---|---|---|
| `n` | 客人称呼 | `陈志明` |
| `t` | 称谓 | `先生` |
| `d` `h` | 日期 · 时间 | `2026-08-20` `14:00` |
| `dur` | 时长（分钟） | `60` |
| `by` `role` `wa` | 邀请人姓名 · 职称 · WhatsApp | |
| `msg` | 印在信里的那一句话 | |
| `open=1` | 跳过封面动画（预览用） | |

例：`index.html?n=陈志明&t=先生&d=2026-08-20&h=14:00`

**需求卡** `brief.html?by=Wilson%20Teo&wa=60189661919&n=陈志明`
（`wa` = 需求卡送到哪个号码，会盖过 config 里的 `briefInbox`）

---

## 部署

静态站，任选其一：

- **Vercel / Netlify**：把 `invite/` 设为 root directory，无需 build command。
- **GitHub Pages**：把 `invite/` 推上去，Settings → Pages 选对应目录。
- **自己的服务器**：整个目录丢进去就行。

本地预览：

```bash
cd invite && python3 -m http.server 8899
# 打开 http://localhost:8899/create.html
```

部署后记得在 `index.html` 里把 `og:image` 换成绝对网址，WhatsApp 的链接预览才会出图。

---

## 换素材

- 照片在 `assets/img/`（`steps/` 是 9 步停车指引，`brand/` 是标志与导航二维码）。
  换同名文件即可，建议宽度 ≤ 1600px、JPEG 质量 ~78。
- 文案直接改 HTML。中英文分别写在 `<span class="zh">` / `<span class="en">` 里，
  语言切换只是显示其中一组。
- 颜色 · 字体在 `assets/css/invite.css` 顶部的 `:root` 变量里。

素材来自 *Riccione Company Profile 2026* 与 *RICCIONE Parking Directory*。
