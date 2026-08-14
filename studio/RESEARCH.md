# 工具调研 · AI 视频生产这条链上有什么

2026-08 调研。目标是回答一个问题：**「上传一条参考视频 + 我的原片/案例图 → 出成片」这件事，现在能做到什么程度？**

结论先说：**没有任何一个工具能端到端做完**，但把它们串起来可以。缺的那一环恰恰是「理解参考视频 → 变成可执行的剪辑决策」——
这正是本 repo 里 [`/studio`](./) 补上的。

---

## 1. video-use — 最接近「丢素材出成片」

- 仓库：<https://github.com/browser-use/video-use>（browser-use 团队，100% 开源）
- 一句话：把原片丢进一个文件夹，跟 Claude Code 说「剪成一条发布视频」，拿回 `edit/final.mp4`。

**流水线**

```
Transcribe ──> Pack ──> LLM Reasons ──> EDL ──> Render ──> Self-Eval
                                                             │
                                                    有问题？修 + 重渲（最多 3 轮）
```

**它做对的地方（我们直接沿用了它的规范）**

| 规则 | 为什么重要 |
|---|---|
| 转写用词级时间戳，切点吸附到词边界 | 切在词中间，人耳立刻听出来「这条是剪过的」 |
| 静音 ≥400ms 最干净；150–400ms 要看画面；<150ms 不安全 | 给了「哪里能切」一个可判定的标准，不靠感觉 |
| 每个切点 30ms 音频淡入淡出 | 不加就爆音 |
| 逐段抽取时调色，再无损 `-c copy` 拼接 | 拼完再整体调色会把不同曝光的片段压成一个平均值 |
| 字幕**最后**烧，用输出时间轴偏移 | 先烧字幕会被后加的叠加层盖住 |
| 保住高峰：笑声、punchline、满足感的那一下要留够 | 剪太干净会把情绪一起剪掉 |

**EDL 格式**（`/studio` 的导出严格对齐这个 schema）

```json
{
  "version": 1,
  "sources": { "C0103": "/abs/path/C0103.MP4" },
  "ranges": [{ "source": "C0103", "start": 2.42, "end": 6.85, "beat": "HOOK", "quote": "…", "reason": "…" }],
  "grade": "warm_cinematic",
  "overlays": [{ "file": "edit/animations/slot_1/render.mp4", "start_in_output": 0.0, "duration": 5.0 }],
  "subtitles": "edit/master.srt",
  "total_duration_s": 87.4
}
```

**装**

```bash
git clone https://github.com/browser-use/video-use ~/Developer/video-use
ln -sfn ~/Developer/video-use ~/.claude/skills/video-use
cd ~/Developer/video-use && uv sync && brew install ffmpeg
cp .env.example .env      # 填 ELEVENLABS_API_KEY（转写用）
```

**局限** — 它是「执行 + 打磨」的高手，但**不会看参考视频**。你得自己说清楚要剪成什么样。

---

## 2. HyperFrames — 写 HTML，出 MP4

- 仓库：<https://github.com/heygen-com/hyperframes>（HeyGen 出品，**Apache-2.0**，无按次渲染费）
- 一句话：把网页当视频写。定义 HTML + CSS + 可 seek 的动画，逐帧在无头 Chrome 里 seek，交给 FFmpeg 编码。

```bash
npx hyperframes init my-video
npx hyperframes preview   # 浏览器实时预览
npx hyperframes render    # 出 MP4
```

需要 Node 22+ 和 FFmpeg。可以纯本地跑，也可以走 AWS Lambda 分布式渲染。

**关键点：动画必须可 seek。** 支持 GSAP / CSS / Lottie / Three.js / Anime.js / Web Animations API。
「可 seek」是确定性渲染的前提 —— 同样的输入必须出同样的视频。

**合成用 data 属性描述时间轴**：`data-composition-id` / `data-start` / `data-duration` / `data-track-index`，`class="clip"` 标记有时间的元素。

**给 agent 装 skill**

```bash
npx skills add heygen-com/hyperframes --full-depth
```

**最适合**：动态图文帖、标题卡、下三分之一字幕条、数据动画、透明 WebM 叠加层。
`/studio` 的「动态图文帖」直接导出这种合成文件 —— 用的是纯 CSS 动画，所以**双击用浏览器打开也能正确播放**。

---

## 3. Whisper 系 — 词级时间戳的地基

上面那条「切点吸附到词边界」的规则，前提是你有词级时间戳。选型看硬件：

