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
// 「3D 户型图」：平面布置图 →（框选范围 → 读成清单 → 确认）→ 照片级俯视 3D 户型图 →（对照清单检查 → 文字修正）
// ---------------------------------------------------------------------------

/** 视角：正俯视（和图纸一一对应，位置最准）/ 微倾俯视（略带透视，看得到一点墙面和柜体立面） */
export const DOLLHOUSE_VIEWS = [
  { id: 'top', zh: '正俯视', hint: '垂直往下看，和图纸一一对应，位置最准。' },
  { id: 'tilt', zh: '微倾俯视', hint: '略带透视，能看到一点墙面和柜体立面，更有立体感。' },
];

/** 'top' / '正俯视' / 对象 → 视角定义（认不出 = 正俯视） */
export function resolveView(view) {
  if (view && typeof view === 'object') view = view.id || view.zh;
  const key = String(view || '').trim().toLowerCase();
  return DOLLHOUSE_VIEWS.find((v) => v.id === key || v.zh === String(view || '').trim()) || DOLLHOUSE_VIEWS[0];
}

/** 生成范围：room = 只做主房间（墙外的楼梯、储藏间不画）；all = 图上有的都画 */
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

/**
 * 读图清单（给看图模型，中文；回 JSON）
 * @param {{ kind?:'room'|'floor', scope?:'room'|'all', roomName?:string }} args
 */
export function planBriefPrompt({ kind = 'room', scope = 'room', roomName = '' } = {}) {
  const name = String(roomName || '').trim();
  const single = kind !== 'floor';
  const rowsSpec = single
    ? `这张图画的是一个房间${name ? `（${name}）` : ''}。rows 固定按这个顺序写 5 行，label 就用这几个词：
- 「上墙」「右墙」「下墙」「左墙」：这面墙上有什么（窗、门、暗门、柱子）以及贴着这面墙放了什么（柜子、书桌、吊柜）。上墙、下墙从左到右写，左墙、右墙从上到下写；说清每样东西占这面墙的哪一段（左段 / 中段 / 右段，或大约几分之几）、从墙面往房间里伸出多少（浅 / 约四分之一房间深）。这面墙什么都没有就写「空墙」。
- 「中央」：不贴墙、摆在房间中间的家具；没有就写「空，无家具」。
- 椅子写在它所属的桌子那一行：几张、在桌子的哪一侧。${
        scope === 'all'
          ? '\n- 图上露出的邻近空间（楼梯、储藏间、走廊、隔壁房间）每个再加一行：label 写它的名字，text 写它在主房间的哪一侧、里面画了什么。outside 留空数组。'
          : '\n- 主房间围墙以外的东西（楼梯、储藏间、墙外的柜子、隔壁房间）不要写进 rows，只把名字列在 outside 里 —— 它们不会被画出来。'
      }`
    : `这张图画的是整层 / 全屋。rows 每个房间或空间写一行：label 写图上印的房间名（没有印就写「左上房间」这样的位置名），text 先写它在图纸上的位置（左上 / 上中 / 右下…）和大概占多大，再写里面的家具贴着哪面墙、门窗开在哪面墙。走廊、楼梯、阳台、卫生间也各写一行。outside 留空数组。`;

  return `你在帮室内设计师把一张平面布置图读成文字清单。后面会按清单生成俯视的 3D 户型图，所以位置必须准确。图纸的上方就是「上」，不要旋转，不要镜像。

读图规则：
- 粗黑线、涂黑的是墙和柱子；墙上的细双线是窗；带弧线或斜线的是门，写清开在哪面墙的哪一段。
- 虚线框是吊柜、顶柜这类不落地的东西，写的时候加上「（吊柜，不落地）」。
- 图上印的英文名（TOP HUNG CABINET、GLASS DOOR CABINET、HIDDEN DOOR…）原样保留，不翻译、不改写。
- 只写图上看得见的；不要猜尺寸、材质、颜色、品牌。看不清的地方写「不确定」。
- 标题栏、logo、装饰图案、页码不属于图纸，忽略。

${rowsSpec}

另外给出：
- title：${single ? '主房间的名字（图上印的原样）' : '楼层名（图上印的原样，没有就写「全屋」）'}；
- shape：${single ? '房间的形状和宽深比例，例如「近正方形，宽:深约 1:0.95」「横向长方形，宽:深约 3:2，右下角缺一块」' : '整层的外轮廓和宽深比例，例如「横向长方形，宽:深约 4:3，左下角凸出一块」'}。

每行 text 用简洁的中文，不超过 80 个字。只返回严格的 JSON，不要任何解释、不要代码块：
{"title":"…","shape":"…","rows":[{"label":"上墙","text":"…"}],"outside":["…"]}`;
}

