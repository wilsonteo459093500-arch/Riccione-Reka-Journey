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
 * 溪岸文案（md 第四节）：给客人看的文字。卡片印：名称 → 题眼（大字，字段 benefit）→ 设计理念（小字，字段 oneLine）。
 * 写法和五大系列一样：大字一句有画面的话，小字讲清楚做法和对生活的好处。
 * status：'pending' 待审（不播）· 'approved' 老板审过 ✅ · 'official' 溪岸官方说法（骨骼线 = 品牌手册 p.9、p.23–24）
 * 意思都来自第一、二节的「一句话 / 好处 / 效果」，只换成溪岸的口吻，不加新承诺。
 */
export const CRAFT_COPY = {
  tuofeng: { status: 'pending', zh: { oneLine: '柜与墙、与天花之间，留一道均匀的细缝：柜体像浮在墙前，墙面的些许不平，也被这道影子悄悄收住。', benefit: '离墙一线，柜子便轻了。' }, en: { name: 'Shadow Gap', oneLine: 'A fine, even gap between cabinet and wall or ceiling: the piece seems to float, and the shadow quietly absorbs a wall that isn’t perfectly true.', benefit: 'A line from the wall, and the cabinet grows light.' } },
  zhuifeng: { status: 'pending', zh: { oneLine: '门与门、柜与墙板之间的缝，对齐成一条线：几组柜子，读起来是同一件作品。', benefit: '一面墙，只说一句话。' }, en: { name: 'Aligned Joints', oneLine: 'The joints between doors, cabinets and wall panels align into a single line — many pieces read as one.', benefit: 'One wall, one sentence.' } },
  duiwen: { status: 'pending', zh: { oneLine: '相邻柜门的木纹接续不断，像取自同一块木：不需装饰，纹理本身就是表情。', benefit: '木纹从一扇门，走到下一扇门。' }, en: { name: 'Continuous Grain', oneLine: 'Neighbouring doors carry continuous grain, as if cut from one board — no ornament needed; the grain is the expression.', benefit: 'The grain walks from one door to the next.' } },
  duikai: { status: 'pending', zh: { oneLine: '宽幅山纹木皮从中剖开、随机拼接，山纹与直纹自然相接：木皮尺寸有限，拼得自然，整墙才有木的本来样子。', benefit: '把一棵树，铺成一面墙。' }, en: { name: 'Split & Mixed Veneer', oneLine: 'Wide veneer is split down the middle and re-laid at random, so the grain meets naturally — veneer comes only so wide; laid with care, the wall keeps the look of living wood.', benefit: 'One tree, laid out as a wall.' } },
  xicao: { status: 'pending', zh: { oneLine: '在门边铣出一道凹槽，指尖一勾即开：立面干净，走过也不勾衣角。', benefit: '把手，藏进了门的边缘。' }, en: { name: 'Routed Finger Pull', oneLine: 'A groove routed into the door edge opens at a fingertip — a clean face, and nothing to catch a sleeve.', benefit: 'The handle hides in the edge of the door.' } },
  lacao: { status: 'pending', zh: { oneLine: '门板铣出一道道竖向细槽：只用一种颜色，也有节奏、有手感。', benefit: '光走过，留下一行行细影。' }, en: { name: 'Fluted Panel', oneLine: 'Vertical flutes routed across the door — a single colour, yet full of rhythm to the eye and hand.', benefit: 'Light passes, leaving lines of fine shadow.' } },
  xieqie: { status: 'pending', zh: { oneLine: '门板与抽屉面的边做成斜角，不多一件五金：正面看去更轻薄、利落。', benefit: '一道斜面，就是拉手。' }, en: { name: 'Bevelled Edge', oneLine: 'Door and drawer edges are cut at an angle, with no extra hardware — the front looks slimmer and cleaner.', benefit: 'One bevel is the handle.' } },
  xiepin: { status: 'pending', zh: { oneLine: '两块板以 45° 相接，木纹与边线绕过转角：看不见板材的断面，像一整块实木。', benefit: '转角处，木纹没有断。' }, en: { name: 'Mitred Corner', oneLine: 'Two panels meet at 45°, grain and edge wrapping the corner — no raw board edge, as if made from one piece of solid wood.', benefit: 'At the corner, the grain does not break.' } },
  haitang: { status: 'pending', zh: { oneLine: '取自传统家具的海棠角：外转角不做尖直角，内收一个小方角，不磕手、不易崩边，多一道细细的影。', benefit: '转角收一笔，是东方家具的温柔。' }, en: { name: 'Haitang Corner', oneLine: 'From the haitang corner of classical furniture: the outer corner steps in with a small notch — kinder to the hand, slow to chip, one more fine shadow.', benefit: 'One small step at the corner — the gentleness of Eastern furniture.' } },
  jiaxin: { status: 'pending', zh: { oneLine: '层板与边框以 A·B·A 三层叠成，侧面露出一道对比色细线：层板显得更薄、更轻。', benefit: '走近了，才看见那一道线。' }, en: { name: 'ABA Sandwich Edge', oneLine: 'Shelves and frames built in three layers, A–B–A, show a fine contrasting line on the edge — the shelf reads thinner and lighter.', benefit: 'Come closer, and the line appears.' } },
  gugexian: { status: 'official', zh: { oneLine: '灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。', benefit: '细线框让每扇柜门都有一道影子，有细节但不繁复。' }, en: { name: 'Skeleton Line', oneLine: 'Inspired by classical solid-wood furniture: the frame is both the ornament and the handle.', benefit: 'A fine frame line gives each door its own shadow — detail without ornament.' } },
  yuanhu: { status: 'pending', zh: { oneLine: '柜体、墙板、台面做成弧形：动线更顺，转角不再是硬角，小孩与长辈走过也安心。', benefit: '没有棱角的家，走起来更柔软。' }, en: { name: 'Curves', oneLine: 'Cabinets, panels and worktops follow a curve — movement flows, corners soften, and children and elders pass by at ease.', benefit: 'A home without hard corners walks more softly.' } },
  gezha: { status: 'pending', zh: { oneLine: '一排间隔的木条做隔断或柜面：分出区域，仍然通透、透气，木条之间有光有影。', benefit: '隔开，却不隔光。' }, en: { name: 'Timber Slats', oneLine: 'A row of spaced timber slats as a screen or a front — the space is defined, yet stays open to light and air, with shadow between the slats.', benefit: 'Divided, yet never closed to light.' } },
  gangqin: { status: 'pending', zh: { oneLine: '竖条长短、进出不一，像一排琴键：比格栅多一层节奏与立体感。', benefit: '一排琴键，等光来弹奏。' }, en: { name: 'Piano-key Slats', oneLine: 'Vertical slats of varied length and depth, like piano keys — more rhythm and depth than plain slats.', benefit: 'A row of keys, waiting for the light to play.' } },
  xixing: { status: 'pending', zh: { oneLine: '在板面铣出造型，如半圆拉手或图案：柜子有了自己的表情。', benefit: '拉手与造型，本是一体。' }, en: { name: 'Routed Motif', oneLine: 'A shape routed into the panel — a half-moon pull, a pattern — and the cabinet gains a character of its own.', benefit: 'Handle and form, one and the same.' } },
  yinxingmen: { status: 'pending', zh: { oneLine: '门与墙板、柜门齐平，不留门套，只剩一圈细缝：整面墙干净、完整。', benefit: '门在，墙仍然安静。' }, en: { name: 'Hidden Door', oneLine: 'Flush with the wall panels or cabinet doors, no frame, only a fine outline — the wall remains whole.', benefit: 'The door is there; the wall stays quiet.' } },
  touqi: { status: 'pending', zh: { oneLine: '板上铣出一排细长的透气缝：潮湿的天气里，鞋柜、设备柜也不闷、不生味。', benefit: '让柜子，也能呼吸。' }, en: { name: 'Ventilation Slots', oneLine: 'A row of fine slots routed into the panel — even in humid weather, shoe and equipment cabinets stay fresh.', benefit: 'Let the cabinet breathe, too.' } },
  faguang: { status: 'pending', zh: { oneLine: '柜内整块背板发光，像一个灯箱：酒与收藏，成为空间的主角。', benefit: '让珍藏，在柔光里被看见。' }, en: { name: 'Lit Back Panel', oneLine: 'The whole back panel glows like a light box — wine and collections become the heart of the room.', benefit: 'Let what you treasure be seen in soft light.' } },
  yingpeng: { status: 'pending', zh: { oneLine: '不加收边条，石、木、金属直接对接：线条极简、干净，靠的是看不见的精度。', benefit: '两种材质，直接相遇。' }, en: { name: 'Direct Junction', oneLine: 'No trim strip — stone, timber and metal meet directly; the clean line rests on a precision you never see.', benefit: 'Two materials, meeting face to face.' } },
  xuantiao: { status: 'pending', zh: { oneLine: '一端固定、一端悬空的结构：家具像浮在空间里，轻盈，不压人。', benefit: '一端扎根，一端向空中伸出。' }, en: { name: 'Cantilever', oneLine: 'Fixed at one end, free at the other — the piece seems to float, light and never heavy.', benefit: 'Rooted at one end, reaching into the air at the other.' } },
  dieji: { status: 'pending', zh: { oneLine: '体块逐层向前、向上叠起：立面有了层次，不呆板。', benefit: '一层一层，像山势起伏。' }, en: { name: 'Stepped Layers', oneLine: 'Volumes stack forward and upward — the wall gains depth, never flat.', benefit: 'Layer upon layer, like the rise of hills.' } },
  cuowei: { status: 'pending', zh: { oneLine: '体块上下、前后错开：打破方正，空间多了一点自然的动势。', benefit: '不必对齐，才有动感。' }, en: { name: 'Offset', oneLine: 'Volumes shift up, down, forward and back — the box is broken, and the room gains a natural movement.', benefit: 'Out of line, and so alive.' } },
  lifeng: { status: 'pending', zh: { oneLine: '体块之间以一道缝分开：每一块独立、轻盈。', benefit: '留一道缝，让墙透一口气。' }, en: { name: 'Separated Volumes', oneLine: 'Volumes set apart by a gap — each one stands alone, and lighter.', benefit: 'Leave a gap, and let the wall breathe.' } },
  jiadiao: { status: 'pending', zh: { oneLine: '高体块之间夹着吊柜或层板：中间通透，放上喜欢的东西。', benefit: '两座高柜之间，留一处空。' }, en: { name: 'Suspended Between', oneLine: 'A hanging cabinet or shelf held between tall volumes — the middle stays airy, for the things you love.', benefit: 'Between two tall cabinets, a space left open.' } },
  jintui: { status: 'pending', zh: { oneLine: '同一立面上，体块有凸有凹：深浅之间，立面更立体。', benefit: '有进有退，光影自来。' }, en: { name: 'Advance & Recess', oneLine: 'Volumes advance and recede on one wall — depth gathers between them.', benefit: 'Step forward, step back — light and shadow follow.' } },
  weihe: { status: 'pending', zh: { oneLine: '体块围成一个框、一个龛：展示或常用的那一格，成为焦点。', benefit: '围出一处，让目光停留。' }, en: { name: 'Framed Niche', oneLine: 'Volumes form a frame or a niche — the display, or the everyday spot, becomes the focus.', benefit: 'Frame a place, and the eye will rest there.' } },
  yaohe: { status: 'pending', zh: { oneLine: '体块互相咬合，像齿轮相扣：整体感强，有一点安静的张力。', benefit: '彼此嵌入，静中有力。' }, en: { name: 'Interlocking', oneLine: 'Volumes interlock like gears — strongly unified, with a quiet tension.', benefit: 'Fitted into each other — stillness with strength.' } },
  chuancha: { status: 'pending', zh: { oneLine: '横板穿过竖向体块：线条贯穿，空间连成一体。', benefit: '一条线，穿过整个空间。' }, en: { name: 'Intersecting', oneLine: 'A horizontal shelf passes through vertical volumes — the line carries on, and the space becomes one.', benefit: 'One line runs through the whole room.' } },
  juzhen: { status: 'pending', zh: { oneLine: '同样尺寸的模块，整齐重复：让空间沉静下来。', benefit: '秩序，本身就是一种安静。' }, en: { name: 'Grid', oneLine: 'Modules of one size, repeated in an even grid — and the room settles.', benefit: 'Order, in itself, is a kind of quiet.' } },
  // 溪岸系列：大字 = 系列的题眼（title），小字 = 设计理念（note），都是品牌官方说法
  s_skeleton: { status: 'official', zh: { oneLine: '灵感取自古典实木家具的形态：骨骼结构既是装饰，也是把手。', benefit: '在时间的长河，寻找关于家具的记忆。' }, en: { name: 'Skeleton Line Series', oneLine: 'Inspired by classical solid-wood furniture: the frame is both the ornament and the handle.', benefit: 'In the long river of time, looking for the memory of furniture.' } },
  s_mountain: { status: 'official', zh: { oneLine: '以「退」为设计哲学，「空而不空」的陈列美学。', benefit: '入空山，感物近人。' }, en: { name: 'Empty Mountain Series', oneLine: '“Stepping back” as a design philosophy — display that is empty, yet never empty.', benefit: 'Enter the empty mountain, and feel close to things and people.' } },
  s_weaving: { status: 'official', zh: { oneLine: '在城市的喧嚣中迷失的感觉，在接近麻纤维的时候，会慢慢平复下来。', benefit: '自然柔韧，回归感性生活。' }, en: { name: 'Weaving Series', oneLine: 'What gets lost in the noise of the city slowly settles when you are close to linen.', benefit: 'Natural and supple — back to a life of the senses.' } },
  s_misty: { status: 'official', zh: { oneLine: '轻于色、安于形：取晨雾之「灰」、春山之「木」、早春山间将有未有之「绿」，消隐大型柜体的存在感，让空间平静温和。', benefit: '雾山春居。' }, en: { name: 'Misty Mountain Series', oneLine: 'Light in colour, at ease in form: the grey of morning mist, the wood of the spring hills and the green that is only just arriving — large cabinetry fades back and the room stays calm and gentle.', benefit: 'A spring house on the misty mountain.' } },
  s_wabi: { status: 'official', zh: { oneLine: '打磨出能滋养心灵、连接自然、经得起时间洗礼的设计。', benefit: '山，有它的时间。' }, en: { name: 'Wabi-Sabi Eastern Series', oneLine: 'Design that nourishes the mind, connects with nature, and stands the test of time.', benefit: 'Mountains have their own time.' } },
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
