// 导出 —— 把「剪辑方案」翻译成各条渲染流水线真正吃得下的格式。
//
//   toEDL          → video-use 的 edl.json（转写→EDL→ffmpeg 出片）
//   toSRT          → 标准字幕，任何剪辑软件都能拖进去
//   toShotList     → 人看的分镜表（Markdown），可以直接发给摄影/剪辑
//   toHyperFrames  → HTML 合成文件，逐帧渲染成 MP4（动态图文帖 / 标题卡）
//   toClaudePrompt → 贴进 Claude Code 就能开跑的完整交接指令
//   toVyraPrompt   → 贴给 Vyra（MCP 实时剪辑器）的操作指令

import { gradeById, captionStyleById, beatById } from '../constants.js';
import { buildMotionSpec, flatTracks, waapiFrame, cssEase, selectorFor } from './motion.js';

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
 * 生成一个可逐帧渲染的合成文件。
 *
 * 关键点：这份 HTML 和网站里的实时预览读的是**同一份 spec**（services/motion.js）。
 * 预览用 anime.js 播，这里用浏览器原生的 Web Animations API 播 ——
 * 两套引擎、同一组关键帧，所以「预览看到的」就是「渲出来的」。
 *
 * 导出的文件是完全独立的：没有 CDN、没有 npm 依赖、断网也能打开。
 *
 * 三种用法：
 *   1. 双击打开        → 自动播放，直接看
 *   2. `?t=1.234`      → 精确停在第 1.234 秒，并把 body[data-ready] 置为 1
 *                        任何截图工具（Playwright / Puppeteer / HyperFrames）都能靠这个逐帧抓
 *   3. `window.seekTo(秒)` → 在控制台或渲染脚本里直接调
 *
 * @param {object} storyboard animatedPostPrompt 的输出
 * @param {object} [opts] { width, height, fps }
 */
