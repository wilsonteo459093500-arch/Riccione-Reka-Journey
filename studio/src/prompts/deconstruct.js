// 参考视频拆解 —— 把一条「我想要这种感觉」的视频，变成一份可复用的配方 (Recipe)。

import { DIRECTOR_PERSONA, CRAFT_RULES, RETENTION_RULES, JSON_TAIL, brandContext } from './shared.js';
import { platformById } from '../constants.js';

const RECIPE_SCHEMA = `{
  "title": "给这个配方起的名字，如「毛坯到成品·数字倒计时」",
  "one_liner": "一句话说清这条视频靠什么留住人",
  "format": "格式命名，如「前后对比 + 旁白清单」",
  "duration_s": 32.0,
  "aspect": "9:16",
  "hook": {
    "type": "钩子类型，如 反常识断言 / 视觉奇观 / 痛点点名 / 数字承诺 / 前后闪回",
    "line": "第一句话（口播或字幕）的原文",
    "visual": "第 0 帧看到的画面，具体到景别和主体",
    "first_frame": "把第 1 帧当静态图描述：主体、构图、文字位置",
    "why": "为什么这个钩子在这个平台有效"
  },
  "beats": [
    {
      "id": "b1",
      "beat": "HOOK",
      "start": 0.0,
      "end": 2.4,
      "shot": "景别 + 主体 + 动作，如「中近景，手推开柜门，柜内灯亮起」",
      "camera": "机位与运动，如「手持轻微推近」「固定机位」「俯拍下压」",
      "subject": "画面主角是什么",
      "onscreen_text": "这一拍屏幕上出现的文字（没有就空字符串）",
      "vo": "这一拍的口播 / 旁白（没有就空字符串）",
      "sfx": "音效点，如「柜门吸合的一声」",
      "transition_out": "cut",
      "purpose": "这一拍在结构里干什么活",
      "asset_need": {
        "kind": "video",
        "description": "要复刻这一拍，用户需要提供什么素材",
        "must_have": "这条素材里必须出现的关键元素"
      }
    }
  ],
  "pacing": {
    "shots": 18,
    "avg_shot_s": 1.7,
    "fastest_s": 0.4,
    "slowest_s": 4.2,
    "rhythm": "节奏描述：哪里密、哪里松、在第几秒变速"
  },
  "grade": {
    "preset": "warm_cinematic",
    "look": "具体描述：对比度、色偏、饱和、高光处理、颗粒",
    "reference_words": "3-5 个形容词"
  },
  "captions": {
    "style": "bold_overlay",
    "chunk": 2,
    "case": "upper",
    "position": "字幕位置描述",
    "note": "字体气质、描边、出现方式"
  },
  "audio": {
    "music_type": "音乐类型与情绪",
    "bpm_feel": "快慢感觉，如「中速 100 左右，四四拍」",
    "energy_curve": "能量曲线：几秒起、几秒炸、几秒收",
    "drop_at_s": 12.0,
    "vo_style": "口播风格（没口播就写「无口播」）",
    "sfx": ["音效清单"]
  },
  "text_design": {
    "font_feel": "字体气质",
    "color": "文字配色",
    "placement": "版式位置规律",
    "motion": "文字动效方式"
  },
  "cta": { "line": "结尾引导语原文", "placement": "出现在第几秒、用什么形式" },
  "why_it_works": ["3-5 条：这条视频能起量的真实原因，要具体"],
  "traps": ["2-4 条：新手照抄最容易做砸的地方"],
  "adapt_notes": ["3-5 条：把这个配方套到「品牌上下文」的行业时，该改什么"]
}`;

/**
 * @param {object} o
 * @param {string} o.platformId 目标平台
 * @param {'video'|'frames'} o.mode 模型拿到的是完整视频还是抽帧
 * @param {number} [o.duration] 抽帧模式下要告诉模型总时长
 * @param {string} [o.notes] 用户补充说明
 * @param {object} o.settings 含 brand / audience / tone
 */
