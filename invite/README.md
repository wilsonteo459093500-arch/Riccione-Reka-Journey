# RICCIONE REKA JOURNEY

溪岸 · 邀约体验网站

给「WhatsApp 聊上 → 填需求卡 → 做初步方案 → 发邀请函 → 客人到馆」这条动线做的一套静态网页。
纯 HTML / CSS / JS，没有构建步骤、没有后端 —— 丢到任何静态托管上就能用。

```
客户在 WhatsApp 聊上
      ↓
① brief.html    客户需求卡（客户填，3 分钟）
      ↓          填完 → 内容自动回到销售的 WhatsApp
销售读需求卡 → visi.html（VISI）做一版初步方案（导出 PDF）
      ↓
② index.html    邀请函（带客人姓名 · 日期 · 邀请人）
      ↓
客人到馆
```

`create.html` 是销售端的内部工具，一次填资料，同时生成上面两条链接和对应的 WhatsApp 文案。
`visi.html` 是 **VISI by RICCIONE REKA** —— 做初步方案（moodboard proposal）与跟进文案的工具，见下面「VISI」。

---

## 三个页面

| 文件 | 给谁 | 做什么 |
|---|---|---|
| `brief.html` | 客户 | 6 组问题的需求卡：联络方式 · 房产 · 定制范围与风格 · 家庭与生活习惯 · 预算与决策 · 到馆时段。填完打开 WhatsApp，内容已经排版好，客户按发送即可。 |
| `index.html` | 客户 | 邀请函。封面写着客人的名字 → 谢谢信 → 关于我们 → 60 分钟流程 → 这场体验会带走什么 → 9 步停车指引 → 结尾。中英双语可切换。 |
| `create.html` | 销售（内部） | 生成上面两条链接 + WhatsApp 文案。已加 `noindex`，但仍建议不要外发。 |
| `visi.html` | 销售（内部） | 贴需求卡 → 自动排好 A4 方案（封面 · 一页看懂 · 你说的我们做的 · 平面图 · 逐个空间 · 到馆邀约）→ 导出 PDF；同时写好 6 则文案。 |

---

## VISI by RICCIONE REKA（`visi.html`）

**网址：<https://visi-riccione-reka.vercel.app>**（同 TORA 的做法：独立的 Vercel 项目，打开就是 VISI）。
手机上「加入主画面」会出现 V 图标与「VISI」。

把「做一份 proposal」从几个小时缩到十分钟。整套在浏览器里跑，没有后端。

**销售的做法**

1. 收到需求卡 → 打开 `visi.html` → **＋ 新方案** → 把 WhatsApp 上的整段需求卡贴进 ①。
   客户名字、楼盘、要做的空间、风格方向、需求、方便到馆的时段，全部自动带出；每个空间自动配好图与卖点。
   （内置图库没有玄关 / 浴室的照片 —— 这两个空间先到「图库」拖旧 proposal PDF 或上传。示范方案不会被覆盖：在示范上贴需求卡会自动新建一份。）
2. ② 选风格方向（对应溪岸五个系列），配色 / 材质改成真实板材色号。
3. ③ 每个空间换图、勾卖点、写一句「为你」（亲手挑过的图，换风格时不会被洗掉）。④ 上传平面图，点一下放编号。
   ⑤ 确认到馆时段（按需求卡自动建议的时段，要按「已确认留好」）与「为他们准备的三样」。客户回「2」就按「客户选了时段 2」。
4. 右上角 **体检** 全绿（字太多放不下的页会先自动缩小，还放不下体检会提醒）→ **导出 PDF**（打印对话框选「另存为 PDF」，A4 横向，档名已带客户名）。
5. ⑥ 文案：发方案 → 邀约到馆 → 没回跟进 → 到馆前提醒 → 60 秒讲解稿 → AI 润色提示词，复制或一键 WhatsApp。