export function toHyperFrames(storyboard, opts = {}) {
  const spec = buildMotionSpec(storyboard, opts);
  const { width, height, fps, palette, total } = spec;

  // 关键帧编译成 WAAPI 能直接吃的数组，连同选择器一起内联进文件。
  // 内联而不是运行时算，是为了让这个 HTML 打开就能跑，不依赖任何构建产物。
  //
  // fill 模式很关键，踩过一次：同一个元素上有先后两条动画时，
  // 后一条如果也用 fill:'both'，它的「反向填充」会在自己还没开始时就把
  // 起始值盖到元素上 —— 而且因为它创建得晚，合成顺序更高，直接压掉前一条。
  // 具体表现是每一屏的淡出动画（from opacity 1）让所有屏从第 0 秒就全亮着。
  //
  // 正确做法：一个元素上**最早**那条用 'both'（它负责定初始状态），
  // 后面的一律 'forwards'（只管自己开始之后的事）。
  const seen = new Set();
  const tracks = flatTracks(spec).map((t) => {
    const s = selectorFor(t);
    const first = !seen.has(s);
    seen.add(s);
    return {
      s,
      k: [waapiFrame(t.from), waapiFrame(t.to)],
      d: Math.round(t.start * 1000),
      u: Math.max(10, Math.round(t.duration * 1000)),
      e: cssEase(t.easing),
      f: first ? 'both' : 'forwards',
    };
  });

  const clips = spec.slides
    .map((s) => {
      const chars = s.chars
        .map((ch, ci) => `<span data-char="${ci}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`)
        .join('');
      const bgAttr =
        s.bgKind === 'image' && s.imagePrompt
          ? ` data-image-prompt="${esc(s.imagePrompt)}" style="background-image:var(--img-${s.index + 1},none)"`
          : '';

      return `  <!-- 第 ${s.index + 1} 屏 · ${esc(s.layout)} -->
  <div class="clip" data-slide="${s.index}"
       data-start="${s.start.toFixed(2)}" data-duration="${s.duration.toFixed(2)}" data-track-index="0">
    <div class="bg${s.bgKind === 'gradient' ? ' grad' : ''}" data-el="bg"${bgAttr}></div>
    <div class="frame">
      <div class="kicker" data-el="kicker">${String(s.index + 1).padStart(2, '0')}</div>
      <h1 class="headline">${chars}</h1>
      ${s.sub ? `<p class="sub" data-el="sub">${esc(s.sub)}</p>` : ''}
      <div class="rule" data-el="rule"></div>
    </div>
  </div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(spec.title)}</title>
<!--
  动态帖合成文件 —— 由 CIPTA STUDIO by RICCIONE REKA 生成
  ${spec.slides.length} 屏 · ${total.toFixed(2)}s · ${width}×${height} @${fps}fps

  怎么变成 MP4（三选一）：

  A) 最省事 —— 浏览器打开，用系统录屏，然后剪掉头尾
  B) HyperFrames —— 把这个文件放进项目目录，跑 npx hyperframes render
  C) 自己逐帧抓（最准，不掉帧）：

     npx playwright screenshot --viewport-size=${width},${height} \\
       "file://$PWD/${'${这个文件名}'}?t=0.033" frame_0001.png
     …循环 ${Math.round(total * fps)} 帧，然后
     ffmpeg -framerate ${fps} -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 out.mp4

  字体：想换成品牌字体，改下面 .headline / .sub 的 font-family 就行。
-->
<style>
  :root {
    --bg: ${palette.bg};
    --ink: ${palette.ink};
    --accent: ${palette.accent};
    --pad: ${Math.round(width * 0.09)}px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: var(--bg); }

  #composition { position: relative; width: ${width}px; height: ${height}px; }

  /* 初始状态全部写死在 CSS 里 —— JS 还没跑的那一帧不能闪出成品画面 */
  .clip { position: absolute; inset: 0; opacity: 0; will-change: opacity; }
  .bg { position: absolute; inset: 0; background: var(--bg) center/cover no-repeat; will-change: transform; }
  .bg.grad { background: linear-gradient(160deg, var(--bg) 0%, color-mix(in srgb, var(--accent) 18%, var(--bg)) 100%); }

  .frame {
    position: absolute; inset: 0;
    padding: var(--pad);
    display: flex; flex-direction: column; justify-content: flex-end;
    gap: ${Math.round(width * 0.028)}px;
  }

  .kicker {
    font: 600 ${Math.round(width * 0.032)}px/1 "DM Sans", system-ui, sans-serif;
    letter-spacing: .32em; color: var(--accent); opacity: 0;
    will-change: transform, opacity;
  }

  .headline {
    font: 700 ${Math.round(width * 0.096)}px/1.18 "Fraunces", Georgia, serif;
    color: var(--ink); letter-spacing: -.01em;
  }
  .headline span { display: inline-block; opacity: 0; will-change: transform, opacity, filter; }

  .sub {
    font: 400 ${Math.round(width * 0.038)}px/1.5 "DM Sans", "Noto Sans SC", system-ui, sans-serif;
    color: color-mix(in srgb, var(--ink) 62%, transparent);
    opacity: 0; will-change: transform, opacity, filter;
  }

  .rule {
    height: ${Math.max(3, Math.round(width * 0.005))}px; background: var(--accent); border-radius: 99px;
    transform-origin: left center; transform: scaleX(0); will-change: transform;
  }
</style>
</head>
<body>
<div id="composition"
     data-composition-id="${esc(spec.title.toLowerCase().replace(/\s+/g, '-'))}"
     data-width="${width}" data-height="${height}" data-fps="${fps}"
     data-duration="${total.toFixed(2)}">
${clips}
</div>
<script>
(function () {
  var DURATION = ${total.toFixed(3)};
  var FPS = ${fps};
  var TRACKS = ${JSON.stringify(tracks)};

  // 每条 track 一个 WAAPI 动画，delay 就是它在全片里的绝对起点。
  // fill:'both' 意味着 delay 之前保持 from、结束之后保持 to ——
  // 所以「把所有动画的 currentTime 设成同一个绝对时刻」就等于给整条片子 seek。
  var anims = TRACKS.map(function (t) {
    var el = document.querySelector(t.s);
    if (!el) return null;
    var a = el.animate(t.k, { delay: t.d, duration: t.u, easing: t.e, fill: t.f });
    a.pause();
    return a;
  }).filter(Boolean);

  var ms = DURATION * 1000;

  function seekTo(seconds) {
    var time = Math.max(0, Math.min(ms, seconds * 1000));
    for (var i = 0; i < anims.length; i++) anims[i].currentTime = time;
    return time / 1000;
  }
  window.seekTo = seekTo;
  window.compositionDuration = DURATION;
  window.compositionFps = FPS;

  var qs = new URLSearchParams(location.search);
  if (qs.has('t')) {
    // 逐帧渲染模式：停在指定时刻，等排版和字体稳定后再举手
    seekTo(parseFloat(qs.get('t')) || 0);
    var done = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { document.body.dataset.ready = '1'; });
      });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(done); else done();
  } else {
    // 直接打开：自己播一遍，循环
    var t0 = null;
    var tick = function (now) {
      if (t0 === null) t0 = now;
      var elapsed = ((now - t0) / 1000) % DURATION;
      seekTo(elapsed);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
</script>
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

// ---------------------------------------------------------------------------
// 静图动起来 —— 用 Seedance 的 image-to-video 替代假的 Ken Burns
// ---------------------------------------------------------------------------

/** Seedance 2.5 @ fal.ai 的按秒单价（token 计费折算） */
const SEEDANCE_RATE = { '720p': 0.473, '480p': 0.2205 };

/**
 * 把方案里的静图 slot 变成一份 Seedance image-to-video 指令。
 *
 * 为什么这条比「补缺口」更值得做：缺口是生成你**没有**的镜头（从文字凭空造），
 * 这条是让你**已经有的真实照片**动起来 —— 素材还是你自己的，只是多了运镜。
 * 对「静图多、视频少」的素材结构，这是性价比最高的一步。
 *
 * 关键：image-to-video 把图当第一帧，prompt 描述的是**运动**，不是重新描述空间。
 */
export function toSeedancePrompt(plan, assets, opts = {}) {
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const timed = withOutputTimes(plan.timeline || []);
  const stills = timed.filter((r) => byId[r.assetId]?.kind === 'image');
  if (!stills.length) return null;

  const res = opts.resolution === '480p' ? '480p' : '720p';
  const g = gradeById(plan.grade_preset);
  const totalSec = stills.reduce((s, r) => s + Math.min(12, Math.max(4, r.output_duration)), 0);
  const cost = totalSec * SEEDANCE_RATE[res];

  const shots = stills
    .map((r, i) => {
      const a = byId[r.assetId];
      // Seedance 最短 4 秒；比 4 秒短的 slot 生成后在剪辑里裁掉多余部分
      const gen = Math.min(12, Math.max(4, Number(r.output_duration.toFixed(1))));
      return `### ${i + 1}. slot ${r.slot}（成片 ${r.output_start.toFixed(1)}s，需要 ${r.output_duration.toFixed(1)}s）

- **首帧图**：\`${a.name}\`
- **生成时长**：${gen}s（Seedance 最短 4s；多出来的部分在剪辑里裁掉）
- **运动 prompt**（只描述运动，不要重新描述空间 —— 空间已经在图里了）：
  > ${r.reframe || '缓慢推近'}。${
    r.beat === 'HOOK' ? 'Start slightly wider and push in with subtle parallax. ' : ''
  }Very slow, restrained camera movement with natural parallax between foreground and background. Ambient light shifts gently. No objects change shape or position. Locked, deliberate, cinematic.
- **音频**：关闭（这条片子的声音统一在剪辑里配，生成的音频会打架）`;
    })
    .join('\n\n');

  return `我有 ${stills.length} 张真实案例照片，想用 Seedance 让它们真的动起来（而不是用 Ken Burns 假装）。

## 模型

fal.ai 上的 \`bytedance/seedance-2.5/image-to-video\` —— 把图当第一帧，生成运镜和运动。
（也可以走 Higgsfield MCP，它的模型库里就有 Seedance。）

**预估成本**：${stills.length} 个镜头共 ${totalSec.toFixed(0)} 秒 @${res} ≈ **US$${cost.toFixed(2)}**
（720p ≈ $0.47/秒，480p ≈ $0.22/秒。竖屏发社媒的话 480p 往往就够，先用 480p 试对不对，再决定要不要 720p 重出。）

## 要生成的镜头

${shots}

## 全局要求

- **调性统一**：${g.label} — ${g.look || g.desc}。所有镜头同一套光线走向和色温。
- **运动要克制**。这是家具/空间内容，不是特效片。观众要看清材质，镜头一快就全糊了。
  宁可动得不够，也不要动得太多。
- 每个镜头**先出 1 条**给我看，确认了再出其余的。

## ⚠️ 这一条是硬规矩

这些是**我自己项目的真实照片**，所以底线跟凭空生成不一样，但仍然有底线：

**可以**：视差、光线缓慢流动、窗纱轻微飘动、尘埃浮动 —— 这些不改变我做的东西。

**不可以**：柜门自己打开、五金件形状变化、木纹纹理被重新生成、家具比例漂移、
凭空多出或少掉物件。**那些不是我做的东西了。**

生成完请逐条告诉我：**每个镜头里有没有出现上面「不可以」那一类的变化？**
有的话直接标出来，我宁可这一拍退回用普通的缓推，也不要一个会被客户认出来不对劲的镜头。`;
}

