// Material Board 常量 —— 移植自 UKIR STUDIO（只保留 material board 功能），换成 Blueprint 的配色与字体。
// 纯数据，Node 测试也能直接 import。

/** 画幅：默认竖版 3:4 —— 方案封面「左文右图」的图区正好是 810×1080（3:4）；满版封面用 16:9 */
export const RATIOS = [
  { id: 'p34', label: '竖版 3:4', hint: '左文右图封面', ratio: 3 / 4 },
  { id: '16:9', label: '横版 16:9', hint: '满版封面', ratio: 16 / 9 },
  { id: 'a4p', label: 'A4 竖', hint: '打印', ratio: 210 / 297 },
  { id: 'a4l', label: 'A4 横', hint: '打印', ratio: 297 / 210 },
  { id: '1:1', label: '方形', hint: '社媒', ratio: 1 },
];

export const DEFAULT_RATIO_ID = 'p34';

/** 画板底色（ink = 该底色上的默认文字色） */
export const BGS = [
  { id: 'paper', label: '奶油', color: '#F5F0E6', ink: '#241C12' },
  { id: 'white', label: '纯白', color: '#FFFFFF', ink: '#241C12' },
  { id: 'greige', label: '灰米', color: '#EDE9E2', ink: '#241C12' },
  { id: 'linen', label: '亚麻', color: '#E8E2D7', ink: '#241C12' },
  { id: 'green', label: '墨绿', color: '#2D4A3E', ink: '#F2ECE0' },
  { id: 'dark', label: '深咖', color: '#211A12', ink: '#F2ECE0' },
];

/** AI 实拍排版的背景台面（跟随画板底色） */
export const BG_TONE = {
  paper: 'a soft warm off-white textured plaster surface',
  white: 'a clean off-white seamless paper surface',
  greige: 'a soft greige lime-plaster surface',
  linen: 'a natural oatmeal linen fabric surface',
  green: 'a deep muted green textured plaster surface',
  dark: 'a deep espresso-brown textured plaster surface',
};

/** 画幅 → Gemini 出图比例 */
export const FLATLAY_ASPECT = { p34: '3:4', a4p: '3:4', a4l: '4:3', '16:9': '16:9', '1:1': '1:1' };

export const FRAME_NOTE = {
  p34: 'a portrait 3:4 frame',
  a4p: 'a portrait 3:4 frame',
  a4l: 'a landscape 4:3 frame',
  '16:9': 'a wide landscape 16:9 frame',
  '1:1': 'a square 1:1 frame',
};

/** 标题位置 → 实拍排版里要留白的区域 */
export const SPACE_NOTE = {
  bl: 'the lower-left area',
  br: 'the lower-right area',
  tl: 'the upper-left area',
  tr: 'the upper-right area',
  c: 'a calm band across the middle',
};

export const LIB_CATS = [
  { id: 'wood', label: '木饰面' },
  { id: 'stone', label: '石材瓷砖' },
  { id: 'fabric', label: '布艺皮革' },
  { id: 'metal', label: '金属五金' },
  { id: 'paint', label: '涂料墙面' },
  { id: 'other', label: '其他' },
];

/** 标题字体（与提案 PPT 同一套：思源宋体 / Cormorant / Outfit） */
export const TITLE_FONTS = [
  { id: 'elegant', label: '法式衬线', css: '"Cormorant Garamond","Noto Serif SC",Georgia,serif' },
  { id: 'serif', label: '思源宋体', css: '"Noto Serif SC","Source Han Serif CN","Source Han Serif SC",Georgia,serif' },
  { id: 'sans', label: '现代无衬线', css: 'Outfit,"Noto Sans SC",system-ui,sans-serif' },
];

export const TITLE_POSITIONS = [
  { id: 'tl', label: '左上' },
  { id: 'tr', label: '右上' },
  { id: 'c', label: '居中' },
  { id: 'bl', label: '左下' },
  { id: 'br', label: '右下' },
];

export const TITLE_COLOR_PRESETS = ['#241C12', '#F2ECE0', '#B8995A', '#8A6844', '#3D5A4A'];

export const GOLD = '#B8995A';

