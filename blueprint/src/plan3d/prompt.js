// 让看图模型（Gemini）在户型图上「先框一遍」的两段提示词 + 种类的别名表（纯函数，无依赖，ES5 写法 —— 以后要原样搬到没有构建步骤的 VISI）。
// 坐标一律用 Gemini 自己的习惯：box_2d = [ymin, xmin, ymax, xmax]，0–1000 的整数，相对整张图。
// 第一次看图找房间、门窗、柱子（structure），第二次找柜子家具（items）；回复由 detect.js 整理。

var INTRO = 'You are reading a 2D floor plan (top view) drawn by an architect or interior designer. The image may also contain a title, dimension lines and text labels.';

var COORDS =
  'Coordinates: integers from 0 to 1000 (0-1000 scale), relative to the whole image, y first. Every box_2d is [ymin, xmin, ymax, xmax]; every point is [y, x].';

/** 第一次看图：房间（内墙面围出来的地面）、门窗、柱子、墙厚、一条读得清的尺寸线 */
function structurePrompt() {
  return [
    INTRO,
    'Task: find the rooms, the openings in the walls and the structural columns.',
    '',
    'Return ONLY JSON (no prose, no code fence) of this form:',
    '{"rooms":[{"name":"","box_2d":[ymin,xmin,ymax,xmax],"niches":[[ymin,xmin,ymax,xmax]],"confidence":0.9}],',
    ' "openings":[{"type":"window|door|hidden-door|gap","box_2d":[ymin,xmin,ymax,xmax],"confidence":0.8}],',
    ' "columns":[{"box_2d":[ymin,xmin,ymax,xmax]}],',
    ' "wall_thickness":14,',
    ' "dimension":{"mm":3600,"p1":[y,x],"p2":[y,x]}}',
    '',
    COORDS,
    '',
    'Rules:',
    '- rooms: box_2d = the INNER faces of the walls (the floor area of the room), not the outer faces. A room that is not a plain rectangle = one main rectangle in box_2d plus extra rectangles in "niches" that touch or overlap the main rectangle (alcoves, bays, the short leg of an L shape). Include only rooms that are fully drawn; skip rooms that are cut off by the edge of the image. name = the room name printed in the drawing, copied verbatim, else "".',
    '- openings: a tight box around the gap in the wall: as long as the opening, as thick as the wall.',
    '  window = thin parallel lines inside the wall.',
    '  door = a gap in the wall with a swing arc or a door leaf. Do NOT include the swing arc or the leaf in the box, only the gap in the wall.',
    '  hidden-door = a door flush in a panelled wall, often labelled (for example HIDDEN DOOR).',
    '  gap = an opening with no door.',
    '- columns: solid or hatched structural blocks, in or next to the walls.',
    '- wall_thickness: the typical wall thickness, in the same 0-1000 units.',
    '- dimension: ONE dimension line whose printed number is clearly legible: its two end points p1 and p2, and the value converted to millimetres. Use null when there is none.',
    '- confidence: a number from 0 to 1, how sure you are.',
    '- Do not invent anything that is not drawn. When nothing is found for a field, return an empty array for it.',
  ].join('\n');
}

/** 第二次看图：柜子家具。rooms = [{ name, box_2d }]（已经是 0–1000 的坐标），写进提示词当上下文 */
function itemsPrompt(rooms) {
  var list = [];
  var src = Array.isArray(rooms) ? rooms : [];
  for (var i = 0; i < src.length && list.length < 20; i++) {
    var r = src[i];
    if (!r || !Array.isArray(r.box_2d) || r.box_2d.length < 4) continue;
    var box = [];
    for (var k = 0; k < 4; k++) if (typeof r.box_2d[k] === 'number' && isFinite(r.box_2d[k])) box.push(Math.round(r.box_2d[k]));
    if (box.length < 4) continue;
    var name = typeof r.name === 'string' ? r.name.slice(0, 40) : '';
    list.push((list.length + 1) + '. ' + JSON.stringify(name) + ' box_2d [' + box.join(', ') + ']');
  }
  var context = list.length
    ? ['The rooms are (inner faces of the walls):'].concat(list).concat(['Use them as context: the pieces to find are inside or right next to these rooms.'])
    : ['The rooms were not outlined; look at the whole drawing.'];
  return [
    INTRO,
    'Task: find every piece of furniture and built-in cabinetry that is drawn.',
    '',
  ]
    .concat(context)
    .concat([
      '',
      'Return ONLY JSON (no prose, no code fence) of this form:',
      '{"items":[{"kind":"tall|glass|low|desk|shelf|hung|chair|column|block","label":"","box_2d":[ymin,xmin,ymax,xmax],"dashed":false,"confidence":0.7}]}',
      '',
      COORDS,
      '',
      'kind is exactly one of:',
      '- tall = full-height cabinet, wardrobe or bookcase (floor to ceiling)',
      '- glass = glass-door display cabinet',
      '- low = low or base cabinet (about waist height), sideboard',
      '- desk = desk, table or worktop surface',
      '- shelf = low open shelf or bench',
      '- hung = wall-hung cabinet above something, usually drawn with DASHED lines',
      '- chair = chair or stool (one box per chair)',
      '- column = structural column',
      '- block = any other piece of furniture or fixed object',
      '',
      'Rules:',
      '- One tight box per separate piece, in the same top view.',
      '- An L-shaped run = two rectangles that meet.',
      '- label = the text printed on or next to the piece, copied verbatim (may be Chinese or English), else "".',
      '- dashed = true when the outline of the piece is drawn with dashed lines.',
      '- confidence: a number from 0 to 1, how sure you are.',
      '- Never box rooms, walls, doors, windows, door swings, text, dimension lines, title blocks, north arrows, floor patterns or rugs.',
      '- Do not invent furniture that is not drawn.',
      '- At most 80 items.',
    ])
    .join('\n');
}