// ---------------------------------------------------------------------------
// 剪映专业版操作单 —— 国内路线，不碰命令行、不花美金
// ---------------------------------------------------------------------------

/** 从 reframe 文本里抠出运镜幅度和方向；抠不到就用默认的缓推 8% */
function kenBurns(reframe) {
  const s = String(reframe || '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  const amount = m ? Math.min(40, Math.max(2, Number(m[1]))) : 8;
  const out = /拉远|拉出|pull|zoom.?out|后退/i.test(s);
  return {
    amount,
    from: out ? 100 + amount : 100,
    to: out ? 100 : 100 + amount,
    label: out ? `缓拉 ${amount}%` : `缓推 ${amount}%`,
  };
}

/**
 * 静图运镜的三点关键帧。
 *
 * 剪映的关键帧默认线性插值 —— 匀速平移是「一眼假」最主要的来源。
 * 老版本没有「右键关键帧设缓动」，所以这里用一个到处都能用的办法：
 * 中间多打一个关键帧，放在时长的 50%、但参数已经走完 85%。
 * 分段线性去逼近 ease-out-cubic（真值在 50% 处是 87.5%），肉眼分辨不出来。
 */
function easeOutKeys(kb, duration) {
  const mid = kb.from + (kb.to - kb.from) * 0.85;
  return [
    { at: 0, v: kb.from },
    { at: Number((duration * 0.5).toFixed(2)), v: Number(mid.toFixed(1)) },
    { at: Number(duration.toFixed(2)), v: kb.to },
  ];
}

/**
 * 一份可以照着点的剪映专业版操作单。
 *
 * 这不是给 AI 的 prompt —— 剪映没有 agent 接口，草稿文件从 6.0 起就加密了，
 * 社区那些改草稿的库只能对 5.9 以下或特定 Windows 版本生效，版本一升就废。
 * 所以这里走另一条路：把工作台已经算好的所有数字（分割点、关键帧数值、
 * 调色滑块、字幕时间）整理成人可以照着操作的清单。
 * 慢，但永远不会因为剪映升级而失效。
 */
export function toJianyingGuide(plan, assets, recipe) {
  const byId = Object.fromEntries(assets.map((a) => [a.id, a]));
  const timed = withOutputTimes(plan.timeline || []);
  const g = gradeById(plan.grade_preset);
  const c = captionStyleById(plan.caption_style);
  const total = planDuration(plan.timeline);
  const aspect = plan.aspect || '9:16';

  const files = [...new Set(timed.map((r) => byId[r.assetId]?.name).filter(Boolean))];

  const steps = timed
    .map((r) => {
      const a = byId[r.assetId];
      const end = r.output_start + r.output_duration;
      const head = `### 第 ${r.slot} 段 · [${beatById(r.beat).label}] 成片 ${r.output_start.toFixed(2)}s → ${end.toFixed(2)}s`;

      if (!a) return `${head}\n\n- ⚠️ 缺素材 \`${r.assetId}\` —— 先补上，或者把这一段删掉重新算后面的时间。`;

      if (a.kind === 'image') {
        const kb = kenBurns(r.reframe);
        const keys = easeOutKeys(kb, r.output_duration);
        return `${head}

- **素材**：\`${a.name}\`（静图）
- 拖到主轨，双击右侧时长框，直接输入 **${r.output_duration.toFixed(2)}s**
- **运镜：${kb.label}**（画面 > 基础 > 缩放）。播放头依次移到下面三个位置，每次改完「缩放」剪映会自动打点：
${keys.map((k) => `  - 段内 ${k.at.toFixed(2)}s → 缩放 **${k.v}%**`).join('\n')}
  > 中间那个点是用来做缓动的。只打首尾两个点＝匀速推，一眼就看出是图在动。
${r.onscreen_text ? `- **屏幕文字**：${r.onscreen_text}\n` : ''}${r.why ? `- 为什么这么剪：${r.why}\n` : ''}`;
      }

      const speed = Number(r.speed) || 1;
      return `${head}

- **素材**：\`${a.name}\`
- 拖到主轨。播放头移到 **${Number(r.in).toFixed(2)}s** 按 \`Ctrl/Cmd + B\` 分割，
  再移到 **${Number(r.out).toFixed(2)}s** 再分割一次，删掉前后两截，只留中间。
${speed !== 1 ? `- **变速**：选中这段 → 变速 > 常规变速 → **${speed}×**（勾上「智能补帧」如果是慢放）\n` : ''}${
        r.transition_in && r.transition_in !== 'cut'
          ? `- **进点转场**：${r.transition_in}（拖到这一段和上一段的接缝上，时长 0.3s 以内）\n`
          : ''
      }${r.onscreen_text ? `- **屏幕文字**：${r.onscreen_text}\n` : ''}${r.vo ? `- **口播**：${r.vo}\n` : ''}${r.sfx ? `- **音效**：${r.sfx}\n` : ''}${r.why ? `- 为什么这么剪：${r.why}\n` : ''}${r.risk ? `- ⚠️ ${r.risk}\n` : ''}`;
    })
    .join('\n');

  const gradeBlock = g.jianying
    ? `选中主轨所有片段（框选或 \`Ctrl/Cmd + A\`）→ 右侧「调节」→ 基础，按下面拉：

| 参数 | 数值 |
| --- | --- |
${Object.entries(g.jianying).map(([k, v]) => `| ${k} | ${v > 0 ? '+' : ''}${v} |`).join('\n')}

> 这套数字是照着 **${g.label}**（${g.desc}）对齐的，不是数学换算 —— 剪映只有一个全局色温，
> 做不出 ffmpeg 那种分三段调的效果。以画面为准，允许再微调 ±5。
> 调好之后可以「保存预设」，下一条片子一键套用。`
    : '这条不调色，跳过。';

  const stills = timed.filter((r) => byId[r.assetId]?.kind === 'image');

  return `# 剪映专业版操作单 · ${recipe?.title || plan.summary?.slice(0, 20) || '未命名'}

> ${plan.summary || ''}

**成片** ${total.toFixed(1)}s ｜ **画幅** ${aspect} ｜ **${timed.length} 段** ｜ **调色** ${g.label}

所有时间都是工作台算好的，照着填就行。每做完一节回来打个勾。

- [ ] 0. 建草稿
- [ ] 1. 导素材
- [ ] 2. 铺时间线（${timed.length} 段）
- [ ] 3. 调色
- [ ] 4. 字幕
- [ ] 5. 音乐
- [ ] 6. 导出

---

## 0. 建草稿

开始创作 → 右上角**比例**选 **${aspect}** → 设置里把**帧率**设 **30fps**。
先把比例定死，后面加了文字再改比例，所有文字位置都要重排。

## 1. 导素材

把这些文件拖进「媒体 > 本地」：

${files.map((f) => `- \`${f}\``).join('\n') || '- （没有素材）'}

