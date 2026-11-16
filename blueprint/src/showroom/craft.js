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
 * group：'craft' 工艺细节（md 一）/ 'method' 设计手法（md 二，「好处」= md 的「效果」）/ 'series' 溪岸五大原创系列（没有研究底稿，只有官方说法）
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
  E('gugexian', 'craft', '骨骼线', '柜面上凸出的竖向 / 横向线条，既是结构感也是拉手', '不用另装拉手，立面有家具感', ['骨骼线', 'skeleton line'], { exclude: ['骨骼线系列'] }),
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
  // —— 三、溪岸五大原创系列（md 第四节；文字 = 品牌官方说法，invite/assets/js/visi/data.js MB.SERIES_CONCEPT，测试对一字不差）——
  E('s_skeleton', 'series', '骨骼线系列', '', '', ['骨骼线系列', '骨骼线', 'skeleton line'], { series: 'skeleton' }),
  E('s_mountain', 'series', '空山系列', '', '', ['空山系列', '空山', 'empty mountain'], { series: 'mountain' }),
  E('s_weaving', 'series', '织系列', '', '', ['织系列', 'weaving series'], { series: 'weaving' }),
  E('s_misty', 'series', '雾山系列', '', '', ['雾山系列', '雾山', 'misty mountain'], { series: 'misty' }),
  E('s_wabi', 'series', '侘寂东方系列', '', '', ['侘寂东方', '侘寂', 'wabi-sabi'], { series: 'wabi' }),
];

/**
 * 溪岸文案（md 第四节）：给客人看的文字。卡片印：名称 → 题眼（一句有画面的话）→ 特点（是什么、看得到什么）→ 优势（对生活的好处）。
 * status：'pending' 待审（不播）· 'approved' 老板审过 ✅ · 'official' 溪岸官方说法
 * 工艺 / 手法：特点、优势的意思都来自第一、二节研究底稿（不加新承诺）；骨骼线（工艺）与五大系列用品牌官方原文，空栏不印。
 */
