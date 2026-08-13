// ---------------------------------------------------------------------------
// 溪岸 Render — 工作模式 / 空间 / 风格 / 灯光 库
// prompt 字段用英文书写（图像模型对英文提示更稳定），UI 全部中文。
// ---------------------------------------------------------------------------

export const MODES = [
  {
    id: 'restyle',
    label: '实景焕新',
    hint: '上传现状照片，整体换风格',
    needsImage: true,
    prompt:
      'Redesign the interior shown in the source photo into the target style. ' +
      'Treat the photo as an existing room that needs a full soft & hard finish makeover: ' +
      'replace furniture, finishes, lighting fixtures and decor to match the target style.',
  },
  {
    id: 'polish',
    label: '效果图精修',
    hint: '设计不动，只加强灯光氛围和细节',
    needsImage: true,
    skipRoom: true,
    skipStyle: true,
    skipFidelity: true,
    prompt:
      'The source image is a PRELIMINARY CGI DRAFT of an interior design: its lighting is flat, uniform and ' +
      'FALSE, its walls may be blank and overexposed, its window may be blown out to pure white. ' +
      'Your job is to re-shoot this exact room as a real professional photograph. ' +
      'ABSOLUTE DESIGN CONSTRAINT — change NOTHING about the design: keep the room layout, architecture, ' +
      'camera angle and framing, every piece of furniture and its exact position, the cabinetry and ' +
      'joinery design, all specified materials and the entire color scheme exactly as in the source. ' +
      'DISCARD the draft lighting completely and re-light the scene from scratch as realistic photography: ' +
      'cove and recessed lights glowing warmly with visible gradients on nearby surfaces, lamps switched on ' +
      'with soft halos, natural directional daylight entering from the actual window with believable falloff, ' +
      'a realistic bright exterior view or soft sheer-curtain glow in the window instead of blown-out white, ' +
      'accurate contact shadows and ambient occlusion under and around every object. ' +
      'Enrich micro-textures on existing surfaces: wood grain on cabinetry, fabric weave and folds, ' +
      'plaster and paint texture on walls, floor reflections. ' +
      'The result must look like a magazine photograph of the EXACT same room.',
  },
  {
    id: 'empty',
    label: '毛坯 / 空房出图',
    hint: '毛坯或空房照片，一键全屋布置',
    needsImage: true,
    prompt:
      'The source photo shows an empty or unfinished room (bare walls / no furniture). ' +
      'Design and render it as a fully finished, fully furnished interior in the target style: ' +
      'add flooring, wall finishes, ceiling design, lighting, full furniture layout and decor appropriate to the room type.',
  },
  {
    id: 'sketch',
    label: '草图 / 线稿渲染',
    hint: '手绘、SU 白模、CAD 立面转真实效果图',
    needsImage: true,
    prompt:
      'The source image is a design drawing (hand sketch, line drawing, SketchUp white model, or CAD elevation). ' +
      'Convert it into a photorealistic interior render, strictly following the geometry, layout, furniture placement ' +
      'and camera angle of the drawing. Apply realistic materials, lighting and textures in the target style.',
  },
  {
    // 隐藏模式：不在界面显示，但「以此继续改」迭代流程内部使用
    id: 'edit',
    label: '指令修改',
    hint: '“把电视墙换成岩板” 式局部修改',
    needsImage: true,
    needsInstruction: true,
    hidden: true,
    prompt:
      'Edit the source interior photo following the instruction below. ' +
      'Change ONLY what the instruction asks for; keep everything else in the image — geometry, camera angle, ' +
      'other furniture, lighting and overall look — exactly the same.',
  },
];

// ---------------------------------------------------------------------------
// 所有带图模式共用的三条铁律（对齐「效果图精修」的出图水准）
// ---------------------------------------------------------------------------

// 建筑结构锁：禁止拆墙、开洞、加窗 —— 修复「草稿图后面的墙壁被敲掉」问题
export const ARCHITECTURE_LOCK =
  'NON-NEGOTIABLE ARCHITECTURE LOCK: never demolish, remove, move or open any wall; ' +
  'never add windows, doors, skylights, openings, voids or extra rooms that do not exist in the source image; ' +
  'a solid wall in the source MUST remain a solid wall in the output; ' +
  'ceiling height, floor area, staircase geometry and room boundaries stay exactly as in the source.';