**先别急着拖到时间线**，下一节按顺序一段一段来。

## 2. 铺时间线

${steps || '（时间轴是空的）'}

## 3. 调色

${gradeBlock}

## 4. 字幕

工作台已经导出了 \`master.srt\`，时间戳和上面的时间轴完全对得上，**不用重新对轴**：

1. 文本 → 左侧「本地字幕」→ 导入字幕文件 → 选 \`master.srt\`
   （有的版本在 文本 > 智能字幕 旁边，找不到就在文本面板里翻一下「导入」）
2. 导进来是一整条字幕轨，全选 → 右侧改样式：
   - 风格：**${c.label}**${c.chunk ? `（每 ${c.chunk} 字一组）` : ''}
   - 位置：底部往上留白，${aspect === '9:16' ? '距底边约 12%（避开平台的进度条和按钮）' : '距底边约 8%'}
   - 描边或底色二选一，别都加 —— 两个都上会很脏

> 如果你想要「一个字一个字蹦」的效果：剪映的**智能字幕 > 识别歌词**做不到，
> 要用「文本 > 花字」或者逐条手打。**这条建议直接跳过** —— 收益很小，时间花不起。

## 5. 音乐

${
  plan.music
    ? `- 要什么：${plan.music.brief}
- 在剪映「音频 > 音乐素材」里搜：${(plan.music.search_terms || []).join(' / ')}
- **卡点位置**（成片时间轴）：${(plan.music.cut_points_s || []).map((s) => `${s}s`).join(' · ') || '（未指定）'}
- 口播段落把音乐音量压到 **${plan.music.duck_under_vo_db ?? -12}dB** 左右${
        timed.some((r) => r.vo) ? '（选中音乐 → 音量，在口播那几段打关键帧压下去）' : ''
      }