/** 模型不按规定写种类时的别名（小写；下划线、连字符先换成空格）→ 九个种类之一 */
var KIND_ALIASES = {
  tall: 'tall',
  'tall cabinet': 'tall',
  'tall unit': 'tall',
  'high cabinet': 'tall',
  'full height cabinet': 'tall',
  'full height': 'tall',
  wardrobe: 'tall',
  closet: 'tall',
  cabinet: 'tall',
  cupboard: 'tall',
  bookcase: 'tall',
  bookshelf: 'tall',
  'book cabinet': 'tall',
  'storage cabinet': 'tall',
  storage: 'tall',
  pantry: 'tall',

  glass: 'glass',
  'glass cabinet': 'glass',
  'glass door cabinet': 'glass',
  display: 'glass',
  'display cabinet': 'glass',
  showcase: 'glass',
  vitrine: 'glass',

  low: 'low',
  'low cabinet': 'low',
  'base cabinet': 'low',
  'base unit': 'low',
  sideboard: 'low',
  credenza: 'low',
  console: 'low',
  'tv cabinet': 'low',
  'tv console': 'low',
  'tv unit': 'low',
  dresser: 'low',
  'chest of drawers': 'low',
  'shoe cabinet': 'low',
  nightstand: 'low',
  'bedside table': 'low',
  island: 'low',
  vanity: 'low',

  desk: 'desk',
  table: 'desk',
  worktop: 'desk',
  'work surface': 'desk',
  countertop: 'desk',
  counter: 'desk',
  'dining table': 'desk',
  'study table': 'desk',
  'dressing table': 'desk',

  shelf: 'shelf',
  shelves: 'shelf',
  'open shelf': 'shelf',
  'low shelf': 'shelf',
  bench: 'shelf',
  'window seat': 'shelf',

  hung: 'hung',
  'hung cabinet': 'hung',
  'top hung cabinet': 'hung',
  'wall hung cabinet': 'hung',
  'wall cabinet': 'hung',
  'wall unit': 'hung',
  'upper cabinet': 'hung',
  'overhead cabinet': 'hung',
  'hanging cabinet': 'hung',

  chair: 'chair',
  stool: 'chair',
  armchair: 'chair',
  seat: 'chair',

  column: 'column',
  pillar: 'column',
  post: 'column',

  block: 'block',
  sofa: 'block',
  couch: 'block',
  bed: 'block',
  'coffee table': 'block',
  piano: 'block',
  fridge: 'block',
  refrigerator: 'block',
  appliance: 'block',
  furniture: 'block',
  other: 'block',

  '高柜': 'tall',
  '衣柜': 'tall',
  '书柜': 'tall',
  '储物柜': 'tall',
  '柜子': 'tall',
  '柜': 'tall',
  '玻璃柜': 'glass',
  '展示柜': 'glass',
  '矮柜': 'low',
  '地柜': 'low',
  '边柜': 'low',
  '电视柜': 'low',
  '鞋柜': 'low',
  '书桌': 'desk',
  '餐桌': 'desk',
  '桌子': 'desk',
  '桌': 'desk',
  '台面': 'desk',
  '层架': 'shelf',
  '搁板': 'shelf',
  '长凳': 'shelf',
  '吊柜': 'hung',
  '椅子': 'chair',
  '椅': 'chair',
  '凳子': 'chair',
  '凳': 'chair',
  '柱子': 'column',
  '柱': 'column',
  '沙发': 'block',
  '床': 'block',
  '茶几': 'block',
  '其他': 'block',
};

export { structurePrompt, itemsPrompt, KIND_ALIASES };
