// 导出 —— 把「剪辑方案」翻译成各条渲染流水线真正吃得下的格式。
//
//   toEDL          → video-use 的 edl.json（转写→EDL→ffmpeg 出片）
//   toSRT          → 标准字幕，任何剪辑软件都能拖进去
//   toShotList     → 人看的分镜表（Markdown），可以直接发给摄影/剪辑
//   toHyperFrames  → HTML 合成文件，逐帧渲染成 MP4（动态图文帖 / 标题卡）
//   toClaudePrompt → 贴进 Claude Code 就能开跑的完整交接指令
//   toVyraPrompt   → 贴给 Vyra（MCP 实时剪辑器）的操作指令

import { gradeById, captionStyleById, beatById } from '../constants.js';

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 文件名 → EDL 里的 source key（去掉扩展名和不安全字符） */
function sourceKey(name, fallback) {
  const base = String(name || fallback || 'CLIP').replace(/\.[^.]+$/, '');
  const clean = base.replace(/[^\w一-龥-]/g, '_').slice(0, 40);
  return clean || fallback || 'CLIP';
}

/** 1.5 → "00:00:01,500" */
function srtTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
}

const dur = (row) => Math.max(0.1, (Number(row.out) || 0) - (Number(row.in) || 0));

/** 每一拍在成片时间轴上的起点 */
export function withOutputTimes(timeline = []) {
  let t = 0;
  return timeline.map((row) => {
    const d = dur(row) / (Number(row.speed) || 1);
    const out = { ...row, output_start: Number(t.toFixed(2)), output_duration: Number(d.toFixed(2)) };
    t += d;
    return out;
  });
}

export function planDuration(timeline = []) {
  return withOutputTimes(timeline).reduce((sum, r) => sum + r.output_duration, 0);
}

// ---------------------------------------------------------------------------
// video-use edl.json
// ---------------------------------------------------------------------------

/**
 * @param {object} plan
 * @param {Array} assets [{id, kind, name}]
 * @param {object} [opts] { dir: 素材所在目录，用于拼绝对路径 }
 */
export function toEDL(plan, assets, opts = {}) {
  const dir = (opts.dir || '.').replace(/\/+$/, '');
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));

  const sources = {};
  const ranges = [];
  const stills = [];

  (plan.timeline || []).forEach((row) => {
    const a = byId[row.assetId];
    if (!a) return;
    const key = sourceKey(a.name, a.id);

    if (a.kind === 'image') {
      // 静图不是 ffmpeg 的可裁剪源，单独列出来，由渲染端做 Ken Burns 后再入轨
      stills.push({
        slot: row.slot,
        file: `${dir}/${a.name}`,
        duration: Number(dur(row).toFixed(2)),
        motion: row.reframe || 'slow push-in 8%',
        beat: row.beat,
        onscreen_text: row.onscreen_text || '',
      });
      return;
    }

    sources[key] = `${dir}/${a.name}`;
    ranges.push({
      source: key,
      start: Number((Number(row.in) || 0).toFixed(2)),
      end: Number((Number(row.out) || 0).toFixed(2)),
      beat: row.beat,
      quote: row.vo || row.onscreen_text || '',
      reason: row.why || '',
      ...(Number(row.speed) && Number(row.speed) !== 1 ? { speed: Number(row.speed) } : {}),
    });
  });

  const timed = withOutputTimes(plan.timeline || []);
  const overlays = (plan.overlays || []).map((o, i) => {
    const anchor = timed.find((r) => r.slot === o.after_slot);
    return {
      file: `edit/animations/slot_${o.after_slot ?? i + 1}/render.mp4`,
      start_in_output: Number(((anchor?.output_start ?? 0) + (anchor?.output_duration ?? 0)).toFixed(2)),
      duration: Number((o.duration_s || 2).toFixed(2)),
      _text: o.text || '',
      _style: o.style || '',
      _engine: o.engine || 'hyperframes',
    };
  });

  return {
    version: 1,
    sources,
    ranges,
    grade: plan.grade_preset || 'warm_cinematic',
    overlays,
    subtitles: 'edit/master.srt',
    total_duration_s: Number(planDuration(plan.timeline).toFixed(1)),
    // 下划线开头的字段是本工作台附加的上下文，video-use 会忽略，但人和 agent 看得懂
    _studio: {
      summary: plan.summary || '',
      aspect: plan.aspect || '9:16',
      stills,
      music: plan.music || null,
      cover: plan.cover || null,
      qc: plan.qc || [],
      gaps: plan.gaps || [],
    },
  };
}