- 结尾加 **1s 淡出**（音频 > 淡出时长）`
    : '（方案里没指定音乐，去「音乐素材」里挑一条节奏和片子长度对得上的）'
}

## 6. 导出

右上角导出：

- 分辨率 **1080P**｜帧率 **30**｜码率 **推荐** 或更高
- 格式 MP4，编码 H.264
- **关掉「智能补帧」和任何 AI 增强** —— 会把木纹和布纹搓糊
- 关掉片尾的剪映水印（设置 > 关闭片尾）

导出后逐条确认：

${(plan.qc || ['首帧静止时可读', '没有切在词中间', '字幕没被平台 UI 遮住']).map((q) => `- [ ] ${q}`).join('\n')}

${
  stills.length
    ? `---

## 附：这 ${stills.length} 个静图镜头，值得先去即梦生成

上面第 2 节给静图的是**关键帧缓推** —— 它是假的，画面里没有任何真实的时间变化。
你有剪映会员和国内账号，那就有一条更好的路：

1. 打开 **即梦 AI**（jimeng.jianying.com），图片生视频
2. 上传下面这些图当**首帧**，运动描述照抄
3. 生成的素材**可以直接同步到剪映**（即梦和剪映是同一家，素材库打通）
4. 回到剪映，用生成的视频替换掉对应那一段静图，关键帧就不用打了