| 方案 | 适合 | 说明 |
|---|---|---|
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Apple Silicon | C++ 移植，支持 Metal，Mac 上首选 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | NVIDIA GPU | CTranslate2 实现，比原版快 4–8 倍，精度不变；批处理 API 一分钟能吃掉几小时音频 |
| [WhisperX](https://github.com/m-bain/whisperX) | 要词级时间戳 + 说话人分离 | faster-whisper + wav2vec2 对齐 + pyannote 分离，一条龙 |
| ElevenLabs Scribe | 图省事 | video-use 默认用它，要 API key，要钱 |

两种实现拿时间戳的方式不同：whisper.cpp 用模型自身的 attention 推时间，faster-whisper 继承同样思路但可以接对齐器。
**要精度就用 WhisperX**（它多一层强制对齐）。

**`/studio` 里为什么没直接跑 Whisper**：网站用 Gemini 的原生音频理解一次拿到转写 + 视觉分析，省掉在浏览器里下 200MB 模型。
需要真正精确的词级时间戳时，那一步交给 video-use 在本地做 —— 它本来就要做这一步。

---

## 4. claude-code-video-toolkit — 讲解型视频那条路

- 仓库：<https://github.com/digitalsamba/claude-code-video-toolkit>
- 一句话：Remotion（React 写视频）+ ElevenLabs 配音 + 品牌系统，主打产品演示 / 教程 / 讲解视频。

9 个 skill，命令包括 `/setup` `/video` `/scene-review` `/design` `/brand` `/template` `/publish`。
流水线：脚本 → 素材 → 场景审查（Remotion Studio 里看）→ 配音 → 调整 → `npm run render`。

```
toolkit/
├── .claude/     skills & slash commands
├── lib/         共享组件、转场、主题系统
├── templates/   预制视频结构
├── brands/      品牌视觉档案
└── projects/    你的项目（gitignored）
```

也有另一个同名实现：<https://github.com/wilwaldon/Claude-Code-Video-Toolkit>（覆盖 Remotion / Manim / 录屏 / YouTube 切片 / FFmpeg 后期）。

**跟我们的关系**：适合做「讲解全屋定制怎么选板材」这种口播 + 图形的视频。
真实案例的实拍剪辑还是走 video-use 更顺。

---

## 5. Vyra — 顺带发现的第五块

本 repo 的 Claude Code 会话里已经挂着 **Vyra 的 MCP server**（浏览器里的 AI 剪辑器）。
它原生支持「参考视频」概念，而且明确区分三类素材：

- **参考视频** — 只作灵感，指导调性/节奏/结构，**永远不进时间线**
- **项目素材** — 用户真正的素材，可直接进时间线
- **素材库** — 跨项目的媒体库，要先 `addAssetToProject` 才能用

调色注意：**Lumetri Color 已退役**，新的调色走 `color-wheels`。
`/studio` 导出的 Vyra 指令已经按这个写了。

**适合**：不想碰命令行、想边看边改的时候。

---

## 怎么串起来

```
                    ┌─────────────────────────────┐
   参考视频 ───────▶│  /studio  「构思」            │
                    │  拆解 → 配方（结构/节奏/      │
                    │  调色/字幕/素材清单）         │
                    └──────────────┬──────────────┘
                                   │
   你的原片 + 案例图 ──────────────▶│  /studio  「剪辑」
                    ┌──────────────▼──────────────┐
                    │  素材标注 → 排时间轴 →       │
                    │  edl.json / master.srt /     │
                    │  分镜表 / 交接指令            │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────┬───────┴────┬──────────────┐
              ▼            ▼            ▼              ▼
        video-use    HyperFrames   CC Toolkit       Vyra
        实拍剪辑      动态图形       讲解视频        手动微调
              └────────────┴────────────┴──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  /studio  「发布」            │
                    │  标题/正文/标签/封面/评论     │
                    └─────────────────────────────┘
```

**为什么中间那层非有不可**：
video-use 会剪，但不知道要剪成什么样；HyperFrames 会渲，但不知道渲什么。
「看懂一条参考视频，把它翻译成对着**你手上这些素材**的具体指令」—— 这一环之前是空的，得靠人。
`/studio` 补的就是这一环。

---

## 参考

- [browser-use/video-use](https://github.com/browser-use/video-use) · [SKILL.md](https://github.com/browser-use/video-use/blob/main/SKILL.md)
- [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)
- [digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) · [wilwaldon/Claude-Code-Video-Toolkit](https://github.com/wilwaldon/Claude-Code-Video-Toolkit)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) · [faster-whisper](https://github.com/SYSTRAN/faster-whisper) · [WhisperX](https://github.com/m-bain/whisperX)
- [jordanrendric/claude-video-vision](https://github.com/jordanrendric/claude-video-vision) — 给 Claude 加「看视频」能力的插件，抽帧 + 多模态音频分析