// ---------------------------------------------------------------------------
// 字幕
// ---------------------------------------------------------------------------

export function toSRT(captions = []) {
  return (
    captions
      .filter((c) => (c.text || '').trim())
      .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text.trim()}\n`)
      .join('\n') || ''
  );
}

/** 没有 captions 时，用时间轴上的 onscreen_text / vo 顶一份 */
export function captionsFromTimeline(timeline = []) {
  return withOutputTimes(timeline)
    .map((r) => ({
      start: r.output_start,
      end: Number((r.output_start + r.output_duration).toFixed(2)),
      text: (r.onscreen_text || r.vo || '').trim(),
    }))
    .filter((c) => c.text);
}

// ---------------------------------------------------------------------------
// 分镜表（人看的）
// ---------------------------------------------------------------------------

export function toShotList(plan, assets, recipe) {
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const timed = withOutputTimes(plan.timeline || []);
  const g = gradeById(plan.grade_preset);

  const rows = timed
    .map((r) => {
      const a = byId[r.assetId];
      const b = beatById(r.beat);
      return [
        `### ${r.slot}. [${b.label}] ${r.output_start.toFixed(1)}s → ${(r.output_start + r.output_duration).toFixed(1)}s（${r.output_duration.toFixed(1)}s）`,
        '',
        `- **素材**：${a ? `${a.name}（${a.kind === 'image' ? '静图' : `视频 ${Number(r.in).toFixed(1)}–${Number(r.out).toFixed(1)}s`}）` : `⚠️ 缺素材 ${r.assetId}`}`,
        r.speed && r.speed !== 1 ? `- **变速**：${r.speed}×` : null,
        r.reframe ? `- **画幅 / 运动**：${r.reframe}` : null,
        r.onscreen_text ? `- **屏幕文字**：${r.onscreen_text}` : null,
        r.vo ? `- **口播**：${r.vo}` : null,
        r.sfx ? `- **音效**：${r.sfx}` : null,
        `- **进点转场**：${r.transition_in || 'cut'}`,
        r.why ? `- **为什么这么剪**：${r.why}` : null,
        r.risk ? `- ⚠️ **风险**：${r.risk}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const gaps = (plan.gaps || [])
    .map((g2) => `- **缺 [${beatById(g2.beat).label}]**：${g2.need}\n  - 怎么补：${g2.how_to_shoot}\n  - 补不了：${g2.workaround || '—'}`)
    .join('\n');

  return `# 分镜表 · ${recipe?.title || plan.summary?.slice(0, 20) || '未命名'}

> ${plan.summary || ''}

**成片时长** ${planDuration(plan.timeline).toFixed(1)}s ｜ **画幅** ${plan.aspect || '9:16'} ｜ **调色** ${g.label}

---

## 时间轴

${rows || '（空）'}

${gaps ? `---\n\n## 还缺的素材\n\n${gaps}\n` : ''}
${
  plan.music
    ? `---\n\n## 音乐\n\n- **要什么**：${plan.music.brief || ''}\n- **搜索词**：${(plan.music.search_terms || []).join(' / ')}\n- **卡点**：${(plan.music.cut_points_s || []).map((s) => `${s}s`).join(' · ')}\n`
    : ''
}
${
  plan.cover
    ? `---\n\n## 封面\n\n- **创意**：${plan.cover.concept || ''}\n- **大字**：${plan.cover.title_text || ''}\n- **副标**：${plan.cover.subtitle || ''}\n- **出图 prompt**：\n\n\`\`\`\n${plan.cover.prompt || ''}\n\`\`\`\n`
    : ''
}
${plan.qc?.length ? `---\n\n## 出片后逐条检查\n\n${plan.qc.map((q) => `- [ ] ${q}`).join('\n')}\n` : ''}`;
}

// ---------------------------------------------------------------------------
// HyperFrames HTML 合成
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * 生成一个 HyperFrames 合成文件。
 * 直接双击也能在浏览器里预览（用的是标准 CSS 动画）；
 * 交给 `npx hyperframes render` 则逐帧渲染成确定性 MP4。
 *
 * @param {object} storyboard animatedPostPrompt 的输出
 * @param {object} [opts] { width, height, fps }
 */
export function toHyperFrames(storyboard, opts = {}) {
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const fps = opts.fps || 30;
  const pal = storyboard.palette || {};
  const bg = pal.bg || '#F5F1EA';
  const ink = pal.ink || '#1A1614';
  const accent = pal.accent || '#2D4A3E';

  // 先算好每屏的起止，才能生成「只在自己那一段可见」的关键帧
  const slides = (storyboard.slides || []).map((s, i) => {
    const d = Math.max(0.3, Number(s.duration_s) || 2.2);
    return { ...s, _i: i, _d: d };
  });
  let cursor = 0;
  slides.forEach((s) => {
    s._start = cursor;
    cursor += s._d;
  });
  const total = Math.max(0.5, cursor);

  // 每屏一段 opacity 关键帧：所有 clip 共用同一条 total 秒的时间线，各自只在窗口内显形。
  // 这样单独用浏览器打开也能正确播放，同时保持可 seek（HyperFrames 逐帧渲染的前提）。
  const pct = (t) => Math.min(100, Math.max(0, (t / total) * 100));
  const keyframes = slides
    .map((s) => {
      const a = pct(s._start);
      const b = pct(s._start + s._d);
      const stops = [
        a > 0 ? `0%, ${(a - 0.001).toFixed(3)}% { opacity: 0 }` : null,
        `${a.toFixed(3)}% { opacity: 1 }`,
        b < 100 ? `${(b - 0.001).toFixed(3)}% { opacity: 1 }` : `100% { opacity: 1 }`,
        b < 100 ? `${b.toFixed(3)}%, 100% { opacity: 0 }` : null,
      ].filter(Boolean);
      return `  @keyframes clip-${s._i + 1} { ${stops.join(' ')} }`;
    })
    .join('\n');

  const clips = slides
    .map((s) => {
      const i = s._i;
      const chars = [...esc(s.headline || '')]
        .map((ch, ci) => `<span style="--i:${ci}">${ch === ' ' ? '&nbsp;' : ch}</span>`)
        .join('');

      return `  <!-- slide ${i + 1} · ${esc(s.layout || '')} -->
  <div class="clip" data-start="${s._start.toFixed(2)}" data-duration="${s._d.toFixed(2)}" data-track-index="0"
       style="--t0:${s._start.toFixed(2)}s; animation-name: clip-${i + 1}">
    <div class="bg ${s.bg_kind === 'gradient' ? 'grad' : ''}"${
        s.bg_kind === 'image' && s.image_prompt
          ? ` data-image-prompt="${esc(s.image_prompt)}" style="background-image:var(--img-${i + 1},none)"`
          : ''
      }></div>
    <div class="frame">
      <div class="kicker">${String(i + 1).padStart(2, '0')}</div>
      <h1 class="headline">${chars}</h1>
      ${s.sub ? `<p class="sub">${esc(s.sub)}</p>` : ''}
      <div class="rule"></div>
    </div>
  </div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(storyboard.title || 'Animated Post')}</title>
