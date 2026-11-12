// AI 提示词 —— 标题润色 / 翻译（中文，给看图模型）与 3D 户型图（读图 / 检查用中文，出图 / 修正用英文）。纯字符串，无副作用，可在 Node 测。

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
// 「AI 翻译」：English / 中英版缺英文的中文（空间名、视角名、部位、备注、材料名、团队职位、标题）
// ---------------------------------------------------------------------------

/** 每类文字的写法（给模型对齐用） */
export const TRANSLATE_KINDS = {
  room: '空间名，Title Case，简短（Master Bedroom / Living Area / Staircase Cabinet）',
  view: '效果图的视角名，Title Case，2–4 个词（TV Cabinet / Overview / Wardrobe & Vanity / Night View）',
  role: '材料用在哪个部位，Title Case，简短，英式英语（Doors / Carcass & Doors / Worktop / Wall Panels）',
  label: '备注的小标签，Title Case，1–3 个词（Hidden Door / Door Opening / Lighting）',
  note: '备注说明，一句简洁的英文，句首大写、不加句号（Hydraulic closer with push-to-open）',
  material: '材料 / 饰面名，Title Case；编号、品牌、已有的英文原样保留（Light Oak Veneer AG273）',
  team: '职位名，Title Case（Interior Designer / Project Manager）',
  text: '标题或短句，自然、克制的英文；人名、地名用通行的英文写法（陈先生 → Mr Chen）',
};

/**
 * 翻译提示词（一批 ≤ 40 条）
 * @param {{ items:Array<{ id:string, zh:string, kind:string }>, context?:string }} args
 *   context：项目背景一句话（客户 / 地点），帮模型选词
 */
export function buildTranslatePrompt({ items = [], context = '' }) {
  const kinds = [...new Set(items.map((it) => it.kind))].filter((k) => TRANSLATE_KINDS[k]);
  return `你是高端全屋定制品牌「SAIL 溪岸 by Riccione Reka」的英文编辑。我们的设计提案 PPT 要出英文版和中英双语版，请把下面的中文译成自然、简洁、专业的英文（英式拼写：colour / centre / storey）。
${context ? `项目：${context}\n` : ''}
每条都标了类别，按类别的写法来：
${kinds.map((k) => `- ${k}：${TRANSLATE_KINDS[k]}`).join('\n')}

规则：
- 只翻译，不增删信息，不编造工艺、尺寸、品牌、颜色、数量；
- 原文里的英文、编号、品牌名、数字原样保留；
- 中文里写着「· 」分隔的几段，英文也用「 · 」分隔；
- 引号、撇号用直的 ' 和 "，不要弯引号；
- 每条都要有译文；实在不确定的专有名词用拼音。

待翻译（JSON）：
${JSON.stringify(items.map((it) => ({ id: it.id, kind: it.kind, zh: it.zh })))}

只返回严格的 JSON，不要任何解释、不要代码块：
{"items":[{"id":"${items[0]?.id || 't1'}","en":"…"}]}`;
}

// ---------------------------------------------------------------------------
// 「3D 户型图」：找图纸范围（AI 框图的提示词在 src/plan3d/prompt.js，和画图的程序放在一起，以后给 VISI 用同一份）
// ---------------------------------------------------------------------------

/** 旧版「AI 直接出图」的两种视角：只用来给生成记录里的旧图标名字 */
export const DOLLHOUSE_VIEWS = [
  { id: 'top', zh: '正俯视', hint: '垂直往下看，和图纸一一对应，位置最准。' },
  { id: 'tilt', zh: '微倾俯视', hint: '略带透视，能看到一点墙面和柜体立面，更有立体感。' },
];

/** 框选范围：room = 只框主房间（墙外的楼梯、储藏间不要）；all = 图上有的都框进来 */
export const PLAN_SCOPES = [
  { id: 'room', zh: '只做主房间', hint: '只画主房间四面墙以内，墙外的楼梯、储藏间、隔壁房间都不画。' },
  { id: 'all', zh: '连邻近空间', hint: '图纸上露出的邻近空间也一起画，位置照图纸。' },
];

export const resolveScope = (scope) => (scope === 'all' ? 'all' : 'room');

const imagesRange = (from, count) => (count <= 1 ? `image ${from}` : `images ${from}–${from + count - 1}`);

