// 展厅播放 · 房间设计特点：词库 + 从图纸文字里认出来（纯函数，Node 可测，不花 AI 费用）。
//
// 三条规矩（老板定的）：
//   1. 图纸必须准确，程序只能「建议」、不能编：只在这一页的图纸文字（标注、视角名、材料部位）里**真的写着**词库的名称 / 别名时才建议，
//      每条建议都带上原文（evidence），设计师看得到是哪一句认出来的。没写的不猜（不看图、不调 AI）。
//   2. 设计师打勾才出现：建议本身不进方案；勾上的才存进 slide.crafts（id 列表，按勾的先后）。设计师也可以从词库手动加（他知道图上有）。
//   3. 定义要老板审过才算数：文字（一句话、好处）只能来自这里的词库，设计师改不了；状态 'pending'（待审）的条目可以先勾，
//      但展厅播放不放（播放器的「预览待审」开关只给内部看，卡片上标「待审」）。'approved' = 老板审过 ✅；'official' = 溪岸官方说法（品牌手册）。
//
// 和 .claude/skills/interior-design-expert/references/cabinet-craft.md 必须一字不差（test/craft.test.mjs 会对一遍）：
//   CRAFT_VOCAB 的 oneLine / benefit = md 第一、二节（行业整理稿，研究底稿，不直接给客人看）；
//   CRAFT_COPY = md 第四节「溪岸文案」（给客人看的中英文 + 状态）—— 老板只审这一张，审稿改 md → 这里跟着改。

/** 状态：能不能在展厅播放里给客人看 */
export const CRAFT_STATUS = { pending: '待审', approved: '老板审过', official: '溪岸官方说法' };
export const isPlayable = (entry) => entry?.status === 'approved' || entry?.status === 'official';

/** 一个房间（停点）最多讲几个：md「一个房间讲 2–3 个就够」 */
export const CRAFT_MAX = 3;

const E = (id, group, zh, oneLine, benefit, aliases, extra = {}) => ({ id, group, zh, oneLine, benefit, aliases, ...extra });

/**
 * group：'craft' 工艺细节（md 一）/ 'method' 设计手法（md 二，「好处」= md 的「效果」）
 * aliases：图纸上可能的写法（含名称本身）；比对时去掉空格、不分大小写；拉丁字母的别名要整词
 * exclude：碰到这些写法就不算（「夹心板」是板材，不是 ABA 夹心）
 */