<!--
  HyperFrames 合成文件 —— 由 CIPTA STUDIO 生成
  预览：npx hyperframes preview     渲染：npx hyperframes render
  直接用浏览器打开这个文件也能看动画（CSS 动画是可 seek 的，符合 HyperFrames 的要求）。
  字体、配图请在 assets/ 里替换成品牌资产后重渲。
-->
<style>
  :root {
    --bg: ${bg};
    --ink: ${ink};
    --accent: ${accent};
    --pad: ${Math.round(width * 0.09)}px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: var(--bg); }

  #composition { position: relative; width: ${width}px; height: ${height}px; }

  /* 每个 clip 只在自己的时间窗口内可见 —— 关键帧在下面按屏生成 */
  .clip {
    position: absolute; inset: 0; opacity: 0;
    animation-duration: ${total.toFixed(2)}s;
    animation-timing-function: linear;
    animation-fill-mode: both;
    animation-iteration-count: 1;
  }
  .bg { position: absolute; inset: 0; background: var(--bg) center/cover no-repeat; }
  .bg.grad { background: linear-gradient(160deg, var(--bg) 0%, color-mix(in srgb, var(--accent) 18%, var(--bg)) 100%); }

  .frame {
    position: absolute; inset: 0;
    padding: var(--pad);
    display: flex; flex-direction: column; justify-content: flex-end;
    gap: ${Math.round(width * 0.028)}px;
  }

  /* 屏内元素的入场都相对本屏起点 (--t0) 延迟，否则会在第 0 秒全部跑完 */
  .kicker {
    font: 600 ${Math.round(width * 0.032)}px/1 "DM Sans", system-ui, sans-serif;
    letter-spacing: .32em; color: var(--accent); opacity: .75;
    animation: fadeUp .5s cubic-bezier(.22,1,.36,1) both;
    animation-delay: var(--t0);
  }

  .headline {
    font: 700 ${Math.round(width * 0.096)}px/1.18 "Fraunces", Georgia, serif;
    color: var(--ink); letter-spacing: -.01em;
  }
  .headline span {
    display: inline-block;
    animation: charIn .52s cubic-bezier(.22,1,.36,1) both;
    animation-delay: calc(var(--t0) + var(--i) * .035s + .1s);
  }

  .sub {
    font: 400 ${Math.round(width * 0.038)}px/1.5 "DM Sans", "Noto Sans SC", system-ui, sans-serif;
    color: color-mix(in srgb, var(--ink) 62%, transparent);
    animation: fadeUp .6s cubic-bezier(.22,1,.36,1) both;
    animation-delay: calc(var(--t0) + .38s);
  }

  .rule {
    height: ${Math.max(3, Math.round(width * 0.005))}px; background: var(--accent); border-radius: 99px;
    transform-origin: left center;
    animation: wipe .7s cubic-bezier(.22,1,.36,1) both;
    animation-delay: calc(var(--t0) + .5s);
  }

  @keyframes charIn { from { opacity: 0; transform: translateY(.5em) } to { opacity: 1; transform: none } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }
  @keyframes wipe   { from { transform: scaleX(0) } to { transform: scaleX(1) } }

  /* 每屏的显隐窗口 */
