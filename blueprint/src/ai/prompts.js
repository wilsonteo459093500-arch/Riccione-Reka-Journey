// AI 提示词 —— 标题润色（中文，给看图模型）与 3D 全屋立体图（英文，给出图模型）。纯字符串，无副作用，可在 Node 测。

// ---------------------------------------------------------------------------
// 「AI 润色」：效果图页的视角名 / 英文小标题 / 备注
// ---------------------------------------------------------------------------

/** 定稿里的写法示例（给模型对齐语气用） */
export const POLISH_EXAMPLES = {
  titles: [
    '鞋柜 · 入口', '客厅 · 电视柜', '客厅 · 全景', '客厅 · 沙发视角', '客厅 · 隐形门',
    '楼梯储物柜 · 隐形门', '卧室 · 衣柜与化妆台', '卧室 · 床头', '卧室 · 俯视',
    'KTV 娱乐室 · 吧台', 'KTV 娱乐室 · 酒柜', 'KTV 娱乐室 · 电视柜', '厨房 · 岛台与餐区',
    '主人房 · 衣橱 · 夜晚', '收纳柜体 · 卫生间隐形门',
  ],
  roomEn: ['LIVING AREA', 'STAIRCASE CABINET', 'BEDROOM', 'MASTER BEDROOM', 'KTV ROOM', 'MAHJONG ROOM', 'DINING', 'KITCHEN', 'STORAGE'],
  note: { label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' },
};

/** 常见视角名（提示模型用词范围，不是硬性词表） */
export const VIEW_NAME_HINTS = [
  '全景', '入口', '沙发视角', '电视柜', '隐形门', '衣柜近景', '衣柜与化妆台', '床头', '俯视',
  '吧台', '酒柜', '餐边柜', '岛台', '灶台', '书桌', '展示柜', '另一视角', '夜晚', '白天',
];

/**
 * 润色提示词（一组 = 同一楼层同一空间的连续效果图，≤ 6 张）
 * @param {{ floor?:string, room?:string, briefs:Array<object>, imageOrder:string[] }} args
 *   briefs：每页当前文字（id / room / roomEn / subtitle / notes / materials）
 *   imageOrder：随请求附上的图片依次对应哪个 id
 */
export function buildPolishPrompt({ floor = '', room = '', briefs = [], imageOrder = [] }) {
  const where = [floor, room].filter(Boolean).join(' · ') || '同一空间';
  const order = imageOrder.length
    ? `随附 ${imageOrder.length} 张效果图，按顺序依次对应：${imageOrder.join('、')}。`
    : '这一组没有可用的图片，只能根据文字判断。';
  const noImage = briefs.filter((b) => !imageOrder.includes(b.id)).map((b) => b.id);
  const noImageLine = imageOrder.length && noImage.length ? `（${noImage.join('、')} 没有图片，请只根据文字和同组其它图判断。）` : '';

  return `你是高端全屋定制品牌「SAIL 溪岸 by Riccione Reka」的提案文案编辑。我们把设计师的效果图整理成简约、高级的提案 PPT：每张效果图一页，页面大标题 =「空间 · 视角名」，标题上方是大写英文小标题，右侧或下方列出材料和少量备注。

定稿里的写法（请对齐这种语气）：
- 标题：${POLISH_EXAMPLES.titles.join(' / ')}
- 英文小标题：${POLISH_EXAMPLES.roomEn.join(' / ')}
- 备注：${JSON.stringify(POLISH_EXAMPLES.note)}

下面是「${where}」的 ${briefs.length} 页。${order}${noImageLine}
每页当前的文字：
${JSON.stringify(briefs)}

请逐张看图，为每页给出：
1. subtitle —— 这张图的视角名，2–6 个字，说清这张图主要看的是什么（可参考：${VIEW_NAME_HINTS.join(' / ')}）。
   - 同一空间里每页的视角名都要不同；
   - 原标题里有「白天 / 夜晚」这类时间限定必须保留，写成「衣橱 · 夜晚」；
   - 不要重复空间名本身（空间是「卧室」，就写「床头」而不是「卧室床头」）；
   - 原标题已经准确、简洁（不是「视角二」这类编号）就保留原样。
2. roomEn —— 空间的英文名，全大写，简短（如 LIVING AREA、MASTER BEDROOM）；同一空间各页保持一致；原来已有且正确就沿用。
3. notes —— 把原有备注改写成 {"label":"中文 · English","text":"精炼的中文说明"}：
   - label 是简短的中文名词 + 对应英文，如「隐形门 · Hidden door」「开门方式 · Door opening」；
   - text 是一句精炼的中文，不超过 20 个字；
   - 只能改写原有备注里已有的信息，不得新增、猜测或编造任何工艺、尺寸、品牌、颜色、数量；
   - 原来没有备注就返回空数组 []；原文看不懂就原样保留。
材料（materials）只是给你参考，不要改动、不要写进备注。

只返回严格的 JSON，不要任何解释、不要代码块：
{"slides":[{"id":"${briefs[0]?.id || 'v1'}","subtitle":"…","roomEn":"…","notes":[{"label":"…","text":"…"}]}]}`;
}

// ---------------------------------------------------------------------------
// 「3D 全屋立体图」：平面布置图 + 效果图 → 照片级等轴测剖切鸟瞰（像 The Sims 的建造视图）
// ---------------------------------------------------------------------------

/** 镜头方位：界面显示中文，提示词用英文 */
export const DOLLHOUSE_ANGLES = [
  { id: 'south-east', zh: '东南', en: 'south-east', corner: 'bottom-right', toward: 'north-west' },
  { id: 'south-west', zh: '西南', en: 'south-west', corner: 'bottom-left', toward: 'north-east' },
  { id: 'north-east', zh: '东北', en: 'north-east', corner: 'top-right', toward: 'south-west' },
  { id: 'north-west', zh: '西北', en: 'north-west', corner: 'top-left', toward: 'south-east' },
];

/** 'south-east' / '东南' / 'SE' / 对象 → 方位定义（认不出 = 东南） */
export function resolveAngle(angle) {
  if (angle && typeof angle === 'object') angle = angle.id || angle.en || angle.zh;
  const key = String(angle || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  const abbr = { se: 'south-east', sw: 'south-west', ne: 'north-east', nw: 'north-west', southeast: 'south-east', southwest: 'south-west', northeast: 'north-east', northwest: 'north-west' };
  const id = abbr[key] || key;
  return DOLLHOUSE_ANGLES.find((a) => a.id === id || a.zh === String(angle || '').trim()) || DOLLHOUSE_ANGLES[0];
}

const imagesRange = (from, count) => (count <= 1 ? `image ${from}` : `images ${from}–${from + count - 1}`);

/**
 * 英文出图提示词
 * @param {{ floorName:string, angle:object, style?:string, rooms?:string[], refCount?:number, wholeHome?:boolean }} args
 */
export function dollhousePromptText({ floorName, angle, style = '', rooms = [], refCount = 0, wholeHome = false }) {
  const scope = wholeHome ? 'the ENTIRE home shown in the plan' : `the ENTIRE ${floorName}`;
  const roomsLine = rooms.length ? `\nRooms on this floor (from the designer's proposal): ${rooms.join(', ')}.` : '';

  const design = refCount > 0
    ? `DESIGN — ${imagesRange(2, refCount)} ${refCount > 1 ? 'are' : 'is'} the designer's interior render${refCount > 1 ? 's' : ''} of this same home; use ${refCount > 1 ? 'them' : 'it'} as the design reference:
- Furnish and finish each room with the same built-in cabinetry design, door styles, colours, wood grains, stone, metal and fabric materials shown in the reference render${refCount > 1 ? 's' : ''}; match each room's look to its render as closely as possible.
- Rooms without a reference render follow the same palette and design language.
- The reference renders are only for design and materials — the layout always comes from image 1.`
    : `DESIGN — no reference renders were provided: furnish every room in a warm, contemporary Malaysian custom-cabinetry style (light oak and walnut veneers, warm white walls, soft beige stone floors), consistent across the floor.`;

  const notes = String(style || '').trim();

  return `Create ONE photorealistic 3D isometric CUTAWAY "dollhouse" render of ${scope} — like an architectural section model or the build view of The Sims, but ultra-realistic.

LAYOUT — image 1 is the 2D floor layout plan. Follow it EXACTLY:
- Same wall positions, room arrangement, door and window openings, columns, stairs and proportions as the plan. Do not add, remove, merge, mirror or move rooms.
- Every wall is cut horizontally at about 1.2 m height with clean cut tops that show the wall thickness, so the interior of every room is visible from above.
- Camera: elevated about 45° view from the ${angle.en} corner (the ${angle.corner} corner of the plan as drawn, assuming north is up), looking diagonally across the floor toward the ${angle.toward}. Orthographic-feeling isometric projection with no strong perspective distortion; the whole floor fits inside the frame with a small even margin.${roomsLine}

${design}

RENDERING:
- Ultra-realistic architectural visualisation: physically based materials, soft global illumination, gentle ambient occlusion, realistic textures (wood grain, stone veining, fabric weave), warm natural daylight, crisp detail.
- The cut floor slab sits on a thin white plinth, on a clean light warm-grey seamless background.
- No text, no labels, no room names, no dimensions, no annotations, no people, no watermark, no logo.${notes ? `\n\nDESIGNER NOTES (follow them unless they contradict the plan): ${notes}` : ''}`;
}