/**
 * 英文出图提示词（俯视 3D 户型图）
 * @param {{ view?:object|string, lines?:string[], scope?:'room'|'all', kind?:'room'|'floor', title?:string,
 *           outside?:string[], refCount?:number, notes?:string }} args
 *   lines：设计师确认过的图纸清单（中文，逐行）；没有清单就只按图纸描
 */
export function floorplanPromptText({ view, lines = [], scope = 'room', kind = 'room', title = '', outside = [], refCount = 0, notes = '' } = {}) {
  const v = resolveView(view);
  const name = String(title || '').trim();
  const single = kind !== 'floor';
  const roomOnly = single && resolveScope(scope) === 'room';

  const camera =
    v.id === 'tilt'
      ? `- Almost top-down view: the camera is overhead and tilted only about 15–20° toward the bottom edge of the plan, with mild perspective, so the inner faces of the walls and the fronts of the cabinets along the top and side walls are slightly visible. It must still read as a floor plan — NOT a 45° isometric or corner view.`
      : `- Straight top-down view: the camera is directly overhead looking vertically down, orthographic, with no tilt and no perspective distortion.`;

  const checklist = lines.length
    ? `\n\nCHECKLIST — the designer read the plan and confirmed the list below (上 / 下 / 左 / 右 = top / bottom / left / right of image 1; 吊柜 = wall-hung cabinet). Place every item where the list says. If your own reading of image 1 disagrees with the list, the list wins:\n${lines.map((l) => `- ${l}`).join('\n')}`
    : '';

  const outsideLine = outside.length ? ` (on this plan: ${outside.join(', ')})` : '';
  const scopeText = roomOnly
    ? `SCOPE — render ONLY ${name || 'the main room'}: the one room enclosed by its own walls. Anything drawn outside those walls${outsideLine} must NOT appear — no stairs, no store rooms, no corridor, no neighbouring rooms, no cabinets outside the walls. Beyond the outer face of the room's walls there is only the plain background.`
    : single
      ? `SCOPE — render everything image 1 shows: ${name || 'the main room'} and the partly drawn neighbouring spaces, each at its drawn position. Cut the neighbouring spaces off cleanly at the edge of the drawing; do not invent the parts that are not drawn.`
      : `SCOPE — render the whole floor shown in image 1: every room and space at its drawn position. Do not add, remove, merge, mirror or move rooms.`;

  const design =
    refCount > 0
      ? `MATERIALS — ${imagesRange(2, refCount)} ${refCount > 1 ? 'are interior renders' : 'is an interior render'} of this project. Use ${refCount > 1 ? 'them' : 'it'} ONLY as a material and colour palette: floor finish, wood veneers, stone, metal and fabric colours and textures. Do NOT copy ${refCount > 1 ? 'their' : 'its'} camera angle, room shape, furniture arrangement or the position of any object — positions come only from image 1${lines.length ? ' and the checklist' : ''}.`
      : `MATERIALS — no reference renders were provided: use a warm, contemporary custom-cabinetry palette (light oak and walnut veneers, warm white walls, soft beige stone or timber floor), consistent across the plan.`;

  const extra = String(notes || '').trim();

  return `Turn the 2D floor layout plan in image 1 into ONE photorealistic 3D floor plan render seen from above — the furnished "3D floor plan" used in property brochures.

CAMERA
${camera}
- Same orientation as image 1: the top of the plan is the top of the picture. Do not rotate, mirror or flip the plan.
- The plan fills the frame with a small even margin on all sides.

LAYOUT — trace image 1
- Treat image 1 as a tracing template. Every wall, opening, column, cabinet and piece of furniture sits at the same position, with the same footprint and proportions, as drawn — laid over the plan, the render would line up with it.
- Draw only what the plan shows. Do not add rooms, partitions, walls, doors, stairs or furniture that are not drawn, and do not leave out anything that is drawn.
- Walls are cut low (about 1 m high) with clean flat tops that show their thickness, so nothing hides the interior. Windows are low glazed sections in the wall; doors are shown at their drawn position.
- Dashed outlines on the plan are wall-hung or overhead units (for example top hung cabinets). They are not floor-standing: leave them out so the desk or worktop drawn beneath them stays visible.
- Floor-standing cabinets are solid blocks exactly on their drawn footprint against the wall they are drawn on; desks and chairs keep their drawn position, count and orientation.
- Ignore everything in image 1 that is not the building itself: slide titles, logos, decorative panels, labels, dimension text and hatching.${checklist}

${scopeText}

${design}

RENDERING
- Photorealistic architectural visualisation: physically based materials, realistic wood grain, stone veining and fabric, soft global illumination, soft contact shadows, and a soft drop shadow of the whole model on the background.
- Background: clean seamless warm light-beige, nothing else on it.
- No text, no labels, no room names, no dimensions, no arrows, no icons, no people, no watermark, no logo, no title, no border.${extra ? `\n\nDESIGNER NOTES (follow them unless they contradict the plan): ${extra}` : ''}`;
}

