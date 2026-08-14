// 切片体检 + 出片单。
//
// 和内容矩阵一样的原则：prompt 里写了七条规矩，但保证不了。
// 这里用代码复算一遍 —— 尤其是 from_s / to_s，它们会被直接拿去裁片，
// 写错不是"质量差一点"，是废片。

import { platformById } from '../constants.js';
import { collector, findOpeningClashes, mergedSpan, OPEN_GAP } from './audit.js';

const MAX_SHARE = 0.6; // 单支不超过主片的 60%，否则算重发

/**
 * @param {object} result shortsPrompt 的输出
 * @param {number} total  主片总时长
 * @returns {Array<{level:'error'|'warn', ref?:string, kind:string, msg:string}>}
 */
export function auditShorts(result, total) {
  const list = result?.shorts || [];
  const { add, issues } = collector();

  list.forEach((s) => {
    const from = Number(s.from_s);
    const to = Number(s.to_s);

    // ---- 时间码：这几条是硬伤，错了直接裁出废片 ----
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return add('error', 'time', `${s.id} 的起止时间不是数字（${s.from_s} → ${s.to_s}）`, s.id);
    }
    if (to <= from) {
      return add('error', 'time', `${s.id} 的结束时间不在开始之后（${from} → ${to}）`, s.id);
    }
    if (from < 0 || to > total + 0.05) {
      return add('error', 'time', `${s.id} 要切 ${from.toFixed(1)}–${to.toFixed(1)}s，但主片只有 ${total.toFixed(1)}s`, s.id);
    }

    const dur = to - from;
    if (dur / total > MAX_SHARE) {
      add(
        'warn',
        'share',
        `${s.id} 占了主片的 ${Math.round((dur / total) * 100)}%。超过 ${MAX_SHARE * 100}% 基本等于把主片重发一遍，平台会当重复内容。`,
        s.id
      );
    }
    if (dur < 5) {
      add('warn', 'short', `${s.id} 只有 ${dur.toFixed(1)}s，太短了 —— 观众还没进入就结束了。`, s.id);
    }

    // 声明的时长和实际算出来的对不上 → 说明模型自己没算清楚，以时间码为准
    if (Number.isFinite(Number(s.duration_s)) && Math.abs(Number(s.duration_s) - dur) > 0.6) {
      add('warn', 'time', `${s.id} 写的时长 ${s.duration_s}s 和起止算出来的 ${dur.toFixed(1)}s 对不上，以起止为准。`, s.id);
    }

    // ---- 独立成立 ----
    if (!(s.new_hook || '').trim()) {
      add('error', 'hook', `${s.id} 没写新开场。切出来的片子没有主片的铺垫，沿用原开场不成立。`, s.id);
    }
    const idea = (s.one_idea || '').trim();
    if (!idea || idea.length < 6) {
      add('warn', 'idea', `${s.id} 没说清只讲哪一件事。`, s.id);
    }
    // 指代不明是切片最常见的死法，扫一遍最典型的几个词
    const dangling = ['刚才说的', '刚刚说的', '前面提到', '上面说的', '这个方法', '如我所说'];
    const hit = dangling.find((w) => (s.new_hook || '').includes(w));
    if (hit) add('warn', 'standalone', `${s.id} 的新开场里出现了「${hit}」—— 它依赖主片的上文，切出来就断了。`, s.id);
  });

  // ---- 开场不能撞（和「量产」共用同一份实现，见 audit.js）----
  // 切片全部来自同一条主片，所以 source 一律为 null；开场是一个时间点，from = to。
  findOpeningClashes(
    list
      .filter((s) => Number.isFinite(Number(s.from_s)))
      .map((s) => ({ ref: s.id, source: null, from: Number(s.from_s), to: Number(s.from_s) }))
  ).forEach((c) => {
    const at = list.find((s) => s.id === c.a);
    add(
      'error',
      'open',
      `${c.a} 和 ${c.b} 的开场只差 ${(c.gap ?? 0).toFixed(1)}s（都在主片第 ${Number(at?.from_s || 0).toFixed(1)}s 附近）。前 1.5 秒决定一切 —— 两支开头几乎一样，第二支在信息流里是隐形的。`,
      c.b
    );
  });

  return issues;
}