${keyframes}
</style>
</head>
<body>
<div id="composition"
     data-composition-id="${esc((storyboard.title || 'post').toLowerCase().replace(/\s+/g, '-'))}"
     data-width="${width}" data-height="${height}" data-fps="${fps}"
     data-duration="${total.toFixed(2)}">
${clips}
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// 交接给 Claude Code（video-use / HyperFrames / CC Toolkit）
// ---------------------------------------------------------------------------

export function toClaudePrompt(plan, assets, recipe, opts = {}) {
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const timed = withOutputTimes(plan.timeline || []);
  const g = gradeById(plan.grade_preset);
  const c = captionStyleById(plan.caption_style);

  const shots = timed
    .map((r) => {
      const a = byId[r.assetId];
      const src = a ? (a.kind === 'image' ? `${a.name}（静图，${r.reframe || '缓推 8%'}）` : `${a.name} ${Number(r.in).toFixed(2)}–${Number(r.out).toFixed(2)}s`) : `⚠️ 缺 ${r.assetId}`;
      return `${String(r.slot).padStart(2, ' ')}. [${r.beat}] ${r.output_start.toFixed(1)}s +${r.output_duration.toFixed(1)}s  ← ${src}${r.onscreen_text ? `\n     字幕：${r.onscreen_text}` : ''}${r.vo ? `\n     口播：${r.vo}` : ''}`;
    })
    .join('\n');

  const files = [...new Set(assets.map((a) => a.name))].map((n) => `  - ${n}`).join('\n');

  // 全静图的方案不能套实拍流水线：没有源音频就没有词级时间戳，
  // 「吸附词边界 / 逐段抽取 ranges / 切点音频淡入淡出」三步全部落空，
  // agent 照着跑会去找不存在的东西，然后开始瞎凑。
  const usesVideo = timed.some((r) => byId[r.assetId]?.kind === 'video');
  const usesStills = timed.some((r) => byId[r.assetId]?.kind === 'image');
  const stillsOnly = usesStills && !usesVideo;

  // 所有镜头都来自同一条素材 —— 观众三四个镜头就会认出来，得先提醒
  const uniqueSources = new Set(timed.map((r) => r.assetId).filter((id) => byId[id]));
  const singleSource = uniqueSources.size === 1 && timed.length >= 4;

  const steps = stillsOnly
    ? `我已经把这份时间轴导成了 \`edl.json\`（和这段提示一起给你）。**请直接用它**，不要重新做剪辑决策 ——
你要做的是执行 + 打磨。

⚠️ **这条片子里没有任何视频素材，全部是静图。**所以 video-use 那套「转写 → 吸附词边界 → 逐段抽取」
**完全不适用**：没有源音频可转写，\`edl.json\` 的 \`ranges\` 是空的，全部内容在 \`_studio.stills\`。
不要去跑 \`transcribe_batch.py\`，不要找不存在的音轨。**其实这条用 ffmpeg 直接做就够了，不需要 video-use。**

1. 每个 slot 用 \`zoompan\` 从静图生成一段，按 \`_studio.stills\` 里的 motion 描述做运镜。
   **缓动必须是 ease-out-cubic，不能匀速** —— 匀速平移是「一眼假」最主要的来源。
   zoompan 默认线性，要用 \`if(...)\` 表达式或分段 \`z\` 曲线手动做缓动。
2. **每段单独调色**（${g.id}），再 concat。不要 concat 之后整体调。
3. 配乐：按下面第 3 节的搜索词找一条，**按卡点时间戳对齐**。这条片子的节奏完全靠音乐撑，
   因为画面本身没有真实的时间变化。
4. 口播：${timed.some((r) => r.vo) ? '文案已经写好但**没有录音**。要么你自己录，要么用 TTS（ElevenLabs 等）生成后混进去。没有配音的话，这条只能靠字幕。' : '无口播。'}
5. 叠加动画（见 overlays）——用 HyperFrames 做透明 WebM，PTS 位移 \`setpts=PTS-STARTPTS+T/TB\`。
6. **字幕最后烧**，用 \`master.srt\`。
7. 渲完自检：逐个切点看画面跳变、字幕遮挡、缓动曲线是否生硬。最多返工 3 次。`
    : `我已经把这份时间轴导成了 \`edl.json\`（和这段提示一起给你）。**请直接用它**，不要重新做剪辑决策 ——
你要做的是执行 + 打磨：

1. 先跑 \`transcribe_batch.py\` 拿到词级时间戳，把上面每个 in/out **吸附到最近的词边界**（不要切在词中间），
   前后各留 30–80ms 余量。
2. 按 \`edl.json\` 的 ranges 逐段抽取，**每段单独调色**（不要 concat 之后整体调），然后无损 \`-c copy\` 拼接。
3. 每个切点加 30ms 音频淡入淡出：\`afade=t=in:st=0:d=0.03,afade=t=out:st={dur-0.03}:d=0.03\`
${usesStills ? '4. 静图部分（见 `_studio.stills`）用 ffmpeg zoompan 做缓推，缓动用 ease-out-cubic，再插进对应 slot。\n' : ''}${usesStills ? '5' : '4'}. 叠加动画（见 overlays）——用 HyperFrames 做透明 WebM，PTS 位移 \`setpts=PTS-STARTPTS+T/TB\`。
${usesStills ? '6' : '5'}. **字幕最后烧**，用 \`master.srt\`，输出时间轴偏移 \`output_time = word.start - segment_start + segment_offset\`。
${usesStills ? '7' : '6'}. 渲完自检：在每个切点用 \`timeline_view\` 检查画面跳变、音频爆音、字幕遮挡，最多返工 3 次。`;

  const warning = singleSource
    ? `\n\n## ⚠️ 开工前先看这一条\n\n**这 ${timed.length} 个镜头全部来自同一条素材。**
观众通常在第 3–4 个镜头就会认出来「这是同一张图在裁来裁去」，完播率会掉得很快。
裁切、缩放、变速都改变不了这个事实 —— 它们能改变的只是「多久被认出来」。

渲之前先确认一件事：**这条片子的核心承诺，靠现有素材撑得起来吗？**
如果承诺是「前后对比」但你手上只有「后」，那么无论怎么剪，观众要的那一半都不存在。
${(plan.gaps || []).length ? '下面第 4 节列了缺口和顶替方案 —— 但顶替方案是用来救小缺口的，不是用来伪造核心卖点的。\n' : ''}
建议：要么补拍最关键的那 2–3 个镜头再剪，要么把选题换成现有素材撑得住的（比如「一张图看懂侘寂风的 5 个材质」——
单图讲解型，不承诺过程）。`
    : '';

  return `我要剪一条短视频。下面是已经排好的完整方案，请用 ${stillsOnly ? 'ffmpeg' : 'video-use'} 帮我渲染出来。${warning}

## 0. 前置

素材都在当前目录：
${files}

${
  stillsOnly
    ? `这条只需要 ffmpeg，不需要装 video-use：
\`\`\`bash
brew install ffmpeg
\`\`\``
    : `如果还没装 video-use：
\`\`\`bash
git clone https://github.com/browser-use/video-use ~/Developer/video-use
ln -sfn ~/Developer/video-use ~/.claude/skills/video-use
cd ~/Developer/video-use && uv sync && brew install ffmpeg
cp .env.example .env   # 填 ELEVENLABS_API_KEY（转写用）
\`\`\``
}