export const DEFAULT_SUBTITLE = 'THE DREAM HOUSE JOURNEY';

export const FIRST_BOARD_NAME = '方案封面画板';

export const DEFAULT_BOARD = {
  ratioId: DEFAULT_RATIO_ID,
  bgId: 'paper',
  title: '',
  subtitle: '',
  titleFont: 'elegant', // TITLE_FONTS id
  titleScale: 1, // 0.6 – 1.8
  titlePos: 'bl', // TITLE_POSITIONS id
  titleColor: '', // 空 = 跟随底色自动（浅底墨色 / 深底暖白）
  notes: '', // 排版偏好，喂给 AI 实拍排版
  story: '', // 客户故事 / 道具，喂给 AI 实拍排版
};

/** 实拍排版最多带几张素材（按图层顺序取前 N 张） */
export const MAX_FLATLAY_INPUTS = 10;
/** 每块画板保留的实拍排版历史张数 */
export const MAX_SHOTS = 8;
/** 导出长边（像素） */
export const EXPORT_LONG_EDGE = 2400;

// ---------------------------------------------------------------------------
// AI prompts
// ---------------------------------------------------------------------------

// 实拍排版：把画板上全部素材合成一张摄影级俯拍 flat-lay（参考定稿 Material Board：
// 石材 / 胡桃 / 长虹玻璃 / 橡木小样 + 香蕉叶、烤酸种面包片、橄榄枝、小陶碗，米白台面）。
// {SPACE} = 留给标题的空白区域。
export const FLATLAY_PROMPT =
  'Create ONE photorealistic, top-down (straight 90-degree overhead) editorial flat-lay PHOTOGRAPH of an ' +
  'interior-design material board, composed from ALL of the provided sample images — every reference image ' +
  'must appear exactly once as its own physical sample. Treat each sample as a REAL physical object: stone, ' +
  'terrazzo or sintered-stone slab with a honed edge; wood-veneer or laminate sample board; fluted or textured ' +
  'glass piece; tile; fabric or leather swatch; paint chip; metal hardware — cut to clean rectangles, squares or ' +
  'softly rounded shapes (hardware and objects keep their natural shape). ' +
  'REALISM: every piece has visible physical thickness (edges catch the light) and casts a soft, natural contact ' +
  'shadow; soft directional daylight from the upper left; full-frame camera, 50mm lens, true-to-life white balance, ' +
  'crisp focus across the whole board. ' +
  'FAITHFUL MATERIALS: keep each sample\'s exact colour, tone, grain direction, veining and pattern from its ' +
  'reference image — never recolour, restyle, beautify or swap a material. ' +
  'COMPOSITION: an elegant, calm, asymmetric editorial arrangement with varied sizes (larger slabs anchoring, ' +
  'smaller chips layered on top) and a few slight overlaps; do not crowd the frame. Keep generous empty negative ' +
  'space in {SPACE} (roughly one third of the width and one quarter of the height) showing only the bare backdrop — ' +
  'it is reserved for a title that will be added later. ' +
  'Muted, warm, quiet-luxury interior-magazine aesthetic. ' +
  'ABSOLUTELY NO text, letters, numbers, labels, logos or watermarks anywhere in the image. Output ONE image.';

// 抠图：主体不动，背景换纯白。
export const CUTOUT_PROMPT =
  'Professional product photography cleanup for an interior design material board. ' +
  'Isolate the main object / material sample in this image and place it on a seamless pure white (#FFFFFF) ' +
  'studio background with a very soft natural drop shadow. Keep the object itself completely unchanged — ' +
  'same shape, color, texture and perspective. Remove everything else. No text, no watermark. Output ONE image.';

// AI 生成无缝材质样片
export const SWATCH_PROMPT =
  'Generate ONE flat, seamless, top-down close-up material swatch texture photograph: {DESC}. ' +
  'The material must fill the ENTIRE frame edge to edge — no objects, no props, no perspective, ' +
  'no borders, no text. Even diffuse studio lighting, photographic texture fidelity ' +
  '(visible grain / weave / veining as appropriate), true-to-life color. ' +
  'It should look like a real physical material sample photographed straight-on.';