/**
 * 出图后对照检查（给看图模型，中文；随附 [平面图, 效果图]；回 JSON）
 * @param {{ lines?:string[], scope?:'room'|'all', kind?:'room'|'floor', title?:string }} args
 */
export function checkPrompt({ lines = [], scope = 'room', kind = 'room', title = '' } = {}) {
  const roomOnly = kind !== 'floor' && resolveScope(scope) === 'room';
  const name = String(title || '').trim() || '主房间';
  return `图 1 是平面布置图，图 2 是按它生成的俯视 3D 户型图。请对照图纸${lines.length ? '和下面的清单' : ''}检查图 2，只找「位置和数量」上的明显错误：
- 多出或缺少的墙、隔间、房间、门、窗、柜子、桌子、椅子；
- 东西放错了墙，或者不贴墙的画成了贴墙、贴墙的画到了房间中间；
- 整体被旋转或镜像（图纸的上方应该是图 2 的上方）；
- ${roomOnly ? `画出了「${name}」围墙以外的空间（楼梯、储藏间、隔壁房间等都不该出现）` : '图纸上有的房间或邻近空间没有画出来，或位置不对'}；
- 图上出现了文字、标注、logo。
不要评价材质、颜色、光线和风格，不要挑细微的比例差别，虚线框的吊柜没有画出来不算错。
${lines.length ? `\n清单（设计师确认过，上 / 下 / 左 / 右指图纸的方向）：\n${lines.map((l) => `- ${l}`).join('\n')}\n` : ''}
只返回严格的 JSON，不要任何解释、不要代码块。没有明显错误：{"ok":true,"issues":[]}；有错误：ok 为 false，issues 最多 5 条，每条一句中文，写清「哪里、错在哪、应该怎样」，例如：
{"ok":false,"issues":["左墙的书桌画成了房间中央的独立书桌，应贴着左墙中段"]}`;
}

/**
 * 文字修正（英文，给出图模型；随附 [效果图, 平面图]）—— 只改列出的问题，其余保持不变
 * @param {{ fixes:string[], hasPlan?:boolean }} args
 */
export function refinePrompt({ fixes = [], hasPlan = true } = {}) {
  const list = fixes.map((f) => String(f || '').trim()).filter(Boolean);
  return `Edit image 1, a 3D floor plan render seen from above.${hasPlan ? ' Image 2 is the 2D floor layout plan it was made from — use it only to see where things belong (上 / 下 / 左 / 右 in the corrections = top / bottom / left / right of the plan and of the render).' : ''}

Apply ONLY these corrections:
${list.map((f) => `- ${f}`).join('\n')}

Keep everything else exactly as it is in image 1: the same camera and framing, the same walls and furniture that are not mentioned, the same materials, colours, lighting, shadows and background. Do not restyle or re-imagine the picture. No text, no labels, no watermark, no logo.`;
}