export const CRAFT_COPY = {
  tuofeng: { status: 'pending', zh: { title: '离墙一线，柜子便轻了。', feature: '柜体与墙、天花、旁板之间，留一道均匀的凹缝。', advantage: '柜子像浮在墙前，更轻；墙面的些许不平，也被这道缝收住。' }, en: { name: 'Shadow Gap', title: 'A line from the wall, and the cabinet grows light.', feature: 'An even recessed gap between the cabinet and the wall, ceiling or side panel.', advantage: 'The cabinet seems to float and feels lighter; slight unevenness in the wall disappears into the gap.' } },
  zhuifeng: { status: 'pending', zh: { title: '一面墙，只说一句话。', feature: '不同柜子、门板、墙板之间的缝，对齐成一条线。', advantage: '整面墙是一体的设计，看起来整齐、不乱。' }, en: { name: 'Aligned Joints', title: 'One wall, one sentence.', feature: 'The joints between cabinets, doors and wall panels line up in one line.', advantage: 'The whole wall reads as one design — orderly, never busy.' } },
  duiwen: { status: 'pending', zh: { title: '木纹从一扇门，走到下一扇门。', feature: '相邻门板的木纹接得上，像同一块木头。', advantage: '大面木作更完整、更有质感。' }, en: { name: 'Continuous Grain', title: 'The grain walks from one door to the next.', feature: 'The grain continues across neighbouring doors, as if from one board.', advantage: 'Large timber surfaces look whole and rich.' } },
  duikai: { status: 'pending', zh: { title: '把一棵树，铺成一面墙。', feature: '宽幅山纹木皮从中间裁开再随机拼，山纹与直纹自然接上。', advantage: '天然木皮尺寸有限，拼得好，整面墙才有自然感。' }, en: { name: 'Split & Mixed Veneer', title: 'One tree, laid out as a wall.', feature: 'Wide cathedral-grain veneer is split down the middle and re-laid at random, so the grain meets naturally.', advantage: 'Natural veneer comes only so wide; laid well, the whole wall keeps a natural look.' } },
  xicao: { status: 'pending', zh: { title: '把手，藏进了门的边缘。', feature: '在门板边上铣出凹槽，当作拉手。', advantage: '不用装拉手，立面干净；也不会勾到衣服。' }, en: { name: 'Routed Finger Pull', title: 'The handle hides in the edge of the door.', feature: 'A groove routed into the door edge serves as the handle.', advantage: 'No hardware, a clean face, and nothing to catch your clothes.' } },
  lacao: { status: 'pending', zh: { title: '光走过，留下一行行细影。', feature: '门板表面铣出一条条竖向凹槽，有凹凸纹理。', advantage: '有节奏感和手感，单一颜色也不单调。' }, en: { name: 'Fluted Panel', title: 'Light passes, leaving lines of fine shadow.', feature: 'Vertical grooves routed across the door face give it a ribbed texture.', advantage: 'Rhythm and touch — even a single colour never looks plain.' } },
  xieqie: { status: 'pending', zh: { title: '一道斜面，就是拉手。', feature: '门板、抽屉面的边，做成斜角。', advantage: '斜边本身就是拉手；立面显薄、利落。' }, en: { name: 'Bevelled Edge', title: 'One bevel is the handle.', feature: 'The edge of the door or drawer front is cut at an angle.', advantage: 'The bevel is the handle; the front looks slim and crisp.' } },
  xiepin: { status: 'pending', zh: { title: '转角处，木纹没有断。', feature: '两块板在转角以 45° 拼接，木纹和边线绕过转角不断开。', advantage: '看不到板材断面，像一整块实木。' }, en: { name: 'Mitred Corner', title: 'At the corner, the grain does not break.', feature: 'Two panels meet at 45° on the corner; grain and edge wrap around unbroken.', advantage: 'No exposed board edge — it reads as solid wood.' } },
  haitang: { status: 'pending', zh: { title: '转角收一笔，是东方家具的温柔。', feature: '外转角不做尖直角，内收一个小方角，取自传统家具。', advantage: '不磕手、不易崩边；转角多一道细影，有东方味。' }, en: { name: 'Haitang Corner', title: 'One small step at the corner — the gentleness of Eastern furniture.', feature: 'Instead of a sharp corner, the outer corner steps in with a small notch, from classical furniture.', advantage: 'Kind to the hand, less prone to chipping, with a fine shadow and an Eastern feel.' } },
  jiaxin: { status: 'pending', zh: { title: '走近了，才看见那一道线。', feature: '层板或边框用 A + B + A 三层叠成，侧面露出一道对比色细线。', advantage: '层板看起来更薄、更精致，多一处设计细节。' }, en: { name: 'ABA Sandwich Edge', title: 'Come closer, and the line appears.', feature: 'Shelves or frames layered A + B + A, showing a fine contrasting line on the edge.', advantage: 'Shelves look thinner and more refined, with one more crafted detail.' } },
  gugexian: { status: 'official', zh: { title: '', feature: '灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。', advantage: '细线框让每扇柜门都有一道影子，有细节但不繁复。' }, en: { name: 'Skeleton Line', title: '', feature: 'Inspired by classical solid-wood furniture: the frame is both the ornament and the handle.', advantage: 'A fine frame line gives each door its own shadow — detail without ornament.' } },
  yuanhu: { status: 'pending', zh: { title: '没有棱角的家，走起来更柔软。', feature: '柜体、墙板、台面做成弧形。', advantage: '动线更顺、更安全，空间更柔和。' }, en: { name: 'Curves', title: 'A home without hard corners walks more softly.', feature: 'Cabinets, wall panels or worktops shaped in a curve.', advantage: 'Smoother, safer movement, and a softer room.' } },
  gezha: { status: 'pending', zh: { title: '隔开，却不隔光。', feature: '一排间隔的木条，做隔断或柜面。', advantage: '通透、透气；有分区，又不封闭。' }, en: { name: 'Timber Slats', title: 'Divided, yet never closed to light.', feature: 'A row of spaced timber slats, used as a screen or a cabinet front.', advantage: 'Open and airy — it divides the space without closing it off.' } },
  gangqin: { status: 'pending', zh: { title: '一排琴键，等光来弹奏。', feature: '竖条长短、进出不一，像一排琴键。', advantage: '比格栅多一层节奏和立体感。' }, en: { name: 'Piano-key Slats', title: 'A row of keys, waiting for the light to play.', feature: 'Vertical slats of varied length and depth, like piano keys.', advantage: 'More rhythm and depth than plain slats.' } },
  xixing: { status: 'pending', zh: { title: '拉手与造型，本是一体。', feature: '在板上铣出造型，例如半圆拉手、图案。', advantage: '拉手和造型合为一体，有个性。' }, en: { name: 'Routed Motif', title: 'Handle and form, one and the same.', feature: 'A shape routed into the panel — a half-moon pull or a pattern.', advantage: 'Handle and form become one, with character.' } },
  yinxingmen: { status: 'pending', zh: { title: '门在，墙仍然安静。', feature: '门和墙板、柜门做平，不留门套，只剩一圈细缝。', advantage: '门「消失」在墙里，整面墙干净。' }, en: { name: 'Hidden Door', title: 'The door is there; the wall stays quiet.', feature: 'The door sits flush with the wall panels or cabinet doors — no frame, only a fine outline.', advantage: 'The door disappears, and the wall stays clean.' } },
  touqi: { status: 'pending', zh: { title: '让柜子，也能呼吸。', feature: '板上铣出一排细长的透气缝。', advantage: '鞋柜、设备柜不闷、不生味。' }, en: { name: 'Ventilation Slots', title: 'Let the cabinet breathe, too.', feature: 'A row of narrow ventilation slots routed into the panel.', advantage: 'Shoe and equipment cabinets stay fresh, never stuffy.' } },
  faguang: { status: 'pending', zh: { title: '让珍藏，在柔光里被看见。', feature: '柜内整块背板会发光，像一个灯箱。', advantage: '展示更有氛围，是酒柜、展示柜的主角。' }, en: { name: 'Lit Back Panel', title: 'Let what you treasure be seen in soft light.', feature: 'The whole back panel inside the cabinet glows like a light box.', advantage: 'Displays gain atmosphere — the centrepiece of a wine or display cabinet.' } },
  yingpeng: { status: 'pending', zh: { title: '两种材质，直接相遇。', feature: '两种材质直接对接，不加收边条。', advantage: '立面极简、线条干净；对工艺精度要求很高。' }, en: { name: 'Direct Junction', title: 'Two materials, meeting face to face.', feature: 'Two materials meet directly, with no trim strip.', advantage: 'A minimal face and clean lines — it demands real precision.' } },
  xuantiao: { status: 'pending', zh: { title: '一端扎根，一端向空中伸出。', feature: '结构一端固定、一端悬空伸出。', advantage: '轻盈，家具像浮在空间里。' }, en: { name: 'Cantilever', title: 'Rooted at one end, reaching into the air at the other.', feature: 'A structure fixed at one end, reaching out freely at the other.', advantage: 'Light — the furniture seems to float.' } },
  dieji: { status: 'pending', zh: { title: '一层一层，像山势起伏。', feature: '体块一层层往前、往上叠。', advantage: '有层次，不呆板。' }, en: { name: 'Stepped Layers', title: 'Layer upon layer, like the rise of hills.', feature: 'Volumes stacked forward and upward, layer by layer.', advantage: 'Depth and layering, never flat.' } },
  cuowei: { status: 'pending', zh: { title: '不必对齐，才有动感。', feature: '体块上下、前后错开，不对齐。', advantage: '打破方正，有动感。' }, en: { name: 'Offset', title: 'Out of line, and so alive.', feature: 'Volumes shifted up, down, forward or back, out of line.', advantage: 'It breaks the box and adds movement.' } },
  lifeng: { status: 'pending', zh: { title: '留一道缝，让墙透一口气。', feature: '体块之间留一道缝分开。', advantage: '每个体块独立、更轻。' }, en: { name: 'Separated Volumes', title: 'Leave a gap, and let the wall breathe.', feature: 'A gap left between the volumes.', advantage: 'Each volume stands on its own, and feels lighter.' } },
  jiadiao: { status: 'pending', zh: { title: '两座高柜之间，留一处空。', feature: '两个高体块中间，夹着吊柜或层板。', advantage: '中间留空、通透，可以做展示。' }, en: { name: 'Suspended Between', title: 'Between two tall cabinets, a space left open.', feature: 'A hanging cabinet or shelf held between two tall volumes.', advantage: 'The middle stays open and airy, ready for display.' } },
  jintui: { status: 'pending', zh: { title: '有进有退，光影自来。', feature: '同一立面上，有凸出、也有凹进的体块。', advantage: '深浅对比，立面更立体。' }, en: { name: 'Advance & Recess', title: 'Step forward, step back — light and shadow follow.', feature: 'Volumes that project and recess on the same wall.', advantage: 'The contrast of depth gives the wall dimension.' } },
  weihe: { status: 'pending', zh: { title: '围出一处，让目光停留。', feature: '体块围出一个框、一个龛。', advantage: '视线聚焦在中间的展示或功能区。' }, en: { name: 'Framed Niche', title: 'Frame a place, and the eye will rest there.', feature: 'Volumes that enclose a frame or a niche.', advantage: 'The eye settles on the display or working area at its centre.' } },
  yaohe: { status: 'pending', zh: { title: '彼此嵌入，静中有力。', feature: '体块互相嵌入，像齿轮咬合。', advantage: '整体感强，有设计张力。' }, en: { name: 'Interlocking', title: 'Fitted into each other — stillness with strength.', feature: 'Volumes that fit into one another, like meshing gears.', advantage: 'Strong unity, with design tension.' } },
  chuancha: { status: 'pending', zh: { title: '一条线，穿过整个空间。', feature: '横板穿过竖向体块。', advantage: '线条贯穿，空间连贯。' }, en: { name: 'Intersecting', title: 'One line runs through the whole room.', feature: 'A horizontal panel passing through vertical volumes.', advantage: 'A continuous line ties the space together.' } },
  juzhen: { status: 'pending', zh: { title: '秩序，本身就是一种安静。', feature: '同样尺寸的模块，整齐重复。', advantage: '有秩序感，安静。' }, en: { name: 'Grid', title: 'Order, in itself, is a kind of quiet.', feature: 'Modules of the same size, repeated evenly.', advantage: 'A sense of order, and calm.' } },
  // 溪岸系列：题眼 = 系列 title，特点 = 设计理念 note（品牌官方原文）；官方没有「优势」，留空不印
  s_skeleton: { status: 'official', zh: { title: '在时间的长河，寻找关于家具的记忆。', feature: '灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。', advantage: '' }, en: { name: 'Skeleton Line Series', title: 'In the long river of time, looking for the memory of furniture.', feature: 'Inspired by classical solid-wood furniture: the frame is both the ornament and the handle.', advantage: '' } },
  s_mountain: { status: 'official', zh: { title: '入空山，感物近人。', feature: '以「退」为设计哲学，「空而不空」的陈列美学。', advantage: '' }, en: { name: 'Empty Mountain Series', title: 'Enter the empty mountain, and feel close to things and people.', feature: '“Stepping back” as a design philosophy — display that is empty, yet never empty.', advantage: '' } },
  s_weaving: { status: 'official', zh: { title: '自然柔韧，回归感性生活。', feature: '在城市的喧嚣中迷失的感觉，在接近麻纤维的时候，会慢慢平复下来。', advantage: '' }, en: { name: 'Weaving Series', title: 'Natural and supple — back to a life of the senses.', feature: 'What gets lost in the noise of the city slowly settles when you are close to linen.', advantage: '' } },
  s_misty: { status: 'official', zh: { title: '雾山春居。', feature: '轻于色、安于形：取晨雾之「灰」、春山之「木」、早春山间将有未有之「绿」，消隐大型柜体的存在感，让空间平静温和。', advantage: '' }, en: { name: 'Misty Mountain Series', title: 'A spring house on the misty mountain.', feature: 'Light in colour, at ease in form: the grey of morning mist, the wood of the spring hills and the green that is only just arriving — large cabinetry fades back and the room stays calm and gentle.', advantage: '' } },
  s_wabi: { status: 'official', zh: { title: '山，有它的时间。', feature: '打磨出能滋养心灵、连接自然、经得起时间洗礼的设计。', advantage: '' }, en: { name: 'Wabi-Sabi Eastern Series', title: 'Mountains have their own time.', feature: 'Design that nourishes the mind, connects with nature, and stands the test of time.', advantage: '' } },
};

// 状态跟着溪岸文案走（没有文案的条目 = 待审）
for (const e of CRAFT_VOCAB) e.status = CRAFT_COPY[e.id]?.status || 'pending';
export const CRAFT_BY_ID = new Map(CRAFT_VOCAB.map((e) => [e.id, e]));
export const craftById = (id) => CRAFT_BY_ID.get(id) || null;

/** 给客人看的文字：溪岸文案（md 第四节）→ { zh:{ name, title, feature, advantage }, en:{ … } | null }；没有文案的退回研究底稿 */
export function craftText(entry, lang = 'zh') {
  const strip = (s) => String(s || '').replace(/\*\*/g, '');
  const c = CRAFT_COPY[entry.id];
  const zh = c
    ? { name: entry.zh, title: c.zh.title, feature: c.zh.feature, advantage: c.zh.advantage }
    : { name: entry.zh, title: '', feature: strip(entry.oneLine), advantage: strip(entry.benefit) };
  const en = c?.en?.name && (c.en.feature || c.en.title) ? { name: c.en.name, title: c.en.title, feature: c.en.feature, advantage: c.en.advantage } : null;
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