## 1. 成片目标

- **标题**：${recipe?.title || '未命名'}
- **格式**：${recipe?.format || ''}
- **平台 / 画幅**：${plan.aspect || '9:16'}
- **时长**：${planDuration(plan.timeline).toFixed(1)}s
- **调色**：${g.id}（${g.label} — ${g.desc}）
- **字幕**：${c.label}${c.chunk ? `，每 ${c.chunk} 字一组${c.upper ? '，英文大写' : ''}` : ''}
- **剪辑思路**：${plan.summary || ''}

## 2. 时间轴（已经排好，直接用，不要重排）

\`\`\`
${shots}
\`\`\`

${steps}

## 3. 音乐

${plan.music ? `- 要什么：${plan.music.brief}\n- 搜索词：${(plan.music.search_terms || []).join(', ')}\n- 卡点（成片时间轴）：${(plan.music.cut_points_s || []).join('s, ')}s\n- 口播下压：${plan.music.duck_under_vo_db ?? -12}dB` : '（未指定）'}

${
  plan.gaps?.length
    ? `## 4. 已知缺口\n\n下面这些镜头我手上没有素材，**不要瞎凑**。用 workaround，或者直接跳过并告诉我：\n\n${plan.gaps.map((x) => `- [${x.beat}] 缺：${x.need}\n  - 顶替方案：${x.workaround || '无'}`).join('\n')}\n`
    : ''
}
## ${plan.gaps?.length ? '5' : '4'}. 出片后请逐条确认