// 材质歧义规则：草稿里画成平灰/留白的面，默认按素色乳胶漆/腻子处理 ——
// 修复「wet kitchen 两边墙壁变成奇怪深色纹理」问题
export const AMBIGUOUS_MATERIAL_RULE =
  'MATERIAL AMBIGUITY RULE: any surface drawn as flat grey, flat white or otherwise unspecified in the draft ' +
  'is simply an unfinished surface — render it as smooth painted plaster in a neutral tone that matches the ' +
  'design palette. Do NOT invent dramatic materials (dark stone, marble slabs, heavy rough textures) for ' +
  'surfaces whose material is not clearly indicated. Where the draft does indicate a material ' +
  '(wood grain, tile joints, stone veining), follow it faithfully.';

// 灯光真实感（从「效果图精修」提炼，应用到所有出图模式）
export const LIGHTING_REALISM =
  'LIGHTING: light the scene as realistic photography with a layered scheme — natural directional daylight ' +
  'from the actual windows with soft believable falloff, warm glow from cove / recessed / lamp fixtures where ' +
  'present, accurate contact shadows and ambient occlusion where objects meet floors and walls, ' +
  'gentle light gradients across large surfaces, lifelike micro-textures on every material.';

export const ROOM_TYPES = [
  { id: 'living', label: '客厅', en: 'living room' },
  { id: 'dining', label: '餐厅', en: 'dining room' },
  { id: 'master', label: '主卧', en: 'master bedroom' },
  { id: 'kids', label: '儿童房', en: "children's bedroom" },
  { id: 'study', label: '书房', en: 'home office / study' },
  { id: 'kitchen', label: '厨房', en: 'kitchen' },
  { id: 'bath', label: '卫浴', en: 'bathroom' },
  { id: 'entry', label: '玄关', en: 'entryway / foyer' },
  { id: 'closet', label: '衣帽间', en: 'walk-in closet' },
  { id: 'balcony', label: '阳台', en: 'balcony' },
  { id: 'office', label: '办公空间', en: 'office space' },
  { id: 'retail', label: '商业空间', en: 'retail / commercial space' },
  { id: 'hotel', label: '民宿 / 酒店', en: 'hotel / B&B guest room' },
  { id: 'exterior', label: '建筑外观', en: 'building exterior / facade' },
];

// 每个风格的 prompt 都按「材质 + 色彩 + 造型语言 + 标志元素」四层写，
// 这是出图质量的核心 —— 比单写风格名稳定得多。
export const STYLES = [
  {
    id: 'modern',
    label: '现代简约',
    en: 'modern minimalist style',
    prompt:
      'clean straight lines, low-profile furniture, matte lacquer and wood veneer panels, ' +
      'neutral palette of white / greige / black accents, handleless cabinetry, ' +
      'recessed linear LED cove lighting, uncluttered surfaces',
  },
  {
    id: 'cream',
    label: '奶油风',
    en: 'cream style (warm minimal)',
    prompt:
      'warm cream, ivory and latte tones, smooth micro-cement or plaster walls, ' +
      'rounded and curved furniture silhouettes, boucle and soft-touch fabrics, ' +
      'light oak wood accents, arched details, soft diffused warm lighting, gentle cozy atmosphere',
  },
  {
    id: 'japandi',
    label: '原木日式 / Japandi',
    en: 'japandi style (japanese + scandinavian)',
    prompt:
      'light natural oak and ash wood throughout, warm white walls, low-profile furniture, ' +
      'linen and cotton fabrics, shoji-screen inspired details, rattan and paper lantern accents, ' +
      'minimal decor, plants, calm zen atmosphere with soft natural light',
  },
  {
    id: 'luxe',
    label: '现代轻奢',
    en: 'modern luxury style',
    prompt:
      'marble and sintered stone surfaces, brushed brass and champagne gold metal trims, ' +
      'velvet and leather upholstery, fluted wood and glass panels, statement designer chandelier, ' +
      'refined neutral palette with deep accent tones, hotel-suite elegance',
  },
  {
    id: 'newchinese',
    label: '新中式',
    en: 'new chinese style (modern oriental)',
    prompt:
      'dark walnut and rosewood tone furniture with clean modern lines, symmetric composition, ' +
      'ink landscape painting artwork, lattice screen partitions, ceramic vases and bronze accents, ' +
      'warm ambient lighting, quiet elegant oriental atmosphere',
  },
  {
    id: 'nordic',
    label: '北欧',
    en: 'scandinavian style',
    prompt:
      'white walls, light wood floors, functional simple furniture, wool and knit textiles, ' +
      'soft colorful accents, green plants, pendant lamps, bright airy hygge atmosphere',
  },
  {
    id: 'french',
    label: '法式',
    en: 'french elegant style',
    prompt:
      'wall panel mouldings and wainscoting, herringbone oak flooring, curved-leg furniture, ' +
      'cream and gold color scheme, brass details, elegant crystal chandelier, ' +
      'romantic refined parisian apartment atmosphere',
  },
  {
    id: 'wabisabi',
    label: '侘寂风',
    en: 'wabi-sabi style',
    prompt:
      'textured lime plaster walls in earth tones, raw and reclaimed wood, handmade ceramics, ' +
      'natural imperfect materials, sparse curated furniture, dried branches, ' +
      'dramatic soft directional light and shadow, serene meditative atmosphere',
  },
  {
    id: 'industrial',
    label: '工业风',
    en: 'industrial loft style',
    prompt:
      'exposed concrete and brick surfaces, black steel frames and pipes, ' +
      'dark leather sofa, reclaimed wood tables, Edison bulb fixtures and track lighting, ' +
      'dark moody palette with warm accents, urban loft character',
  },
  {
    id: 'american',
    label: '美式',
    en: 'american classic style',
    prompt:
      'warm wood tones, wainscoting and crown moulding, comfortable fabric sofas, ' +
      'layered cozy textiles, table lamps with fabric shades, classic patterned rug, ' +
      'family-warm traditional atmosphere',
  },
  {
    id: 'darkmin',
    label: '极简深色',
    en: 'dark minimalist style',
    prompt:
      'deep charcoal, black and smoked-oak palette, large-format stone slabs, ' +
      'dramatic accent lighting with hidden LED strips, minimal high-end furniture, ' +
      'moody sophisticated gallery-like atmosphere',
  },
  {
    id: 'custom',
    label: '自定义 / 跟随描述',
    en: '',
    prompt: '',
  },
];