/**
 * 找图纸范围（给看图模型，英文；回 JSON）。上传的常常是整张 PPT / PDF 页：要把标题栏、logo、装饰栏排除在外。
 * 框的写法用 Gemini 惯用的 [ymin, xmin, ymax, xmax]，0–1000。
 */
export function planRegionPrompt() {
  return `You are reading an interior designer's floor layout plan. The image may be a whole presentation slide or PDF page: besides the drawing itself it can contain a slide title (e.g. "LAYOUT PLAN"), a logo, a decorative gradient panel, page numbers or empty margins.

Find two bounding boxes. Write each as [ymin, xmin, ymax, xmax], integers 0–1000 normalised to the image height and width (0,0 = top-left corner):
- "drawing": the tightest box around the architectural drawing itself — every wall and piece of furniture, plus the notes written on the drawing (e.g. "HIDDEN DOOR", "EXTG. MARBLE FEATURED WALL"). Exclude slide titles, logos, decorative panels and empty margins.
- "mainRoom": the tightest box around the OUTER face of the walls that enclose the main room the plan is about — the room that is drawn completely and furnished, usually labelled (e.g. "STUDY ROOM"). Include the doors and windows in those walls. Neighbouring spaces that are only partly drawn (stairs, stores, corridors, the next room) stay outside this box.

Also decide:
- "kind": "room" when the drawing is about ONE room and other spaces only appear as cut-off fragments; "floor" when it shows a whole floor or whole home with several complete rooms. For "floor", "mainRoom" is the same box as "drawing".
- "roomName": the label printed for the main room, exactly as printed ("" when nothing is printed; for "floor" use the printed floor name or "").

Return strict JSON only, no explanation and no code fence:
{"kind":"room","roomName":"STUDY ROOM","drawing":[0,0,1000,1000],"mainRoom":[0,0,1000,1000]}`;
}

// ---------------------------------------------------------------------------
// 「材质贴图」：AI 只出一小块材质样本，程序把它贴到按坐标画好的柜子、台面、地板上（AI 接触不到户型）
// ---------------------------------------------------------------------------

/** 四个贴图槽位的默认描述（英文，写进提示词）和「从参考图里取哪种材质」 */
export const SWATCH_SLOTS = {
  floor: {
    desc: 'the face of a light natural oak timber floor board (one continuous piece of wood, no plank joints)',
    from: 'the timber floor',
    wood: true,
  },
  cabinet: { desc: 'a walnut wood veneer cabinet door panel with fine straight grain, matte finish', from: 'the wood veneer of the cabinetry', wood: true },
  worktop: { desc: 'a polished white marble slab with soft grey veining', from: 'the stone of the worktops or stone wall panels', wood: false },
  fabric: { desc: 'a warm grey-taupe woven upholstery fabric', from: 'the upholstery of the chairs or sofa', wood: false },
};

/**
 * 材质样本的出图提示词（英文；随附 0–3 张效果图作参考）
 * @param {{ slot:'floor'|'cabinet'|'worktop'|'fabric', refCount?:number, hint?:string }} args
 */
export function swatchPromptText({ slot, refCount = 0, hint = '' } = {}) {
  const def = SWATCH_SLOTS[slot] || SWATCH_SLOTS.cabinet;
  const note = String(hint || '').trim();
  const refs =
    refCount > 0
      ? `\n\nREFERENCE — ${imagesRange(1, refCount)} ${refCount > 1 ? 'are interior renders' : 'is an interior render'} of a project. Match the colour, tone and ${def.wood ? 'grain' : 'pattern'} of ${def.from} shown there. Do NOT reproduce the room, the furniture, the lighting or any object from ${refCount > 1 ? 'them' : 'it'} — output only the bare material.`
      : '';
  return `Create ONE flat material texture swatch: ${def.desc}.

- Straight-on view of the bare surface, as if a piece of it was scanned on a flatbed scanner. The material fills the entire square frame, edge to edge.
- Perfectly even, diffuse lighting: no shadows, no highlights or reflections, no vignette, no gradient from one side to the other.
- Only the material: no objects, no furniture, no room, no edges, no borders, no joints or seams, no frame, no text, no logo, no watermark.
- The same scale and density across the whole image.${def.wood ? '\n- The wood grain runs horizontally, from the left edge to the right edge.' : ''}
- Tileable: the left edge continues naturally into the right edge, and the top edge into the bottom edge.${refs}${note ? `\n\nDESIGNER NOTE: ${note}` : ''}`;
}