${(plan.qc || []).map((q) => `- [ ] ${q}`).join('\n') || '- [ ] 首帧静止可读\n- [ ] 无切在词中间\n- [ ] 字幕没被遮挡'}

输出到 \`edit/final.mp4\`。渲染前先把你的执行计划讲给我听，我确认了再开始。`;
}

/** 贴给 Vyra（浏览器里的 MCP 剪辑器）的操作指令 */
export function toVyraPrompt(plan, assets, recipe) {
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const timed = withOutputTimes(plan.timeline || []);
  const g = gradeById(plan.grade_preset);

  const shots = timed
    .map((r) => {
      const a = byId[r.assetId];
      return `${r.slot}. [${r.beat}] 放在 ${r.output_start.toFixed(1)}s，时长 ${r.output_duration.toFixed(1)}s — 用「${a?.name || r.assetId}」${
        a?.kind === 'image' ? `（静图，${r.reframe || '缓推'}）` : `的 ${Number(r.in).toFixed(1)}–${Number(r.out).toFixed(1)}s`
      }${r.onscreen_text ? `，屏幕文字「${r.onscreen_text}」` : ''}`;
    })
    .join('\n');

  return `请按下面这份已经排好的方案在时间线上搭出这条片子。素材应该都已经在项目里了 ——
先 viewProjectAssets 确认，缺的再 searchUserLibrary / addAssetToProject。

**成片目标**：${recipe?.title || ''}｜${plan.aspect || '9:16'}｜${planDuration(plan.timeline).toFixed(1)}s
**剪辑思路**：${plan.summary || ''}

**时间轴**（一次性算好所有 position，用一个 addMedia 调用批量放）：
${shots}

**调色**：全片统一 ${g.label} —— ${g.look || g.desc}。用 color-wheels（不要用已经退役的 lumetri-color），
先 loadSkill('color-grading') 再动手。

**字幕**：${captionStyleById(plan.caption_style).label}。先 loadSkill('text/captioning') 再 addCaptions。

**转场**：默认硬切；只有这几处用别的 —— ${
    timed.filter((r) => r.transition_in && r.transition_in !== 'cut').map((r) => `slot ${r.slot} 用 ${r.transition_in}`).join('；') || '无'
  }

${plan.overlays?.length ? `**叠加图形**：\n${plan.overlays.map((o) => `- slot ${o.after_slot} 之后：${o.type}「${o.text}」${o.duration_s}s，${o.style}`).join('\n')}\n先 browsePresets 找现成的，没有合适的再 loadSkill('motion-graphics') 自己做。\n` : ''}
搭完用 captureFrame 抽查 ${timed.slice(0, 3).map((r) => `${r.output_start.toFixed(1)}s`).join('、')} 这几个点，确认画面对得上再告诉我。`;
}

