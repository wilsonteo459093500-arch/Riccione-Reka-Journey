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
    id: 'staging',
    label: '虚拟软装',
    hint: '保留硬装，只做家具软装搭配',
    needsImage: true,
    prompt:
      'Virtually stage the room in the source photo. Keep ALL existing hard finishes exactly as they are — ' +
      'floors, walls, ceiling, windows, doors, built-in cabinetry must stay unchanged. ' +
      'Only add or replace loose furniture, rugs, curtains, artwork, plants and decorative accessories in the target style.',
  },
  {
    id: 'edit',
    label: '指令修改',
    hint: '“把电视墙换成岩板” 式局部修改',
    needsImage: true,
    needsInstruction: true,
    prompt:
      'Edit the source interior photo following the instruction below. ' +
      'Change ONLY what the instruction asks for; keep everything else in the image — geometry, camera angle, ' +
      'other furniture, lighting and overall look — exactly the same.',
  },
  {
    id: 'text',
    label: '文字生成',
    hint: '无需图片，从描述生成概念图',
    needsImage: false,
    prompt:
      'Generate a photorealistic interior design concept render from the description below.',
  },
];

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

export const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9 横幅' },
  { id: '4:3', label: '4:3 标准' },
  { id: '1:1', label: '1:1 方图' },
  { id: '3:4', label: '3:4 竖图' },
  { id: '9:16', label: '9:16 手机屏' },
];

export const VARIATION_COUNTS = [1, 2, 3, 4];

// 统一的画质收尾要求，附加到所有 prompt 末尾。
export const QUALITY_SUFFIX =
  'Output ONE photorealistic interior visualization image: architectural photography quality, ' +
  'physically accurate global illumination and shadows, realistic material textures (wood grain, ' +
  'fabric weave, stone veining), correct perspective, magazine-cover composition. ' +
  'No people, no text, no watermark, no split-screen or collage.';

export const SETTINGS_KEY = 'sailrender.settings.v1';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'gemini-2.5-flash-image',
  baseUrl: 'https://generativelanguage.googleapis.com',
};