export const CRAFT_VOCAB = [
  // —— 一、工艺细节 ——
  E('tuofeng', 'craft', '脱缝', '柜体和墙、顶、旁板之间刻意留一道均匀的凹缝', '柜子像「浮」在空间里，更轻；也能吃掉墙面不平', ['脱缝', '离缝', 'shadow gap'], { mdName: '脱缝（也叫离缝）' }),
  E('zhuifeng', 'craft', '追缝', '不同柜子、门板、墙板之间的缝**对齐成一条线**', '整面墙看起来是「一体设计」，不乱', ['追缝', '缝对齐', '缝要对齐']),
  E('duiwen', 'craft', '对纹', '相邻门板的木纹接得上，像同一块木头', '大面木作更整、更贵气', ['对纹', '木纹连续', '纹理连续', '木纹对齐']),
  E('duikai', 'craft', '对开混拼', '宽 220 mm 以上的山纹木皮从中间裁开再随机拼，山纹与直纹自然接上（VISN 原图文字）', '天然木皮尺寸有限，拼得好才有整墙的自然感', ['对开混拼', '混拼'], { mdName: '对开混拼（VISN 木皮拼贴）' }),
  E('xicao', 'craft', '铣槽', '在门板边上铣出凹槽当拉手', '无拉手、立面干净，不勾衣服', ['铣槽', '铣槽拉手', 'J 槽拉手', 'G 槽拉手']),
  E('lacao', 'craft', '拉槽', '门板表面铣出一条条竖向凹槽（凹凸纹理）', '有节奏感和手感，单色也不单调', ['拉槽', 'fluted']),
  E('xieqie', 'craft', '斜切', '门板 / 抽屉面的边做斜角', '斜边本身就是拉手；立面显薄、利落', ['斜切', '斜边拉手']),
  E('xiepin', 'craft', '斜拼', '两块板在转角 45° 拼接，木纹 / 边线绕过转角不断', '看不到板材断面，像一整块实木', ['斜拼', '45° 拼接', '45 度拼接']),
  E('haitang', 'craft', '海棠角', '阳角不做成尖直角，而是做出一个内凹的小台阶 / 小方角（取自传统家具的海棠角）', '不磕手、不易崩边，转角有细节、有东方味', ['海棠角']),
  E('jiaxin', 'craft', '夹心 / ABA 夹心', '层板或边框用「A 料 + B 料 + A 料」三层叠，侧面露出中间那道对比色线', '层板看起来更薄、更精致；有设计细节', ['ABA 夹心', 'ABA', '夹心'], { exclude: ['夹心板', '夹芯板'] }),
  // 骨骼线是溪岸原创系列名：给客人看的文字用品牌手册的官方说法（见 CRAFT_COPY.gugexian）
  E('gugexian', 'craft', '骨骼线', '柜面上凸出的竖向 / 横向线条，既是结构感也是拉手', '不用另装拉手，立面有家具感', ['骨骼线', 'skeleton line']),
  E('yuanhu', 'craft', '圆弧', '柜体、墙板、台面做成弧形', '动线更顺、更安全，空间变柔和', ['圆弧', '弧形']),
  E('gezha', 'craft', '格栅', '一排间隔的木条做隔断或柜面', '通透、透气，有分区又不封闭', ['格栅', '格珊', 'grille']),
  E('gangqin', 'craft', '钢琴键', '竖条长短 / 进出不一，像钢琴键', '比格栅多一层节奏和立体感', ['钢琴键']),
  E('xixing', 'craft', '铣型', '在板上铣出造型（半圆拉手、图案等）', '拉手和造型一体，有个性', ['铣型', '铣形']),
  E('yinxingmen', 'craft', '隐形门', '门和墙板 / 柜门做平、不留门套', '整面墙干净，门「消失」', ['隐形门', '暗门', 'hidden door', 'invisible door']),
  E('touqi', 'craft', '透气', '板上铣出一排透气缝', '鞋柜、设备柜不闷、不臭', ['透气', '透气孔', '散热孔']),
  E('faguang', 'craft', '发光背板', '柜内背板做成整块发光（灯箱）', '展示更有氛围，酒柜、展示柜的主角', ['发光背板', '背板发光', '灯箱']),
  E('yingpeng', 'craft', '硬碰', '两种材质直接对接、不加收边条', '立面极简、线条干净（对工艺精度要求高）', ['硬碰']),
  // —— 二、设计手法 ——
  E('xuantiao', 'method', '悬挑', '结构一端固定、一端悬空伸出（栖木原文：让家具如漂浮于空间）', '轻盈、漂浮感', ['悬挑']),
  E('dieji', 'method', '叠级', '体块一层层往前 / 往上叠', '有层次，不呆板', ['叠级']),
  E('cuowei', 'method', '错位', '体块上下 / 前后错开，不对齐', '打破方正，有动感', ['错位']),
  E('lifeng', 'method', '离缝', '体块之间留缝分开（与「脱缝」同理，放在体块组合里讲）', '体块独立、更轻', ['离缝']),
  E('jiadiao', 'method', '夹吊', '两个高体块中间夹着吊柜 / 层板', '中间留空、通透，可做展示', ['夹吊']),
  E('jintui', 'method', '进退', '同一立面有凸出、有凹进的体块', '深浅对比、立体', ['进退']),
  E('weihe', 'method', '围合', '体块围出一个框 / 龛', '聚焦中间的展示或功能区', ['围合']),
  E('yaohe', 'method', '咬合', '体块互相嵌进去，像齿轮咬住', '整体感强、有设计张力', ['咬合']),
  E('chuancha', 'method', '穿插', '横板穿过竖向体块', '线条贯穿，空间连贯', ['穿插']),
  E('juzhen', 'method', '矩阵', '同尺寸的模块整齐重复', '秩序感、安静', ['矩阵']),
];

/**
 * 溪岸文案（md 第四节）：给客人看的文字。卡片印：名称 → 好处（大字）→ 一句话（小字）。
 * status：'pending' 待审（不播）· 'approved' 老板审过 ✅ · 'official' 溪岸官方说法（骨骼线 = 品牌手册 p.9、p.23–24）
 * 每条「好处」只换成溪岸的口吻，意思来自第一、二节的「好处 / 效果」，不加新承诺。
 */
