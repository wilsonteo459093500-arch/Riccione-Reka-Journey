# CIPTA STUDIO · 部署指南 (Vercel)

纯前端，不需要 Supabase，5 分钟上线。

## 1) 在 Vercel 创建独立项目

> 现有 repo 已经有 Delivery OS、CRM、Render 三个 Vercel 项目。Studio 是第四个独立 app，
> 要**再开一个** Vercel 项目指向 `studio/` 子目录。

1. 打开 <https://vercel.com/new>
2. 选择 GitHub repo `wilsonteo459093500-arch/Wilson` → **Import**
3. **Configure Project** 页面：
   - **Project Name**: `riccione-studio`（随便起）
   - **Framework Preset**: 自动检测为 **Vite**
   - **Root Directory**: 点 **Edit** → 选 **studio** ⚠️ 最关键的一步
   - Build Command / Output Directory 保持默认
4. 不需要任何环境变量，直接 **Deploy**

拿到网址后打开，看到登录页即部署成功。账号密码和「溪岸 Render」是同一套。

## 2) 每个使用者自己配 API key

1. 打开 <https://aistudio.google.com/apikey>（Google 账号登录）
2. **Create API key** → 复制
3. 在 app 右上角「配置 API key」粘贴 → 「测试连接」→ 保存

key 只存在各自设备的浏览器里；换设备 / 换浏览器要重新粘贴一次。

**顺手把「品牌上下文」也填了**（设置里第二块）——
品牌是什么、客户是谁、语气怎样。填一次，之后每一次拆解、排剪辑、写文案都会自动带上，
这是让输出「像你」而不是像通用模板的关键。

## 3) 费用

按量计费，没有月费：

| 动作 | 大约 |
|---|---|
| 拆一条参考视频 | US$0.01–0.05（越长越贵） |
| 标注一条素材 | ~US$0.005 |
| 排一次剪辑 / 写一次发布包 / 跑一次趋势 | ~US$0.01 |
| 生成一张封面图 | ~US$0.04 |

正常用一天几毛钱。用量在 Google AI Studio 后台看，也可以设配额上限。

## 4) 出片这一步在本地做

Studio 负责想清楚怎么剪，真正渲染在你自己电脑上跑（浏览器不适合跑 ffmpeg）。
第一次需要装一次 video-use：

```bash
git clone https://github.com/browser-use/video-use ~/Developer/video-use
ln -sfn ~/Developer/video-use ~/.claude/skills/video-use
cd ~/Developer/video-use && uv sync
brew install ffmpeg
cp .env.example .env      # 填 ELEVENLABS_API_KEY（转写用）
```

然后每条片子：把素材放一个文件夹 → 下载 `edl.json` 和 `master.srt` 放进去 →
在该目录开 `claude` → 粘贴 Studio 给的交接指令。

不想装命令行的话，用「复制 Vyra 指令」那条路，在浏览器里搞定。

## 常见问题

- **测试连接失败 / 403** → key 复制不完整，或该地区需要在设置 → 高级里填中转接口地址
- **提示限流 (429)** → 免费 key 每分钟额度很小。等一分钟再试，或去 AI Studio 开按量付费
- **上传大视频后提示「改用本地抽帧分析」** → 正常。浏览器拿不到 Google 的上传地址（CORS），
  自动降级成本机抽 18 帧。代价是听不到声音，跟声音有关的判断会标「推测：」
- **视频打不开 / 读不到时长** → 转成 mp4 (H.264) 再传。浏览器对某些手机原生格式（如部分 HEVC）支持不全
- **重开项目后预览是空的** → 存档不存原始视频（太大）。把原文件再拖进来就恢复了
- **换设备看不到项目** → 项目存在本机 IndexedDB，不跨设备。重要方案记得下载分镜表
