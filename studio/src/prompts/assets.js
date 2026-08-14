// 素材标注 —— 每条原片 / 案例图先过一遍，让排剪辑那一步知道「柜门特写在第 6.2 秒」。

import { DIRECTOR_PERSONA, JSON_TAIL, brandContext } from './shared.js';

const VIDEO_SCHEMA = `{
  "summary": "一句话说清这条素材拍了什么",
  "tags": ["4-8 个检索标签，如 厨房 / 特写 / 手部动作 / 逆光"],
  "shot_size": "景别：大远景 / 远景 / 全景 / 中景 / 近景 / 特写 / 大特写",
  "camera": "机位与运动",
  "lighting": "光线情况",
  "quality": "画质与稳定性评价，一句话",
  "usable_seconds": 8.4,
  "best_moments": [
    {
      "start": 2.1,
      "end": 4.3,
      "what": "这一段发生了什么",
      "use_for": "HOOK",
      "why": "为什么这段适合放这个位置",
      "grade_note": "这段调色要注意什么"
    }
  ],
  "issues": ["画面问题清单：抖动 / 过曝 / 杂物入镜 / 空镜太长 …没有就空数组"],
  "suggested_beats": ["HOOK", "PROOF"]
}`;

const IMAGE_SCHEMA = `{
  "summary": "一句话说清这张图是什么",
  "tags": ["4-8 个检索标签"],
  "shot_size": "景别",
  "lighting": "光线情况",
  "quality": "画质评价，一句话",
  "hero_score": 8,
  "use_for": ["适合承担的节拍 id，如 PAYOFF"],
  "motion_suggestion": "静图动起来的方式：缓推 / 缓拉 / 上下摇 / Ken Burns 对角线 / 视差分层",
  "crop_note": "转成目标画幅时怎么裁，保住什么",
  "issues": ["问题清单，没有就空数组"]
}`;

/**
 * @param {'video'|'image'} kind
 * @param {object} o { name, duration, frameCount, settings }
 */
export function labelAssetPrompt(kind, { name, duration, frameCount, settings }) {
  if (kind === 'image') {
    return `${DIRECTOR_PERSONA}

TASK — ASSET TRIAGE (single still image).
This is one of the user's own case photos. Judge it the way you'd judge a frame before putting it in a cut.
File name: ${name || '(未命名)'}

"hero_score" is 1–10: how strong is this as the single most striking frame of a video (the cover / the payoff shot)?
Be a tough grader. A well-lit, well-composed hero shot is 8+. A useful but ordinary detail shot is 4–6.
"motion_suggestion" matters — a still only earns its place in a video if it moves.
${brandContext(settings)}

Return JSON with exactly this shape:
${IMAGE_SCHEMA}
${JSON_TAIL}`;
  }

  return `${DIRECTOR_PERSONA}

TASK — ASSET TRIAGE (one source clip).
This is one of the user's own raw clips. You are given ${frameCount} frames sampled evenly across it, each labelled
with its timestamp in seconds. Total duration: ${duration?.toFixed(1) || '?'}s. File name: ${name || '(未命名)'}

Your job is to tell the editor what is inside this clip and exactly WHERE the usable moments are, so they can be
trimmed without re-watching the footage.

RULES FOR "best_moments":
- Give 1–4 ranges. Each must be a real range you can justify from the frames, with start < end.
- Ranges must fall inside 0 – ${duration?.toFixed(1) || '?'}s.
- A usable moment for short-form is typically 0.8–4s. Don't propose a 20s range.
- "use_for" must be one of: HOOK / SETUP / PROOF / TURN / PAYOFF / CTA.
- If the clip is genuinely unusable (all blurry, all dark, nothing happens), return an empty best_moments array and
  say why in "issues". Do not invent value that isn't there.
- "usable_seconds" is your honest total of footage worth keeping.
${brandContext(settings)}

Return JSON with exactly this shape:
${VIDEO_SCHEMA}
${JSON_TAIL}`;
}