**页序为什么这样排**（《快思慢想》）：封面就写客户名字（WhatsApp 预览只显示第 1 页）→ 一页看懂（先给完整、连贯的感觉）
→ 用客户原话的「你说的 · 我们做的」→ 平面图编号 → 每个空间一张主图 + 最多两张辅图 → 品牌只占一页 → 最后一页是已经留好的到馆时段与二维码（峰终定律）。

**图库**

- 内置：`assets/img/cases/` 里溪岸自家的空间照（`assets/js/visi/data.js` 的 `MB.BUILTIN`，`rooms` 决定自动配图配到哪个空间）。
- 自己的图：在「图库」上传，或**把以前做好的 proposal PDF 拖进去** —— 会用 pdf.js 取出原图，按页面标题（FOYER / KITCHEN …）自动分好空间。
- 图库与方案都存在**这台电脑的浏览器（IndexedDB）**，不上传、不进 git。换电脑 / 给同事：图库页的「导出图库」「导出这份方案」存成 `.json`，再导入。
- 这个 repo 是公开的：客户的平面图、名字、网上找的参考图都**不要**放进 `assets/`，留在浏览器图库里就好。

**要改的东西都在 `assets/js/visi/data.js`**：空间与卖点（`MB.ROOMS`）、五个风格的配色与材质（`MB.DIRECTIONS`）、
需求卡选项对应的说法（`MB.NEEDS`）、内置图库（`MB.BUILTIN`）。文案写法：标题说「得到什么」，理由用「少一个麻烦」的说法，不编数字。

**二维码**：邀约页的二维码就是邀请函链接，网址取自 `config.js` 的 `publicBase`（邀请函的正式网址）。
所以不管 VISI 在哪里打开（visi-riccione-reka.vercel.app、自己的电脑），客户扫到的都是正式邀请函。

`assets/vendor/` 里是 pdf.js（Apache-2.0，只在导入 PDF 时才载入）与 qrcode-generator（MIT）。

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

整个 `invite/` 由 Vercel 项目 **`visi-riccione-reka`** 部署：Root Directory = `invite`，Framework = Other，
没有 Build Command；开了「Skip unaffected projects」与 Ignored Build Step `git diff --quiet HEAD^ HEAD -- .`
—— `invite/` 没改就不部署，省每天 100 次的部署额度。同一份部署挂两个网址：

```
https://journey-riccione-reka.vercel.app/?for=Mr%20Tan&on=2026-08-25   邀请函（发给客户）
https://journey-riccione-reka.vercel.app/brief                         需求卡（发给客户）
https://journey-riccione-reka.vercel.app/create                        销售端
https://visi-riccione-reka.vercel.app                                  VISI（首页直接打开）
```

`invite/vercel.json` 里有一条只对 `visi-riccione-reka.vercel.app` 生效的 rewrite：那个网址的首页 `/` 是 VISI；
其它网址（journey）的首页仍然是邀请函。`cleanUrls` 已开，路径里不会出现 `.html`。

> 因为 VISI 的网址首页就是 VISI，客户的链接**不能**用这个网址 —— 所以 `create.js` 与 VISI 生成链接时都用
> `config.js` 的 `publicBase`（现在是 `https://journey-riccione-reka.vercel.app`）。换邀请函的域名，只改这一行。
> 邀请函与需求卡的 `og:image` 也写成这个网址的绝对路径，WhatsApp 预览才会出图。

**旧网址：** 以前邀请函挂在根目录项目 `wilson-pidc` 底下（`wilson-pidc.vercel.app/invite/…`，build 时把 `invite/`
复制进 `dist/invite/`）。根目录 `vercel.json` 已设 `git.deploymentEnabled: false`：`wilson-pidc` 不再自动部署、
不再占额度，但最后一版仍在线 —— 已经发出去的旧邀请函链接和首页的 Delivery OS 都还打得开，只是不会再更新。

有自己的域名之后，在 Vercel 的 Domains 里接上去（例如 `journey.riccione.com.my`），再把 `publicBase` 改成它。

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