export function deconstructPrompt({ platformId, mode, duration, notes, settings }) {
  const p = platformById(platformId);

  const modeNote =
    mode === 'video'
      ? `You are given the COMPLETE reference video including its audio track. Use the audio: transcribe the voiceover,
identify where music energy shifts, and mark sound effects. Your timecodes must match what you actually observe.`
      : `You are given ${duration ? `a ${duration.toFixed(1)}s video, sampled as` : ''} an ORDERED SEQUENCE OF FRAMES,
each labelled with its timestamp in seconds. You cannot hear the audio. Reconstruct the edit from the visual evidence:
count distinct shots by detecting composition changes between consecutive frames, infer cut points as falling between
the last frame of one shot and the first frame of the next, and infer pacing from how many frames each shot occupies.
For every audio field, write your best professional inference and prefix it with "推测：". Do NOT invent exact
transcribed dialogue you cannot see — if on-screen text is visible, read it and use it.`;

  return `${DIRECTOR_PERSONA}

TASK — REFERENCE DECONSTRUCTION.
The user wants to make a video that FEELS like this reference, using their own footage. Reverse-engineer the reference
into a reusable RECIPE: the structural skeleton, the craft decisions, and the shopping list of shots the user must
supply. This recipe is the single source of truth for everything downstream, so it has to be precise enough that a
different editor with completely different footage could rebuild the same feeling.

${modeNote}

TARGET PLATFORM: ${p.label} — ideal length ${p.sweetSpot}, hook window ≈ ${p.hookWindow}s, aspect ${p.aspect}.
Platform mechanics: ${p.notes}
If the reference's own length or rhythm doesn't suit this platform, keep the reference's *technique* but state the
required adjustment in "adapt_notes".

${RETENTION_RULES}

${CRAFT_RULES}
${brandContext(settings)}${notes?.trim() ? `\n\nUSER'S OWN NOTE ABOUT THIS REFERENCE (weight it heavily):\n${notes.trim()}` : ''}

BEAT LABELS — every beat must use exactly one of these ids:
  HOOK   前 0–2 秒，让人停下来
  SETUP  交代场景 / 问题 / 人物
  PROOF  过程、细节、证据（可以出现多次）
  TURN   转折、反差、揭晓
  PAYOFF 最终成果，情绪最高点
  CTA    引导关注 / 收藏 / 私信

QUALITY BAR:
- Break the reference into EVERY distinct shot, not a summary. A 30s video usually has 12–25 beats. Do not merge shots.
- "asset_need" is the most important field for the user. Write it as a shot brief they could hand to a videographer:
  what to point the camera at, from where, doing what, for how long.
- If two consecutive beats need the same source clip, say so in the description.
- Be honest in "traps". The most useful thing you can tell someone is what will make their copy look cheap.

Return JSON with exactly this shape:
${RECIPE_SCHEMA}
${JSON_TAIL}`;
}

/** 没有参考视频时：直接从模板 + 文字描述生成配方 */
export function recipeFromTemplatePrompt({ template, platformId, brief, settings }) {
  const p = platformById(platformId);
  return `${DIRECTOR_PERSONA}

TASK — ORIGINAL RECIPE DESIGN (no reference video supplied).
Design a short-form video recipe from scratch using this structural template:

TEMPLATE: ${template.label} — ${template.hint}
TEMPLATE BRIEF: ${template.brief}
SUGGESTED BEAT ORDER: ${template.beats.join(' → ')}

TARGET PLATFORM: ${p.label} — ideal length ${p.sweetSpot}, hook window ≈ ${p.hookWindow}s, aspect ${p.aspect}.
Platform mechanics: ${p.notes}

USER'S BRIEF (this is what the video is actually about — treat it as the subject matter):
${brief?.trim() || '(用户没写，按品牌上下文自行发挥一个最有代表性的选题)'}

${RETENTION_RULES}

${CRAFT_RULES}
${brandContext(settings)}

Design 12–20 beats. Every beat needs a concrete "asset_need" the user can actually go and shoot or already has.
Aim for the platform's sweet-spot duration.

BEAT LABELS — HOOK / SETUP / PROOF / TURN / PAYOFF / CTA.

Return JSON with exactly this shape:
${RECIPE_SCHEMA}
${JSON_TAIL}`;
}
