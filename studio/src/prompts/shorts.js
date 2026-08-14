// 再切 —— 一条主片剪完，从里面再切出 N 支能独立成立的短片。
//
// 这跟「量产」不是一回事：量产是从**原始素材**规划一个月的内容，
// 这里是从**已经剪好的成片**里再榨。省下来的是全部的重复劳动 ——
// 素材不用再找、色不用再调、字幕不用再对轴，只要重新裁两刀 + 换个开场。
//
// 唯一的手艺难点：主片是有铺垫的，切出来的短片没有。
// 一支短片如果依赖「前面说过」的信息，它就不成立 —— 这是切片最常见的死法。

import { DIRECTOR_PERSONA, JSON_TAIL, brandContext } from './shared.js';
import { platformById, beatById } from '../constants.js';

const SHORTS_SCHEMA = `{
  "read": "这条主片里到底有几个点能独立成立，一句话说清。如果只有一两个，就直说，不要凑数",
  "shorts": [
    {
      "id": "S1",
      "title": "内部名字，不是发布标题",
      "one_idea": "这一支只讲的那一件事。写成一句能说完的话",
      "from_s": 8.5,
      "to_s": 21.0,
      "duration_s": 12.5,
      "platform": "平台 id",
      "open_on": "开场停在主片的第几秒、那一帧画面是什么",
      "new_hook": "必须新写的开场字幕/口播原文。切出来的片子没有主片的铺垫，原来那句开场在这里不成立",
      "keep_slots": [3, 4, 5],
      "cut_reason": "为什么砍掉的那些对这一支不重要",
      "standalone_check": "自查：不看主片能不能看懂？有没有出现「刚才说的」「这个」这种指代不明的地方？有就说明怎么补",
      "ending": "这一支怎么收尾。主片的结尾不一定适合它",
      "recut_notes": "重新裁画幅、改字幕位置时要注意什么"
    }
  ],
  "not_worth_cutting": ["主片里哪几段撑不起一支独立短片，以及为什么。这一栏比多切一支有用"]
}`;

/**
 * @param {object} o
 * @param {object} o.plan       主片方案（timeline 已带 output_start / output_duration）
 * @param {Array}  o.timed      withOutputTimes(plan.timeline) 的结果
 * @param {object} [o.recipe]
 * @param {number} o.total      主片总时长
 * @param {number} o.count      想切几支
 * @param {string} o.platformId 切片投放的平台
 * @param {object} o.settings
 */
export function shortsPrompt({ plan, timed = [], recipe, total, count = 5, platformId, settings }) {
  const p = platformById(platformId);

  const master = timed
    .map((r) => {
      const end = r.output_start + r.output_duration;
      return (
        `  ${String(r.slot).padStart(2)} │ ${r.output_start.toFixed(2)}–${end.toFixed(2)}s │ ` +
        `[${beatById(r.beat).label}] ${r.onscreen_text ? `字幕「${r.onscreen_text}」` : ''}` +
        `${r.vo ? ` 口播「${r.vo}」` : ''}${r.why ? ` —— ${r.why}` : ''}`
      );
    })
    .join('\n');

  return `${DIRECTOR_PERSONA}

TASK — RECUT. 主片已经剪好了。从它里面再切出 ${count} 支能**独立成立**的短片。

这一步省下的是全部的重复劳动：素材不用再找、色不用再调、字幕时间轴不用再对。
你只需要决定「切哪几刀、换什么开场」。

═══ 主片（成片时间轴，总长 ${total.toFixed(1)}s）═══

${plan.summary ? `思路：${plan.summary}\n` : ''}${recipe?.title ? `配方：${recipe.title}\n` : ''}
${master || '（时间轴是空的）'}

投放平台：${p.label}｜理想时长 ${p.sweetSpot}｜钩子窗口 ≈ ${p.hookWindow}s｜画幅 ${p.aspect}
${p.notes}
${brandContext(settings)}

═══ 硬规矩 ═══

1. **每一支必须不看主片就能看懂。** 这是切片最常见的死法 ——
   主片第 12 秒那句话之所以成立，是因为前 11 秒铺过了。切出来就没有那 11 秒。
   凡是出现「刚才说的」「这个」「所以」这类依赖上文的地方，都要在 new_hook 里补掉。

2. **new_hook 必须重写，不能沿用主片的开场。** 主片的开场是为整条片子服务的，
   切片各自要有自己的入口。写成能直接用的原话。

3. **不许均分。** 把 ${total.toFixed(0)}s 砍成 ${count} 段等长的，那是切香肠不是切片。
   每一支的边界由「哪一段自己是一个完整的意思」决定，长度可以差很多。

4. **开场不能撞。** 任何两支的 from_s 至少差 2 秒，否则第二支在信息流里是隐形的。

5. **单支不要超过主片的 60%。** 超过就等于把主片重发一遍，平台会当重复内容。

6. **切不出来就说切不出来。** 主片如果只撑得起 2 支，就给 2 支，
   剩下的写进 not_worth_cutting。一支能打的胜过五支凑数的。

7. from_s / to_s 必须落在 0–${total.toFixed(1)}s 内，且 to_s > from_s。
   这两个数字会被直接拿去裁片，写错就是废片。

Return JSON with exactly this shape:
${SHORTS_SCHEMA}
${JSON_TAIL}`;
}
