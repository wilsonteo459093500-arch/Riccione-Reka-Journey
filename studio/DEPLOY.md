# CIPTA STUDIO · 上线指南

纯前端，没有数据库、没有环境变量。第一次上线约 5 分钟，之后每次 push 到 `main` 自动重新部署。

---

## 0) 先决条件：代码必须在 `main` 上

> ⚠️ **这是最容易卡住的一步。**
> Vercel 导入项目时，**Root Directory 那个目录下拉框读的是仓库的默认分支（`main`）**。
> 如果 `studio/` 还只存在于某个功能分支上，下拉框里就是找不到它 —— 不是你操作错了。

确认方法：在 GitHub 上把分支切到 `main`，能看到 `studio/` 文件夹就没问题。

---

## 1) 在 Vercel 新建一个独立项目

这个 repo 里有四个各自独立部署的 app（Delivery OS 在根目录、CRM、UKIR STUDIO、CIPTA STUDIO），
所以要**再开一个** Vercel 项目指向 `studio/` 子目录。

> Vercel 免费版（Hobby）**每个 repo 最多可连 25 个项目**（2026 年 6 月从 10 提上来的），
> 四个 app 完全够用，不会因为数量被拦。

1. 打开 <https://vercel.com/new>
2. 选 GitHub repo `wilsonteo459093500-arch/Wilson` → **Import**
3. **Configure Project** 页面：

   | 字段 | 填什么 |
   |---|---|
   | **Project Name** | `cipta-studio`（随便起，决定默认网址） |
   | **Framework Preset** | 自动检测为 **Vite**，不用改 |
   | **Root Directory** | 点 **Edit** → 选 **`studio`** ⚠️ **最关键的一步** |
   | Build Command | 留空（默认 `npm run build`） |
   | Output Directory | 留空（默认 `dist`） |
   | Environment Variables | **一个都不用填** |

4. 点 **Deploy**，等约 1 分钟

拿到 `cipta-studio-xxxx.vercel.app` 打开，看到首页就是成功了。

**如果 Root Directory 选错**（比如留在根目录），部署出来的会是 Delivery OS 而不是 Cipta Studio。
到 Project → Settings → Build & Deployment → Root Directory 改成 `studio`，再 Redeploy 一次即可。

---

## 2) 每个使用者自己配 API key

网站不替任何人保管 key —— 打开网站的人各自配自己的，只存在自己那台设备上。

1. 打开 <https://aistudio.google.com/apikey>（Google 账号登录）
2. **Create API key** → 复制
3. 在网站右上角「配置 API key」粘贴 → 「测试连接」→ 保存

**顺手把「品牌上下文」也填了**（设置里第二块）——
品牌是什么、客户是谁、语气怎样。填一次，之后每一次拆解、排剪辑、写文案都会自动带上，
这是让输出「像你」而不是像通用模板的关键。

登录账号密码和 **UKIR STUDIO**（原 Render 效果图）是同一套。

---

## 3) 绑自己的域名（可选）

默认的 `xxx.vercel.app` 就能用。想换成自己的域名：

1. Vercel 项目 → **Settings** → **Domains** → **Add**
2. 填域名，比如 `cipta.riccionereka.com`
3. 到域名注册商的 DNS 后台加一条记录：

   | 情况 | 记录类型 | 名称 | 值 |
   |---|---|---|---|
   | 子域名（推荐） | `CNAME` | `cipta` | `cname.vercel-dns.com` |
   | 根域名 | `A` | `@` | `76.76.21.21` |

   > 根域名不能用 CNAME（DNS 规范限制），只能用 A 记录。
   > 加之前先把原来指向别处的旧 A 记录删掉。

4. 等 DNS 生效（一般 15–30 分钟），Vercel 显示 **Valid Configuration**，
   HTTPS 证书自动签发，不用管

**建议用子域名**。四个 app 各占一个，一眼看得出归属：

```
cipta.riccionereka.com    → CIPTA STUDIO（内容）
ukir.riccionereka.com     → UKIR STUDIO（效果图）
crm.riccionereka.com      → Sail CRM
```

---

## 4) 费用

Vercel 托管本身免费（Hobby 版对这种流量绰绰有余）。真正花钱的是 AI 调用，按量计费、没有月费：

| 动作 | 大约 |
|---|---|
| 拆一条参考视频 | US$0.01–0.05（越长越贵） |
| 标注一条素材 | ~US$0.005 |
| 排一次剪辑 / 写一次发布包 / 跑一次趋势 | ~US$0.01 |
| 生成一张封面图 | ~US$0.04 |

正常用一天几毛钱。用量在 Google AI Studio 后台看，也可以设配额上限。

---

## 5) 出片这一步在本地做

网站负责想清楚怎么剪，真正渲染在你自己电脑上跑（浏览器不适合跑 ffmpeg）。
第一次需要装一次 video-use：

```bash
git clone https://github.com/browser-use/video-use ~/Developer/video-use
ln -sfn ~/Developer/video-use ~/.claude/skills/video-use
cd ~/Developer/video-use && uv sync
brew install ffmpeg
cp .env.example .env      # 填 ELEVENLABS_API_KEY（转写用）
```

然后每条片子：把素材放一个文件夹 → 从网站下载 `edl.json` 和 `master.srt` 放进去 →
在该目录开 `claude` → 粘贴网站给的交接指令。

不想碰命令行的话，用「复制 Vyra 指令」那条路，在浏览器里搞定。

---

## 常见问题

| 症状 | 原因 / 解法 |
|---|---|
| **Root Directory 下拉框里没有 `studio`** | 代码还没进 `main`。见上面第 0 节 |
| 部署出来是 Delivery OS 不是 Cipta Studio | Root Directory 没设成 `studio`，改完 Redeploy |
| 测试连接失败 / 403 | key 复制不完整；或该地区需要在设置 → 高级里填中转接口地址 |
| 提示限流 (429) | 免费 key 每分钟额度很小。等一分钟再试，或去 AI Studio 开按量付费 |
| 传大视频后提示「改用本地抽帧分析」 | 正常降级。浏览器拿不到 Google 的上传地址（CORS），改成本机抽 18 帧。代价是听不到声音，跟声音有关的判断会标「推测：」 |
| 视频打不开 / 读不到时长 | 转成 mp4 (H.264) 再传。浏览器对某些手机原生格式（如部分 HEVC）支持不全 |
| 重开项目后预览是空的 | 存档不存原始视频（太大）。把原文件再拖进来就恢复了 |
| 换设备看不到项目 | 项目存在本机 IndexedDB，不跨设备。重要方案记得下载分镜表 |