export const LIGHTING_OPTIONS = [
  { id: 'auto', label: '跟随风格', prompt: '' },
  {
    id: 'day',
    label: '自然日光',
    prompt: 'bright natural daylight streaming through the windows, soft realistic shadows',
  },
  {
    id: 'golden',
    label: '黄昏暖阳',
    prompt: 'golden hour sunlight, warm glow through windows, long soft shadows',
  },
  {
    id: 'night',
    label: '夜景灯光',
    prompt: 'evening scene, all interior lighting turned on, warm layered artificial lighting, dark windows',
  },
  {
    id: 'bright',
    label: '明亮均匀（商业）',
    prompt: 'bright even commercial-grade illumination, clean and crisp, minimal shadows',
  },
];

export const FIDELITY_OPTIONS = [
  {
    id: 'strict',
    label: '严格保留结构',
    hint: '墙体门窗、相机角度完全不动',
    prompt:
      'STRICT CONSTRAINT: keep the room architecture — wall positions, windows, doors, ceiling height, ' +
      'built-in structures — and the exact camera angle and framing identical to the source image.',
  },
  {
    id: 'loose',
    label: '允许适度调整',
    hint: '可微调布局取景，效果优先',
    prompt:
      'Keep the general room layout and camera viewpoint close to the source image, ' +
      'but small adjustments to composition are allowed if they improve the design.',
  },
  {
    id: 'free',
    label: '自由发挥',
    hint: '只当灵感参考，追求最佳画面',
    prompt:
      'Use the source image as loose inspiration only; you may freely re-imagine the space for the best possible result.',
  },
];

// 精修模式的润饰范围：AI 可以动多少「画面内容」（设计永远锁死）
export const POLISH_SCOPES = [
  {
    id: 'strict',
    label: '严格只修光影',
    hint: '不加不减任何物件',
    prompt:
      'Do not add or remove ANY object. Only re-light the scene and refine the textures of what already exists.',
  },
  {
    id: 'decor',
    label: '加强装饰细节',
    hint: '已有装饰做精，可加小摆件',
    prompt:
      'You may refine and upgrade the existing decorative items and add a few very small styling touches ' +
      '(books, a small plant, a ceramic piece) where they naturally belong. ' +
      'Never alter or add furniture, cabinetry or architectural elements.',
  },
  {
    id: 'staging',
    label: '允许软装点缀',
    hint: '空白墙面/地面可加挂画地毯绿植',
    prompt:
      'You may add tasteful soft styling to bring the scene to life: artwork on empty walls, a rug, plants, ' +
      'cushions, books and decorative objects — all matching the existing style and color scheme. ' +
      'The built-in cabinetry, furniture pieces, architecture and materials must stay exactly as designed.',
  },
];