${stills
  .map((r) => {
    const a = byId[r.assetId];
    return `- **第 ${r.slot} 段** · \`${a.name}\` · 需要 ${r.output_duration.toFixed(1)}s
  > 运动描述：${r.reframe || '缓慢推近'}。镜头极慢，前景和背景之间有轻微视差，环境光缓慢流动。物体本身不改变形状和位置。`;
  })
  .join('\n')}

**免费额度**：即梦每天有免费的生成次数；剪映会员另有权益。先拿一两个镜头试，
效果对了再批量做 —— 不要一次全生成完才发现调性不对。

### ⚠️ 这条是硬规矩

这些是**你自己项目的真实照片**。生成之后逐个检查：

- **可以**：视差、光线缓慢流动、窗纱轻微飘动、尘埃浮动
- **不可以**：柜门自己打开、五金件形状变化、木纹被重新生成、家具比例漂移、凭空多出或少掉物件

只要出现「不可以」那一类，**这一拍就退回用普通缓推**。宁可画面死一点，
也不要一个会被客户认出来不对劲的镜头。`
    : ''
}
`;
}

// ---------------------------------------------------------------------------
// Higgsfield Vibe Motion —— 文字 → 动态图形（底层是 Claude + Remotion）
// ---------------------------------------------------------------------------

/**
 * 把动态帖分镜写成一份 Vibe Motion 的生成简报。
 *
 * Vibe Motion 和这个工作台的 HTML 导出是**互补**，不是替代：
 *   - HTML 导出：你完全掌控、可无限次改、不花钱，但版式就是模板那一套
 *   - Vibe Motion：能做出图表动画、复杂排版、数据逐个蹦出来这类手写做不动的东西，
 *     而且吐出来的是 Remotion 源码，改完还能自己渲
 *
 * 所以规矩是：**能用 HTML 导出解决的就别花额度**，把 Vibe Motion 留给
 * 「数字/图表/复杂版式」这三类它明显更强的场景。
 */