export const CRAFT_COPY = {
  tuofeng: { status: 'pending', zh: { oneLine: '柜子和墙、天花之间，留一道均匀的细缝。', benefit: '柜子像轻轻浮在墙前，不压人；墙面有一点不平，也被这道缝悄悄藏住。' }, en: { name: 'Shadow Gap', oneLine: 'A fine, even gap between the cabinetry and the wall or ceiling.', benefit: 'The cabinet seems to float just off the wall, never heavy — and the gap quietly hides a wall that isn’t perfectly straight.' } },
  zhuifeng: { status: 'pending', zh: { oneLine: '柜门、柜体、墙板之间的缝，连成一条线。', benefit: '一整面墙读起来是一件作品，而不是几个柜子拼在一起；看久了，也是安静的。' }, en: { name: 'Aligned Joints', oneLine: 'Every joint between doors, cabinets and wall panels runs on one line.', benefit: 'The whole wall reads as a single piece, not cabinets side by side — calm to live with, day after day.' } },
  duiwen: { status: 'pending', zh: { oneLine: '相邻柜门的木纹接得上，像从同一块木头里取出来。', benefit: '大面木作完整、沉静；木头自己的纹理，就是装饰。' }, en: { name: 'Continuous Grain', oneLine: 'The grain flows from one door to the next, as if cut from a single board.', benefit: 'A large timber surface stays whole and calm — the wood’s own grain is the ornament.' } },
  duikai: { status: 'pending', zh: { oneLine: '宽幅山纹木皮从中间裁开，再随机拼接，山纹与直纹自然相接。', benefit: '一片天然木皮只有那么宽；拼得自然，整面墙才有木头本来的样子。' }, en: { name: 'Split & Mixed Veneer', oneLine: 'Wide veneer split down the middle and re-laid at random, so the grain meets naturally.', benefit: 'A single natural veneer is only so wide; laid with care, a whole wall still looks like wood as it grows.' } },
  xicao: { status: 'pending', zh: { oneLine: '在柜门边铣出一道凹槽，手指一勾就开。', benefit: '不装拉手，立面干净利落；走过时，也不会勾到衣服。' }, en: { name: 'Routed Finger Pull', oneLine: 'A groove routed into the door edge — your fingers find it, the door opens.', benefit: 'No handles, a clean face, and nothing to catch your sleeve as you pass.' } },
  lacao: { status: 'pending', zh: { oneLine: '门板表面铣出一条条竖向细槽。', benefit: '光从侧面掠过，留下一道道细影；只用一个颜色，也有节奏和手感。' }, en: { name: 'Fluted Panel', oneLine: 'Fine vertical flutes routed across the door face.', benefit: 'Side light leaves a rhythm of fine shadows — one colour, yet full of texture to the eye and hand.' } },
  xieqie: { status: 'pending', zh: { oneLine: '门板、抽屉面的边，做成斜角。', benefit: '斜面本身就是拉手，不多一件五金；正面看去更轻薄、利落。' }, en: { name: 'Bevelled Edge', oneLine: 'The edge of the door or drawer front is cut at an angle.', benefit: 'The bevel is the handle — no extra hardware, and the front looks slimmer and cleaner.' } },
  xiepin: { status: 'pending', zh: { oneLine: '两块板在转角以 45° 相接，木纹和边线绕过转角不断开。', benefit: '看不到板材的断面，转角像整块实木一样完整。' }, en: { name: 'Mitred Corner', oneLine: 'Two panels meet at 45° on the corner, so grain and edge wrap around unbroken.', benefit: 'No raw board edge in sight — the corner reads like a single piece of solid wood.' } },
  haitang: { status: 'pending', zh: { oneLine: '外转角不做尖直角，而是收一个内凹的小方角，取自传统家具。', benefit: '不磕手、不易崩边；转角多一道小小的阴影，是东方家具的细致。' }, en: { name: 'Haitang Corner', oneLine: 'The outer corner steps in with a small notch instead of a sharp angle — from classical Chinese furniture.', benefit: 'Kinder to the hand, less prone to chipping, and one small shadow on the corner — the quiet care of Eastern furniture.' } },
  jiaxin: { status: 'pending', zh: { oneLine: '层板或边框用三层材料叠成，侧面露出中间一道对比色细线。', benefit: '层板看起来更薄、更轻；侧面那道细线，是走近了才发现的细节。' }, en: { name: 'ABA Sandwich Edge', oneLine: 'Shelves or frames built in three layers, A–B–A, revealing a fine contrasting line on the edge.', benefit: 'Shelves look thinner and lighter; the fine line on the edge is a detail you only notice up close.' } },
  gugexian: { status: 'official', zh: { oneLine: '灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。', benefit: '细线框让每扇柜门都有一道影子，有细节但不繁复。' }, en: { name: 'Skeleton Line', oneLine: 'Inspired by classical solid-wood furniture: the frame is both the ornament and the handle.', benefit: 'A fine frame line gives each door its own shadow — detail without ornament.' } },
  yuanhu: { status: 'pending', zh: { oneLine: '柜体、墙板或台面，做成弧形。', benefit: '动线更顺，转角不再是硬角；空间多了一份柔和，小孩和长辈走过也安心。' }, en: { name: 'Curves', oneLine: 'Cabinets, wall panels or worktops shaped in a curve.', benefit: 'Movement flows, corners stop being hard edges, and the room softens — easier for children and elders passing by.' } },
  gezha: { status: 'pending', zh: { oneLine: '一排间隔的木条，做隔断或柜面。', benefit: '分开了区域，却不挡光、不闷；木条之间，有光有影。' }, en: { name: 'Timber Slats', oneLine: 'A row of spaced timber slats, used as a screen or a cabinet front.', benefit: 'It separates the space without blocking light or air — light and shadow move between the slats.' } },
  gangqin: { status: 'pending', zh: { oneLine: '竖条长短、进出不一，像一排琴键。', benefit: '比格栅多一层节奏和立体感；光一照，墙面就有了起伏。' }, en: { name: 'Piano-key Slats', oneLine: 'Vertical slats of varied length and depth, like a row of piano keys.', benefit: 'One more layer of rhythm and depth than plain slats — when light falls on it, the wall begins to move.' } },
  xixing: { status: 'pending', zh: { oneLine: '在板面上铣出造型，例如半圆拉手或图案。', benefit: '拉手和造型合为一体，柜子有了自己的表情。' }, en: { name: 'Routed Motif', oneLine: 'A shape routed into the panel — a half-moon pull, or a pattern.', benefit: 'Handle and form become one, and the cabinet gains a character of its own.' } },
  yinxingmen: { status: 'pending', zh: { oneLine: '门和墙板、柜门做平，不留门套。', benefit: '门「消失」在墙里，只留一圈细缝；整面墙干净、安静。' }, en: { name: 'Hidden Door', oneLine: 'The door sits flush with the wall panels or cabinet doors, with no frame.', benefit: 'The door disappears into the wall — only a fine outline remains, and the wall stays quiet.' } },
  touqi: { status: 'pending', zh: { oneLine: '板上铣出一排细长的透气缝。', benefit: '潮湿的天气里，鞋柜、设备柜也不闷、不生味——空气一直在流动。' }, en: { name: 'Ventilation Slots', oneLine: 'A row of fine slots routed into the panel.', benefit: 'Even in humid weather, shoe and equipment cabinets stay fresh — the air keeps moving.' } },
  faguang: { status: 'pending', zh: { oneLine: '柜内整块背板会发光，像一个灯箱。', benefit: '柔光从背后透出来，酒和收藏，成了空间的主角。' }, en: { name: 'Lit Back Panel', oneLine: 'The whole back panel of the cabinet glows, like a light box.', benefit: 'Soft light from behind — your wine and your collection become the heart of the room.' } },
  yingpeng: { status: 'pending', zh: { oneLine: '两种材质直接对接，不加收边条。', benefit: '线条极简、干净；这需要很高的加工精度，是看不见的功夫。' }, en: { name: 'Direct Junction', oneLine: 'Two materials meet directly, with no trim strip.', benefit: 'The lines stay pure and clean — it takes great precision, the kind of craft you don’t see.' } },
  xuantiao: { status: 'pending', zh: { oneLine: '一端固定、一端悬空伸出的结构。', benefit: '家具像轻轻浮在空间里，轻盈、不压人。' }, en: { name: 'Cantilever', oneLine: 'A structure fixed at one end, reaching out freely at the other.', benefit: 'The furniture seems to float — light, never heavy.' } },
  dieji: { status: 'pending', zh: { oneLine: '体块一层层往前、往上叠。', benefit: '立面有了层次，像山势一样起伏，不呆板。' }, en: { name: 'Stepped Layers', oneLine: 'Volumes stacked forward and upward, layer on layer.', benefit: 'The wall gains depth, rising like a hillside — never flat.' } },
  cuowei: { status: 'pending', zh: { oneLine: '体块上下、前后错开，不刻意对齐。', benefit: '打破方正，空间里多了一点自然的动感。' }, en: { name: 'Offset', oneLine: 'Volumes shifted up, down, forward or back, deliberately out of line.', benefit: 'It breaks the box, and adds a natural sense of movement.' } },
  lifeng: { status: 'pending', zh: { oneLine: '体块之间留一道缝，彼此分开。', benefit: '每个体块独立、轻盈，整面墙也因此透一口气。' }, en: { name: 'Separated Volumes', oneLine: 'A gap left between volumes, setting each one apart.', benefit: 'Each volume stands on its own and feels lighter — the whole wall breathes.' } },
  jiadiao: { status: 'pending', zh: { oneLine: '两个高体块之间，夹着吊柜或层板。', benefit: '中间留空、通透，可以放上喜欢的东西。' }, en: { name: 'Suspended Between', oneLine: 'A hanging cabinet or shelf held between two tall volumes.', benefit: 'The middle stays open and airy — a place for the things you love.' } },
  jintui: { status: 'pending', zh: { oneLine: '同一面墙上，有凸出、也有凹进的体块。', benefit: '深浅之间有了光影，立面更立体。' }, en: { name: 'Advance & Recess', oneLine: 'Volumes that step forward and step back on the same wall.', benefit: 'Light and shadow gather between the depths, and the wall gains dimension.' } },
  weihe: { status: 'pending', zh: { oneLine: '体块围出一个框、一个龛。', benefit: '视线自然落在中间，展示或常用的那一格，成为焦点。' }, en: { name: 'Framed Niche', oneLine: 'Volumes that frame a niche.', benefit: 'The eye settles naturally on the centre — the display, or the everyday spot, becomes the focus.' } },
  yaohe: { status: 'pending', zh: { oneLine: '体块互相嵌入，像齿轮咬合。', benefit: '整体感强，静中有一点张力。' }, en: { name: 'Interlocking', oneLine: 'Volumes that fit into one another, like gears meshing.', benefit: 'A strong sense of unity, with a quiet tension.' } },
  chuancha: { status: 'pending', zh: { oneLine: '横板穿过竖向的体块。', benefit: '一条线贯穿到底，空间被连成一体。' }, en: { name: 'Intersecting', oneLine: 'A horizontal shelf running through vertical volumes.', benefit: 'One line carries through, and the space reads as a whole.' } },
  juzhen: { status: 'pending', zh: { oneLine: '同样尺寸的模块，整齐重复。', benefit: '秩序本身，就是一种安静。' }, en: { name: 'Grid', oneLine: 'Modules of the same size, repeated in an even grid.', benefit: 'Order, in itself, is a kind of quiet.' } },
};

