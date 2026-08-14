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

  return `我要剪一条短视频。下面是已经排好的完整方案，请用 video-use 帮我渲染出来。

## 0. 前置

素材都在当前目录：
${files}

如果还没装 video-use：
\`\`\`bash
git clone https://github.com/browser-use/video-use ~/Developer/video-use
ln -sfn ~/Developer/video-use ~/.claude/skills/video-use
cd ~/Developer/video-use && uv sync && brew install ffmpeg
cp .env.example .env   # 填 ELEVENLABS_API_KEY
\`\`\`

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

我已经把这份时间轴导成了 \`edl.json\`（和这段提示一起给你）。**请直接用它**，不要重新做剪辑决策 ——
你要做的是执行 + 打磨：

1. 先跑 \`transcribe_batch.py\` 拿到词级时间戳，把上面每个 in/out **吸附到最近的词边界**（不要切在词中间），
   前后各留 30–80ms 余量。
2. 按 \`edl.json\` 的 ranges 逐段抽取，**每段单独调色**（不要 concat 之后整体调），然后无损 \`-c copy\` 拼接。
3. 每个切点加 30ms 音频淡入淡出：\`afade=t=in:st=0:d=0.03,afade=t=out:st={dur-0.03}:d=0.03\`
4. 静图部分（见 \`_studio.stills\`）用 ffmpeg zoompan 做缓推，再插进对应 slot。
5. 叠加动画（见 overlays）——用 HyperFrames 做透明 WebM，PTS 位移 \`setpts=PTS-STARTPTS+T/TB\`。
6. **字幕最后烧**，用 \`master.srt\`，输出时间轴偏移 \`output_time = word.start - segment_start + segment_offset\`。
7. 渲完自检：在每个切点用 \`timeline_view\` 检查画面跳变、音频爆音、字幕遮挡，最多返工 3 次。

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
