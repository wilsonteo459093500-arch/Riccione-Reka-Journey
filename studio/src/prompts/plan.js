// 排剪辑 —— 配方 × 你的素材 = 一条可以直接去渲染的时间线。

import { DIRECTOR_PERSONA, CRAFT_RULES, RETENTION_RULES, JSON_TAIL, brandContext } from './shared.js';
import { platformById, gradeById, captionStyleById } from '../constants.js';

const PLAN_SCHEMA = `{
  "summary": "3-4 句话说清这条片子怎么剪、为什么这么剪",
  "target_duration_s": 31.5,
  "aspect": "9:16",
  "timeline": [
    {
      "slot": 1,
      "beat": "HOOK",
      "assetId": "a1",
      "in": 2.1,
      "out": 4.0,
      "speed": 1.0,
      "reframe": "画幅适配方式，如「竖裁保左侧人物」「静图 Ken Burns 缓推 8%」",
      "onscreen_text": "这一拍屏幕上的文字（没有就空字符串）",
      "vo": "这一拍的口播（没有就空字符串）",
      "sfx": "音效点（没有就空字符串）",
      "transition_in": "cut",
      "grade": "warm_cinematic",
      "why": "为什么这条素材放这个位置、为什么切在这个点",
      "risk": "这一拍可能翻车的地方（没有就空字符串）"
    }
  ],
  "gaps": [
    {
      "beat": "TURN",
      "need": "缺什么素材",
      "how_to_shoot": "怎么补：机位、景别、动作、时长，写成可执行的一句话",
      "workaround": "补不了的话，用现有素材怎么顶过去"
    }
  ],
  "captions": [
    { "start": 0.0, "end": 1.6, "text": "字幕文字" }
  ],
  "music": {
    "brief": "要找什么样的音乐，写成可以直接去曲库搜的描述",
    "search_terms": ["3-5 个英文搜索词"],
    "cut_points_s": [0.0, 3.2, 8.5],
    "duck_under_vo_db": -12
  },
  "overlays": [
    {
      "after_slot": 1,
      "type": "title_card",
      "text": "文字内容",
      "style": "视觉描述",
      "duration_s": 2.0,
      "engine": "hyperframes"
    }
  ],
  "cover": {
    "source": "a3",
    "concept": "封面创意描述",
    "title_text": "封面大字（≤12 字）",
    "subtitle": "副标题（≤16 字，可空）",
    "prompt": "生成封面图用的英文出图 prompt，完整可直接用"
  },
  "qc": ["4-6 条：渲染出来之后必须逐条检查的点"]
}`;

/**
 * @param {object} o
 * @param {object} o.recipe      拆解出的配方
 * @param {Array}  o.assets      [{id, kind, name, duration, label}]
 * @param {string} o.platformId
 * @param {string} o.gradeId
 * @param {string} o.captionStyleId
 * @param {number} o.targetDuration
 * @param {string} o.notes
 * @param {object} o.settings
 */