/** 主片有多少被真正用上了（重叠区间要合并，否则利用率会虚高） */
export function shortsCoverage(result, total) {
  const spans = (result?.shorts || [])
    .map((s) => [Number(s.from_s), Number(s.to_s)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);

  const covered = mergedSpan(spans);
  return {
    covered,
    total,
    ratio: total ? covered / total : 0,
    totalOutput: Number(spans.reduce((s, [a, b]) => s + (b - a), 0).toFixed(2)),
    count: spans.length,
  };
}

const t = (s) => {
  const n = Math.max(0, Number(s) || 0);
  const mm = String(Math.floor(n / 60)).padStart(2, '0');
  const ss = String(Math.floor(n % 60)).padStart(2, '0');
  const ms = String(Math.round((n % 1) * 1000)).padStart(3, '0');
  return `00:${mm}:${ss}.${ms}`;
};

/**
 * 出片单 —— 拿着这个就能裁，不用再回工作台。
 * 同时给剪映和 ffmpeg 两套，因为这一步剪映其实更快（复制主轨、裁两刀、改开场字幕）。
 */
export function toShortsGuide(result, { total, platformId, masterName = 'final.mp4' } = {}) {
  const list = result?.shorts || [];
  if (!list.length) return '';
  const p = platformById(platformId);
  const cov = shortsCoverage(result, total);

  const blocks = list
    .map((s) => {
      const from = Number(s.from_s);
      const to = Number(s.to_s);
      const dur = to - from;
      const slug = String(s.id || 'S').replace(/[^\w-]/g, '');
      return `### ${s.id} · ${s.title || ''}

**只讲这一件事**：${s.one_idea || ''}
**在主片上的位置**：${from.toFixed(2)}s → ${to.toFixed(2)}s（${dur.toFixed(1)}s，占主片 ${Math.round((dur / total) * 100)}%）
${s.keep_slots?.length ? `**用到主片的第** ${s.keep_slots.join('、')} **拍**\n` : ''}
**新开场（必须换掉，原开场在这里不成立）**
> ${s.new_hook || '（没写 —— 这一支不能直接发）'}

${s.ending ? `**收尾**：${s.ending}\n` : ''}${s.standalone_check ? `**独立性自查**：${s.standalone_check}\n` : ''}${s.cut_reason ? `**为什么砍掉其余部分**：${s.cut_reason}\n` : ''}${s.recut_notes ? `**重裁注意**：${s.recut_notes}\n` : ''}
剪映：复制主轨 → 播放头移到 **${from.toFixed(2)}s** 按 \`Ctrl/Cmd+B\`，移到 **${to.toFixed(2)}s** 再按一次 → 删掉两边 → 把开头的字幕换成上面那句新开场。

ffmpeg：
\`\`\`bash
ffmpeg -ss ${t(from)} -to ${t(to)} -i ${masterName} \\
  -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k \\
  ${slug}.mp4
\`\`\`
`;
    })
    .join('\n---\n\n');

  return `# 再切 ${list.length} 支 · 从 ${masterName}

> ${result.read || ''}

**主片** ${total.toFixed(1)}s ｜ **投放** ${p.label}（${p.aspect}，理想 ${p.sweetSpot}）
**利用率** 主片被用掉 ${cov.covered.toFixed(1)}s / ${total.toFixed(1)}s（${Math.round(cov.ratio * 100)}%），产出合计 ${cov.totalOutput.toFixed(1)}s

⚠️ **每一支的开场字幕都必须换掉。** 主片的开场是为整条片子服务的，
切片没有那段铺垫，沿用原开场等于开头就断了。这是切片最常见的死法。

---

${blocks}
${
  result.not_worth_cutting?.length
    ? `\n---\n\n## 这几段撑不起独立短片\n\n${result.not_worth_cutting.map((x) => `- ${x}`).join('\n')}\n`
    : ''
}`;
}