// 质感参考图：只学它的光感/氛围/质感，不学它的设计
export const REF_IMAGE_PROMPT =
  'TWO images are provided. The FIRST image is the room to render — its design is the ground truth. ' +
  'The SECOND image is a QUALITY AND MOOD REFERENCE ONLY: study its photographic realism, lighting ' +
  'atmosphere, shadow quality, color grading and material richness, and reproduce THAT LEVEL OF REALISM ' +
  'in your output. Do NOT copy the reference image\'s layout, furniture, materials or architecture.';

export const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9 横幅' },
  { id: '4:3', label: '4:3 标准' },
  { id: '1:1', label: '1:1 方图' },
  { id: '3:4', label: '3:4 竖图' },
  { id: '9:16', label: '9:16 手机屏' },
];

export const VARIATION_COUNTS = [1, 2, 3, 4];

// 统一的画质收尾要求，附加到所有 prompt 末尾。
// 用真实摄影语言（机身/镜头/光圈/影子行为/材质微纹理）压住 “CGI 假感”。
export const QUALITY_SUFFIX =
  'Render as an ultra-photorealistic interior PHOTOGRAPH, indistinguishable from a real photo ' +
  'shot by a professional architectural photographer: full-frame camera, 24mm lens at f/8, ISO 100, ' +
  'tripod at chest height, perfectly vertical lines. Physically accurate global illumination with ' +
  'soft shadow falloff, realistic contact shadows and ambient occlusion where objects ' +
  'meet floors and walls, accurate glass and metal reflections, high dynamic range with detail in ' +
  'both highlights and shadows. True-to-life material micro-textures: visible wood grain, fabric weave, ' +
  'stone veining, subtle imperfections on plaster and paint. Natural white balance, restrained saturation. ' +
  'Absolutely avoid: CGI plastic sheen, fake uniform lighting, over-smooth surfaces, oversaturated colors, ' +
  'blurry textures. No people, no text, no watermark, no split-screen or collage. Output ONE image.';

// “增强真实感” 二次渲染：构图内容全保留，只修真实感。
export const ENHANCE_PROMPT =
  'This interior image looks slightly artificial (CGI-like). Re-render it as an ultra-photorealistic ' +
  'photograph while keeping EVERYTHING identical: same composition, camera angle, room layout, furniture, ' +
  'materials, colors and lighting direction. Improve ONLY the realism: physically accurate light falloff, ' +
  'soft contact shadows and ambient occlusion where furniture meets the floor, realistic reflections, ' +
  'lifelike material micro-textures (wood grain, fabric weave, stone veining, subtle surface imperfections), ' +
  'natural white balance and dynamic range. Remove any plastic sheen, fake smoothness, banding or ' +
  'oversaturation. No people, no text, no watermark. Output ONE image.';

// Mood board AI 实拍排版：把所有素材合成一张摄影级俯拍 flat-lay。
export const FLATLAY_PROMPT =
  'Create ONE photorealistic top-down flat-lay PHOTOGRAPH of an interior design material board, ' +
  'composed from ALL of the provided sample images. Treat every sample as a real physical object — ' +
  'stone slab, wood plank, tile, fabric swatch, paint chip, hardware piece — cut to clean rectangles or ' +
  'kept in its natural shape, laid on the backdrop surface described below. Arrange them in an elegant, ' +
  'editorial, asymmetric composition with slight overlaps. CRITICAL FOR REALISM: every piece must have ' +
  'visible physical thickness and cast a soft natural shadow, as if photographed in a studio with soft ' +
  'directional daylight from the upper left; material colors and textures must stay faithful to the source ' +
  'images. Add one or two subtle stylist props if space allows (a dried olive branch, a small ceramic bowl ' +
  'or a stone sphere). Muted, warm, high-end interior magazine aesthetic. No text, no logos, no watermark. ' +
  'Output ONE image.';

// Mood board 抠图：主体不动，背景换纯白。
export const CUTOUT_PROMPT =
  'Professional product photography cleanup for an interior design material board. ' +
  'Isolate the main object / material sample in this image and place it on a seamless pure white (#FFFFFF) ' +
  'studio background with a very soft natural drop shadow. Keep the object itself completely unchanged — ' +
  'same shape, color, texture and perspective. Remove everything else. No text, no watermark. Output ONE image.';

// ---------------------------------------------------------------------------
// 设计顾问（AI 审图）—— interior-design-expert skill 的专业标准内嵌版
// ---------------------------------------------------------------------------

export const ADVISOR_MODEL = 'gemini-2.5-flash'; // 视觉+文字分析用普通旗舰 flash，快且便宜

