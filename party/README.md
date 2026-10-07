# 张丞鹤 DUDU · 未来首富一岁生日 · 干爹干妈召集会

DUDU 一岁生日的邀请函网站：会动的搞笑邀请函 + 线上回复（RSVP）+ 主人专用名册。

```
朋友在 WhatsApp 收到链接
      ↓
index.html   邀请函：拆信封 → DUDU 照片标注 → 时间地点 → 回复会不会来
      ↓      回复存进 Vercel Blob（没接存储时自动改成 WhatsApp 发给 Wilson）
host.html    主人名册：谁会来、几个大人几个小孩、饮食需求、建议餐量、导出 Excel
```

纯 HTML / CSS / JS，不用 build；后端只有两个 Vercel Function（`api/`）。

---

## 页面

| 网址 | 给谁 | 做什么 |
|---|---|---|
| `/` | 朋友 | 邀请函。`?to=名字` 会把名字写在封面上并预填回复表格；`?lang=en` 直接开英文版。 |
| `/host` | Wilson | 名册（要主人密码）。人数统计、饮食需求、名单、删除测试数据、复制名单到 WhatsApp、下载 CSV、生成每位朋友的专属链接。 |

---

## 上线（第一次，大约 5 分钟）

### 1) 新建 Vercel 项目

> 代码要先合并到 `main`，Vercel 的目录选择器才看得到 `party/`。

1. 打开 <https://vercel.com/new> → 选这个 repo → **Import**
2. **Project Name**：`dudu-party`（决定网址：`dudu-party.vercel.app`）
3. **Root Directory**：点 **Edit** → 选 **`party`** ⚠️ 最关键
4. **Framework Preset**：Other；Build Command 留空
5. **Deploy**

### 2) 接存储（让回复存进名册）

1. 项目页 → **Storage** → **Create Database** → 选 **Blob**
2. 名字随便（例 `dudu-rsvp`），**Access 选 Private**，区域选 **Singapore (sin1)**
3. **Connect** 到 `dudu-party` 项目（环境变量会自动加好）

### 3) 设主人密码

项目页 → **Settings** → **Environment Variables** → 加：

| Name | Value |
|---|---|
| `PARTY_HOST_KEY` | 自己定一个密码（建议 8 位以上，别用生日） |

### 4) Redeploy

**Deployments** → 最新那条右边 `⋯` → **Redeploy**。环境变量要重新部署才生效。

### 5) 试一次

1. 打开 `https://dudu-party.vercel.app/?to=测试` → 拆信 → 回复一次
2. 打开 `https://dudu-party.vercel.app/host` → 输入主人密码 → 看到「测试」那条 → 删掉

> **项目名不是 `dudu-party`？** 把 `assets/js/config.js` 的 `siteUrl` 和 `index.html` 里
> `og:image` / `og:url` 的网址改成你的网址，WhatsApp 链接预览才会出图。

---

## 还没接存储会怎样？

邀请函照样能用：客人按「确认」后，会打开 WhatsApp，回复内容已经排版好，发到 `config.js` 里的
`host.wa`。只是名册页看不到这些人 —— 你要自己数。接好存储之后就全自动。

---

## 改资料

只改 `assets/js/config.js`：

```js
host:   { name: 'Wilson', wa: '60163881919' }   // WhatsApp 后备号码（016-388 1919）
event:  { start, end, dateZh, timeZh, venueZh, address, … }
rsvpBy: '2026-11-07'                             // 请大家几号前回复（留空就不显示）
siteUrl: 'https://dudu-party.vercel.app'
```

文案直接改 `index.html`：中文在 `<span class="zh">`，英文在 `<span class="en">`。

---

## 本机预览 / 测试

```bash
cd party
npm install
npm run dev          # http://localhost:8787 ，主人密码 dev，回复存在 party/.data/
npm test             # API 测试
PARTY_NO_STORE=1 npm run dev   # 模拟没接存储 → 测 WhatsApp 后备
```

---

## 资料与隐私

- 每一户回复是一份独立的 JSON（`rsvp/<id>.json`），存在你自己 Vercel 账号的 Blob（Private）。
- 邀请函页面只拿得到「几户、几个人」这种数字，看不到名字；完整名单要主人密码。
- 整站加了 `noindex`，不会被 Google 收录（地址在页面上）。
- 客人在同一支手机再打开邀请函，可以修改自己的回复（不会重复计算）。