// 状态跟着溪岸文案走（没有文案的条目 = 待审）
for (const e of CRAFT_VOCAB) e.status = CRAFT_COPY[e.id]?.status || 'pending';
export const CRAFT_BY_ID = new Map(CRAFT_VOCAB.map((e) => [e.id, e]));
export const craftById = (id) => CRAFT_BY_ID.get(id) || null;

/** 给客人看的文字：溪岸文案（md 第四节）；还没写文案的退回整理稿（去掉 md 的 ** 强调） */
export function craftText(entry, lang = 'zh') {
  const strip = (s) => String(s || '').replace(/\*\*/g, '');
  const c = CRAFT_COPY[entry.id];
  const zh = { name: entry.zh, oneLine: strip(c?.zh.oneLine ?? entry.oneLine), benefit: strip(c?.zh.benefit ?? entry.benefit) };
  const en = c?.en?.name && c.en.benefit ? { name: c.en.name, oneLine: c.en.oneLine || '', benefit: c.en.benefit } : null;
  return { zh, en, lang };
}

// ---------------------------------------------------------------------------
// 从图纸文字认出来
// ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s　]+/g, '');
const isLatin = (s) => /^[a-z0-9 °-]+$/i.test(s);
// 前面紧挨着否定词（「不做海棠角」「取消隐形门」「无透气孔」）→ 不算
const NEGATION = /(不|无|没有|没|取消|去掉|不要|不用|免)[做用加设留开]?$/;