export const ADVISOR_FOCUS = [
  { id: 'all', label: '整体审查', prompt: '对布局动线、柜体规划、灯光、配色材质做全面审查。' },
  { id: 'layout', label: '动线与布局', prompt: '重点审查空间规划：通行净宽、功能分区、家具尺度与摆位、门扇冲突。' },
  { id: 'cabinet', label: '柜体规划', prompt: '重点审查全屋定制柜体：尺寸规范、收纳容量、分区合理性、五金与使用动作。' },
  { id: 'lighting', label: '灯光方案', prompt: '重点审查照明：分层（环境/任务/重点）、照度是否足够、色温统一性、防眩。' },
  { id: 'color', label: '配色与材质', prompt: '重点审查色彩与材质搭配：60-30-10、底调统一、木纹数量与方向、耐用性。' },
];

export const ADVISOR_PROMPT =
  '你是世界级室内设计事务所的主案设计师，也是全屋定制柜体专家。审查用户提供的图（可能是平面图、' +
  '3D 效果图或现场照片），只基于图中可见内容判断；看不清的地方明说「图中无法判断」，禁止编造尺寸；' +
  '可以按比例估算，但必须注明是估算。\n\n' +
  '核对以下专业标准（净尺寸 mm）：\n' +
  '- 动线：主走道≥900（舒适1100+）；床两侧≥500（舒适600–750）；餐椅拉开+通行≥900；沙发前缘–茶几350–450；' +
  '沙发–电视2700–3300（55–65寸）；厨房单边走道≥1000、岛台≥1050；工作三角总长3600–6600且主动线不穿过；' +
  '衣柜前更衣≥600。\n' +
  '- 柜体：吊柜深300–350；底柜深560–600；台面高850–900（肘高−100）；吊柜底距台面600–750；烟机距灶面650–750；' +
  '衣柜深550–600，长挂≥1400、短挂≥900、叠放350–450；悬空电视柜离地250–300；一个空间木纹≤2种且纹理同向。\n' +
  '- 照明：必须分层（环境+任务+重点）；客厅100–200lx（阅读区300–500）、餐桌面200–300、厨房台面500、书桌500、' +
  '镜前垂直照度300–500；色温起居2700–3000K、任务区3500–4000K、全屋≤2档；CRI≥90；灯带见光不见灯；' +
  '单一主灯 = 「照明荒漠」要点名。\n' +
  '- 配色：60-30-10 法则；冷暖底调统一；小空间墙面 LRV≥60。\n\n' +
  '输出格式（中文，用词专业但客户能听懂）：\n' +
  '1. 【总结论】✅ 可行 / ⚠️ 需调整 / ❌ 有重大问题 + 一句话概括\n' +
  '2. 分节点评：【动线与布局】【柜体规划】【灯光】【配色材质】—— 每条问题按「问题 → 依据（数字）→ 修改建议」写\n' +
  '3. 【优先改的前三件事】按影响排序\n' +
  '做得好的地方也要点出 1–2 条（客户需要信心）。全文控制在 500 字以内，说重点。';

// ---------------------------------------------------------------------------
// Mood Board 材质库
// ---------------------------------------------------------------------------

export const LIB_CATS = [
  { id: 'wood', label: '木饰面' },
  { id: 'stone', label: '石材瓷砖' },
  { id: 'fabric', label: '布艺皮革' },
  { id: 'metal', label: '金属五金' },
  { id: 'paint', label: '涂料墙面' },
  { id: 'other', label: '其他' },
];

// AI 生成无缝材质样片
export const SWATCH_PROMPT =
  'Generate ONE flat, seamless, top-down close-up material swatch texture photograph: {DESC}. ' +
  'The material must fill the ENTIRE frame edge to edge — no objects, no props, no perspective, ' +
  'no borders, no text. Even diffuse studio lighting, photographic texture fidelity ' +
  '(visible grain / weave / veining as appropriate), true-to-life color. ' +
  'It should look like a real physical material sample photographed straight-on.';

export const SETTINGS_KEY = 'sailrender.settings.v1';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  // Nano Banana 2：支持 2K/4K 输出与 thinking，质量显著优于 2.5（预览版若不可用可在设置换回 gemini-2.5-flash-image）
  model: 'gemini-3.1-flash-image-preview',
  baseUrl: 'https://generativelanguage.googleapis.com',
  falKey: '', // 「极致真实」二次精炼引擎（fal.ai），可选
  watermark: 'SAIL BY RICCIONE', // 下载/导出图右下角的品牌水印，留空 = 关闭
};

// 旧默认模型，用于静默升级已存的设置
export const LEGACY_DEFAULT_MODEL = 'gemini-2.5-flash-image';