export function toVibeMotionPrompt(storyboard, opts = {}) {
  if (!storyboard?.slides?.length) return null;
  const spec = buildMotionSpec(storyboard, opts);
  const { palette, total, slides } = spec;

  const screens = slides
    .map(
      (s) => `### 第 ${s.index + 1} 屏 · ${s.duration.toFixed(1)}s（${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s）

- 主文案：**${s.headline}**${s.sub ? `\n- 副文案：${s.sub}` : ''}
- 版式：${s.layout || '文字压在下三分之一，上方大面积留白'}
- 动效：${s.motion || '主文案逐字上浮淡入，随后下划线从左擦出'}
- 出场：${s.transitionOut || '与下一屏叠化'}`
    )
    .join('\n\n');

  return `帮我做一条动态图文短片。下面是已经排好的完整分镜，请照这个做，不要重新构思结构。

## 规格

- **画幅**：${spec.width}×${spec.height}（${spec.width < spec.height ? '9:16 竖屏' : '横屏'}）
- **总时长**：${total.toFixed(1)}s，${slides.length} 屏
- **帧率**：${spec.fps}fps
- **配色**：底 \`${palette.bg}\`｜字 \`${palette.ink}\`｜强调 \`${palette.accent}\`
- **字体气质**：${spec.fontFeel || '标题用衬线体（有重量、有骨架），正文用无衬线体，中文要能正常显示'}

## 分镜

${screens}

## 动效规矩（这几条比好看更重要）

1. **缓动永远不是线性的**。入场 ease-out（快进慢收），出场 ease-in。
   匀速的位移是「一眼看出是模板」的头号原因。
2. **每一屏的最终状态至少停 0.6s** 再切走。观众需要时间读完。
3. **一屏只讲一件事**。同时动的元素不超过两个。
4. 字**不要飞来飞去**。上浮、淡入、遮罩推出 —— 位移幅度控制在一个字高以内。
5. 最后一屏要能**无缝接回第一屏**，这样在社媒上循环播放不突兀。

## 交付

- 导出 **MP4**（${spec.width}×${spec.height}，${spec.fps}fps）
- **同时把 Remotion 源码给我** —— 以后换文案、换配色我要能自己改了重渲，
  不想每次都回来重新生成。

## 边界

这是家具/空间品牌的内容。**画面里不要出现任何 AI 生成的家具或室内实景** ——
背景用纯色、渐变、几何图形、材质纹理都行，但只要看起来像"一个真实的家"，就是在替我
伪造案例。真实空间的画面我自己拍。`;
}

/** 给成片里那几张标题卡 / 数据卡用的简短版 */
export function toVibeMotionOverlays(plan, recipe) {
  const overlays = plan.overlays || [];
  if (!overlays.length) return null;
  const timed = withOutputTimes(plan.timeline || []);
  const aspect = plan.aspect || '9:16';
  const g = gradeById(plan.grade_preset);

  const items = overlays
    .map((o, i) => {
      const anchor = timed.find((r) => r.slot === o.after_slot);
      const at = anchor ? (anchor.output_start + anchor.output_duration).toFixed(1) : '?';
      return `### ${i + 1}. 「${o.text || ''}」

- **类型**：${o.type || '标题卡'}
- **时长**：${o.duration_s || 2}s
- **落在成片的**：${at}s（第 ${o.after_slot} 段之后）
- **样式**：${o.style || '与全片调性一致'}
- **背景**：**必须透明**（alpha 通道），我要叠在实拍画面上`;
    })
    .join('\n\n');

  return `我在剪一条${recipe?.format || '短视频'}，需要 ${overlays.length} 张叠加图形卡。

## 规格

- 画幅 ${aspect}，${plan.aspect === '16:9' ? '1920×1080' : '1080×1920'}，30fps
- **导出带 alpha 的 WebM 或 ProRes 4444** —— 这些要叠在实拍视频上，不能有底色
- 全片调性：${g.label}（${g.desc}），图形卡的配色要压得住，不能比画面还跳

## 要做的卡

${items}

## 要求

- 每张卡**自己是一个独立文件**，我要分别拖进时间线
- 入场 ease-out、出场 ease-in，各 0.3–0.4s；中间保持静止
- 把 Remotion 源码一起给我，文案我以后要能自己换`;
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