/**
 * 这一页的图纸文字从哪里来（导入时从 PDF 读出来、设计师可能改过的栏位）：
 *   标注（notes 的小标题与正文）、视角名（subtitle）、材料部位（materials[].role）
 * @returns {{ where:string, text:string }[]}
 */
export function craftSources(slide) {
  const out = [];
  (slide?.notes || []).forEach((n, i) => {
    const t = [n?.label, n?.text].map((s) => String(s ?? '').trim()).filter(Boolean).join('：');
    if (t) out.push({ where: `标注 ${i + 1}`, text: t });
  });
  if (String(slide?.subtitle ?? '').trim()) out.push({ where: '视角名', text: String(slide.subtitle).trim() });
  (slide?.materials || []).forEach((m) => {
    if (String(m?.role ?? '').trim()) out.push({ where: '材料部位', text: String(m.role).trim() });
  });
  return out;
}

/** 一段文字里有没有这个词条（返回命中的别名；没有 = null） */
export function matchEntry(entry, text) {
  const raw = String(text ?? '');
  const t = norm(raw);
  if (!t) return null;
  // 先挖掉 exclude 的写法（「夹心板」），剩下的再找
  let hay = t;
  for (const ex of entry.exclude || []) hay = hay.split(norm(ex)).join('｜');
  for (const alias of entry.aliases) {
    const a = norm(alias);
    if (!a) continue;
    let from = 0;
    while (true) {
      const k = hay.indexOf(a, from);
      if (k < 0) break;
      from = k + 1;
      if (isLatin(alias)) {
        // 拉丁字母整词：前后不能紧挨字母（'aba' 不认 'abacus'）
        const before = hay[k - 1] || '';
        const after = hay[k + a.length] || '';
        if (/[a-z]/.test(before) || /[a-z]/.test(after)) continue;
      }
      if (NEGATION.test(hay.slice(Math.max(0, k - 4), k))) continue;
      return alias;
    }
  }
  return null;
}