export function planPrompt({ recipe, assets, platformId, gradeId, captionStyleId, targetDuration, notes, settings }) {
  const p = platformById(platformId);
  const g = gradeById(gradeId);
  const c = captionStyleById(captionStyleId);

  const inventory = assets
    .map((a) => {
      const L = a.label || {};
      if (a.kind === 'image') {
        return [
          `- ${a.id} [静图] "${a.name}"`,
          `    内容：${L.summary || '未标注'}`,
          `    景别：${L.shot_size || '?'}｜光线：${L.lighting || '?'}｜Hero 分：${L.hero_score ?? '?'}/10`,
          `    适合节拍：${(L.use_for || []).join(', ') || '?'}`,
          `    动效建议：${L.motion_suggestion || '?'}`,
          L.issues?.length ? `    问题：${L.issues.join('；')}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      }
      const moments = (L.best_moments || [])
        .map((m) => `      · ${m.start?.toFixed(1)}–${m.end?.toFixed(1)}s ${m.what}（宜用于 ${m.use_for}）`)
        .join('\n');
      return [
        `- ${a.id} [视频] "${a.name}" 时长 ${a.duration?.toFixed(1) || '?'}s`,
        `    内容：${L.summary || '未标注'}`,
        `    景别：${L.shot_size || '?'}｜运镜：${L.camera || '?'}｜光线：${L.lighting || '?'}`,
        moments ? `    可用片段：\n${moments}` : '    可用片段：未标注',
        L.issues?.length ? `    问题：${L.issues.join('；')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const recipeBeats = (recipe.beats || [])
    .map(
      (b) =>
        `  ${b.id} [${b.beat}] ${b.start?.toFixed(1)}–${b.end?.toFixed(1)}s · ${b.shot}` +
        `${b.onscreen_text ? ` · 字幕「${b.onscreen_text}」` : ''}` +
        `${b.vo ? ` · 口播「${b.vo}」` : ''}` +
        `\n      需要素材：${b.asset_need?.description || '?'}`
    )
    .join('\n');

  return `${DIRECTOR_PERSONA}

TASK — EDIT ASSEMBLY. Turn a recipe plus a pile of the user's own footage into a shot-by-shot timeline that a renderer
can execute. This is the step where a good idea becomes a real cut.

═══ THE RECIPE (structural target) ═══
标题：${recipe.title}
格式：${recipe.format}
一句话：${recipe.one_liner}
原片时长：${recipe.duration_s}s｜节奏：${recipe.pacing?.rhythm || '?'}（平均 ${recipe.pacing?.avg_shot_s || '?'}s/镜）
钩子：[${recipe.hook?.type}] ${recipe.hook?.line}｜画面：${recipe.hook?.visual}
结尾 CTA：${recipe.cta?.line || '?'}
节拍表：
${recipeBeats}

═══ THE USER'S ACTUAL ASSETS ═══
${inventory || '(没有素材)'}

═══ OUTPUT CONSTRAINTS ═══
平台：${p.label}（${p.sweetSpot}，钩子窗口 ≈ ${p.hookWindow}s，画幅 ${p.aspect}）
目标时长：${targetDuration}s（±15% 可以接受，超出就砍掉最弱的 PROOF 拍）
统一调色：${g.label} — ${g.desc}（id: ${g.id}）
字幕风格：${c.label}${c.chunk ? `，每 ${c.chunk} 字一组` : ''}（id: ${c.id}）
${notes?.trim() ? `\n用户额外要求（优先级高于配方）：\n${notes.trim()}` : ''}

${RETENTION_RULES}

${CRAFT_RULES}
${brandContext(settings)}

═══ ASSEMBLY RULES ═══
1. **Only use assetIds from the inventory above.** Never invent an asset. If the recipe needs a shot nobody has,
   that is a "gaps" entry, not a fabricated timeline row.
2. **in/out must be inside the clip's real duration**, and should come from the clip's "可用片段" ranges wherever one
   fits. If you deviate from a listed range, justify it in "why".
3. A still image slot uses in=0 and out=(its display duration), plus a concrete "reframe" motion. Stills without motion
   are dead air — always give them a move.
4. **Reuse is allowed and often correct** — the same clip can appear in several slots at different in/out points
   (e.g. a 0.4s flash-forward in the HOOK, the full 3s reveal in the PAYOFF). Use this deliberately.
5. The first slot must be the strongest available frame. If the best hero material is a still, open on the still.
6. Slot durations must produce the pacing the recipe describes. Fast section = 0.5–1.2s slots. Breathing room = 2–4s.
7. "captions" covers the whole timeline in output-timeline seconds (starting at 0), chunked to the caption style.
   Text must match the "vo" and "onscreen_text" you wrote. If the caption style is "none", return an empty array.
8. "cover" — pick the assetId with the best hero potential, or set source to "generate" if nothing is strong enough.
   The "prompt" field is written in English and must be self-contained.
9. "gaps" is where you are most useful. Be specific and shoot-able. "补一个转折镜头" is useless;
   "手持，从关着的柜门推近到 30cm，按下反弹器，柜门弹开露出内部，2 秒，顺光" is useful.

Return JSON with exactly this shape:
${PLAN_SCHEMA}
${JSON_TAIL}`;
}