// ---------------------------------------------------------------------------
// 缺口补拍 —— 交给带 Higgsfield MCP 的 agent 去「生成」拍不到的镜头
// ---------------------------------------------------------------------------

/**
 * 把 plan.gaps 变成一份可以直接粘给 Claude（已连 Higgsfield MCP）的生成指令。
 *
 * 这是整条链上最省事的一环：剪辑方案本来就知道「缺哪一拍、要什么画面、多长」，
 * 这些正好就是文生视频需要的全部输入。不用再描述一遍。
 *
 * 注意：AI 生成的镜头适合做氛围空镜、抽象转场、概念画面。
 * **不要用它生成你的真实案例** —— 客户认得出自己家，做出来是假的。
 */
export function toHiggsfieldPrompts(plan, recipe) {
  const gaps = plan.gaps || [];
  if (!gaps.length) return null;

  const g = gradeById(plan.grade_preset);
  const aspect = plan.aspect || '9:16';

  const shots = gaps
    .map((gap, i) => {
      const b = beatById(gap.beat);
      return `### ${i + 1}. [${b.label}] ${gap.need}

- **画面**：${gap.how_to_shoot}
- **时长**：2–4 秒（够剪进 ${b.label} 那一拍就行）
- **画幅**：${aspect}
- **调性**：${g.look || g.desc}
- **不要**：出现人脸特写、可辨认的品牌 logo、任何看起来像"真实案例"的完整空间`;
    })
    .join('\n\n');

  return `我在剪一条${recipe?.format || '短视频'}，有 ${gaps.length} 个镜头手上没有素材、也不方便补拍。
你已经连了 Higgsfield MCP，帮我生成它们。

## 先做两件事

1. \`higgsfield_get_credits\` 看一下余额够不够
2. \`higgsfield_list_models\` 列出可用的视频模型和它们的参数

## 要生成的镜头

${shots}

## 生成要求

- **全片调性必须一致**：${g.label} — ${g.look || g.desc}。
  同一套光线、同一个色温、同样的景深感，剪在一起不能有一块特别跳。
- **优先走「先出图再动起来」**：\`higgsfield_generate_image\` 出一张定帧 → 确认构图对了 →
  再用 image2video 让它动。比直接文生视频可控得多，也省额度。
- 每个镜头**先只生成 1 条**给我看。我确认了再批量出其余的。
- 提交后用 \`higgsfield_wait_for_job\` 等结果，把最终的 URL 列给我。

## 重要边界

这些是**补空镜和氛围镜头**，不是用来伪造案例的。
如果哪个缺口本质上必须是真实项目画面（成品空间、实际工艺、客户现场），
**直接告诉我"这个得你自己去拍"，不要生成** —— 我宁可少一个镜头，也不要让客户看到假的案例。`;
}

/** video-use 的 project.md，放进 edit/ 目录做会话记忆 */
export function toProjectMd(plan, recipe, assets) {
  const today = new Date().toISOString().slice(0, 10);
  return `# ${recipe?.title || '未命名项目'}

## Session 1 — ${today}

**Strategy:** ${plan.summary || ''}

配方来源：${recipe?.format || ''}（${recipe?.one_liner || ''}）
目标：${plan.aspect || '9:16'}，${planDuration(plan.timeline).toFixed(1)}s，调色 ${gradeById(plan.grade_preset).id}

**Decisions:**
${(plan.timeline || []).map((r) => `- slot ${r.slot} [${r.beat}] 用 ${assets.find((a) => a.id === r.assetId)?.name || r.assetId}：${r.why || ''}`).join('\n')}

**Reasoning log:**
${(plan.timeline || []).filter((r) => r.risk).map((r) => `- slot ${r.slot} 风险：${r.risk}`).join('\n') || '- 无特别风险'}

**Outstanding:**
${(plan.gaps || []).map((x) => `- [${x.beat}] ${x.need} → ${x.how_to_shoot}`).join('\n') || '- 无'}
`;
}