/**
 * 建议：这一页图纸文字里写着的词条（按词库顺序；每条带原文）
 * @returns {{ id, entry, evidence:{ where, text, alias } }[]}
 */
export function detectCrafts(slide, vocab = CRAFT_VOCAB) {
  const sources = craftSources(slide);
  const out = [];
  for (const entry of vocab) {
    for (const src of sources) {
      const alias = matchEntry(entry, src.text);
      if (alias) {
        out.push({ id: entry.id, entry, evidence: { ...src, alias } });
        break;
      }
    }
  }
  return out;
}

/** 设计师勾过的（按勾的先后；词库里没有的 id 丢掉） */
export const tickedCrafts = (slide) => [...new Set(slide?.crafts || [])].map(craftById).filter(Boolean);

/** 勾上 / 取消（返回新的 crafts 列表） */
export function toggleCraft(list, id, on) {
  const cur = [...new Set(list || [])].filter((x) => CRAFT_BY_ID.has(x));
  if (on) return cur.includes(id) ? cur : [...cur, id];
  return cur.filter((x) => x !== id);
}

/**
 * 展厅播放要讲的：勾过的 + 老板审过的（preview = 内部预览：待审的也放，卡片上标「待审」）+ English 版要有英文
 * @param {{ preview?:boolean, lang?:string, skip?:Set<string> }} opts  skip = 同一空间前面已经讲过的
 * @returns {{ entries:object[], held:{ entry, why:string }[] }}  held = 勾了但这次不放的（原因给编辑器提示）
 */
export function playableCrafts(slide, { preview = false, lang = 'zh', skip } = {}) {
  const entries = [];
  const held = [];
  for (const entry of tickedCrafts(slide)) {
    if (skip?.has(entry.id)) continue;
    if (!isPlayable(entry) && !preview) held.push({ entry, why: '定义待老板审，审过才播' });
    else if (lang === 'en' && !craftText(entry, lang).en) held.push({ entry, why: '还没有审过的英文，English 版不播' });
    else if (entries.length >= CRAFT_MAX) held.push({ entry, why: `一个房间最多讲 ${CRAFT_MAX} 个` });
    else entries.push(entry);
  }
  return { entries, held };
}
