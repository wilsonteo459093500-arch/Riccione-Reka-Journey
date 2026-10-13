// 英文词典（离线自动翻译，不用 API key）：空间 / 视角 / 材料部位 / 备注标签 / 常见材料词 / 团队职位 / 固定短语。
// 只翻得了「词」和「词的组合」（'U 形衣橱 · 化妆台 · 视角三 · 夜晚' → 'U-Shaped Wardrobe · Vanity · View 3 · Night'）；
// 整句的备注、材料的诗意命名（浅川橡）翻不了 → 返回 null，交给 AI 翻译或设计师手填（存进 project.translations）。
// 英文用英式拼写（马来西亚习惯：colour、aluminium）。纯函数，Node 可测。

import { ROOM_DICT, titleCase } from '../import/labels.js';

const CJK_RE = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;
export const hasCJKText = (s) => CJK_RE.test(String(s ?? ''));

/** 空格 / 中点规范：'客厅·全景' → '客厅 · 全景' */
export const normSpace = (s) =>
  String(s ?? '')
    .replace(/[ 　]/g, ' ')
    .replace(/\s*[·•・]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------------------------------------
// 词典
// ---------------------------------------------------------------------------

/** 空间名（来自导入用的空间词典，大写 → 首字母大写） */
const ROOM_TERMS = Object.fromEntries(Object.entries(ROOM_DICT).map(([zh, en]) => [zh, titleCase(en)]));
Object.assign(ROOM_TERMS, {
  '收纳柜体': 'Storage Cabinet',
  '收纳': 'Storage',
  '全屋': 'Whole House',
  '公共区域': 'Common Area',
  '过道': 'Corridor',
  '主卫': 'Master Bathroom',
  '次卫': 'Common Bathroom',
  '公卫': 'Common Bathroom',
  '露台': 'Terrace',
  '前院': 'Front Yard',
  '后院': 'Backyard',
  '泳池': 'Pool',
});

/** 视角 / 细节名（效果图标题「客厅 · 电视柜」后半段） */
const VIEW_TERMS = {
  '全景': 'Overview',
  '全貌': 'Overview',
  '整体': 'Overall View',
  '整体效果': 'Overall View',
  '入口': 'Entrance',
  '入口视觉': 'Entrance View',
  '入户视角': 'Entrance View',
  '室内': 'Interior',
  '外观': 'Exterior',
  '沙发视角': 'Sofa View',
  '床视角': 'Bed View',
  '俯视': 'Top View',
  '俯瞰': 'Top View',
  '鸟瞰': "Bird's-Eye View",
  '近景': 'Close-Up',
  '特写': 'Close-Up',
  '局部': 'Detail',
  '细节': 'Detail',
  '另一视角': 'Another View',
  '反向视角': 'Reverse View',
  '正面': 'Front View',
  '侧面': 'Side View',
  '白天': 'Day',
  '日景': 'Day',
  '日间': 'Day',
  '夜晚': 'Night',
  '夜景': 'Night',
  '夜间': 'Night',
  '晚上': 'Night',
  '傍晚': 'Dusk',
  '黄昏': 'Dusk',
  '开门': 'Doors Open',
  '关门': 'Doors Closed',
  '打开': 'Open',
  '关闭': 'Closed',
  '电视柜': 'TV Cabinet',
  '电视墙': 'TV Wall',
  '背景墙': 'Feature Wall',
  '隐形门': 'Hidden Door',
  '卫生间隐形门': 'Hidden Bathroom Door',
  '衣柜': 'Wardrobe',
  '衣橱': 'Wardrobe',
  '衣柜近景': 'Wardrobe Close-Up',
  '化妆台': 'Vanity',
  '梳妆台': 'Vanity',
  '床头': 'Headboard',
  '床头柜': 'Bedside Table',
  '床边': 'Bedside',
  '床尾': 'Foot of the Bed',
  '吧台': 'Bar Counter',
  '酒柜': 'Wine Cabinet',
  '餐边柜': 'Sideboard',
  '岛台': 'Kitchen Island',
  '灶台': 'Cooking Counter',
  '餐区': 'Dining Area',
  '餐桌': 'Dining Table',
  '书桌': 'Study Desk',
  '书柜': 'Bookcase',
  '书架': 'Bookshelf',
  '展示柜': 'Display Cabinet',
  '展示柜体': 'Display Cabinet',
  '展示架': 'Display Shelf',
  '收纳展示柜': 'Storage & Display Cabinet',
  '收纳柜': 'Storage Cabinet',
  '收纳柜体': 'Storage Cabinet',
  '储物柜': 'Storage Cabinet',
  '鞋柜': 'Shoe Cabinet',
  '玄关柜': 'Foyer Cabinet',
  '榻榻米': 'Tatami',
  '推拉门': 'Sliding Door',
  '玻璃门': 'Glass Door',
  '玻璃柜': 'Glass Cabinet',
  '推拉玻璃柜': 'Sliding Glass Cabinet',
  '抽屉柜': 'Chest of Drawers',
  '抽屉': 'Drawers',
  '橱柜': 'Kitchen Cabinets',
  '吊柜': 'Wall Cabinets',
  '地柜': 'Base Cabinets',
  '高柜': 'Tall Cabinet',
  '顶柜': 'Overhead Cabinet',
  '洗衣柜': 'Laundry Cabinet',
  '洗衣机柜': 'Laundry Cabinet',
  '浴室柜': 'Vanity Cabinet',
  '镜柜': 'Mirror Cabinet',
  '楼梯柜': 'Staircase Cabinet',
  '楼梯储物柜': 'Staircase Cabinet',
  '佛台': 'Altar',
  '神台': 'Altar',
  '窗台': 'Window Seat',
  '飘窗': 'Bay Window',
  '卡座': 'Banquette',
  '门': 'Door',
  '入墙柜': 'Built-In Cabinet',
  '冰箱柜': 'Fridge Cabinet',
  '电器柜': 'Appliance Cabinet',
  '开放柜': 'Open Shelving',
  '开放格': 'Open Niche',
  '墙板': 'Wall Panelling',
  '护墙板': 'Wainscoting',
  '格栅': 'Slat Screen',
  '隔断': 'Partition',
  '灯光': 'Lighting',
  '效果': 'View',
};

/** 材料部位（材料行的小标签「柜体 & 柜门」） */
const ROLE_TERMS = {
  '柜体': 'Carcass',
  '柜门': 'Doors',
  '柜身': 'Cabinet Body',
  '柜框': 'Cabinet Frame',
  '见光板': 'Exposed Side Panel',
  '墙板': 'Wall Panel',
  '护墙板': 'Wainscoting',
  '岩板': 'Sintered Stone',
  '台面': 'Countertop',
  '台面板': 'Countertop',
  '开放柜': 'Open Shelving',
  '开放格': 'Open Niche',
  '床头板': 'Headboard',
  '床头': 'Headboard',
  '玻璃门': 'Glass Doors',
  '背板': 'Back Panel',
  '地板': 'Flooring',
  '拉手': 'Handles',
  '把手': 'Handles',
  '五金': 'Hardware',
  '抽屉': 'Drawers',
  '层板': 'Shelves',
  '饰面': 'Finish',
  '门板': 'Door Panels',
  '吊柜': 'Wall Cabinets',
  '地柜': 'Base Cabinets',
  '推拉门': 'Sliding Doors',
  '衣柜': 'Wardrobe',
  '衣橱': 'Wardrobe',
  '踢脚线': 'Skirting',
  '顶线': 'Cornice',
  '收口': 'Edge Trim',
  '灯带': 'LED Strip',
  '墙面': 'Wall Finish',
  '背景墙': 'Feature Wall',
  '门套': 'Door Frame',
  '窗套': 'Window Frame',
  '桌面': 'Desktop',
  '书桌': 'Desk',
  '柜脚': 'Cabinet Legs',
  '线条': 'Moulding',
  '装饰条': 'Trim Strip',
  '封板': 'Filler Panel',
  '侧板': 'Side Panel',
  '格栅': 'Slat Screen',
  '隔断': 'Partition',
  '床架': 'Bed Frame',
  '镜面': 'Mirror',
  '玻璃': 'Glass',
  '石材': 'Stone',
  '柜内': 'Cabinet Interior',
  '内胆': 'Cabinet Interior',
  '外框': 'Outer Frame',
  '铝框': 'Aluminium Frame',
  '门': 'Door',
  '柜': 'Cabinet',
  '搭配': 'Accent',
  '材料': 'Material',
  '主材': 'Main Finish',
  '辅材': 'Accent Finish',
  '饰面板': 'Finish Panel',
  '面板': 'Panel',
  '框': 'Frame',
};

/** 备注标签（「隐形门」「开门方式」「设计说明」） */
const LABEL_TERMS = {
  '设计说明': 'Design Notes',
  '说明': 'Notes',
  '备注': 'Note',
  '建议': 'Recommendation',
  '注意': 'Please Note',
  '提示': 'Tip',
  '设计亮点': 'Design Highlight',
  '亮点': 'Highlight',
  '开门方式': 'Door Opening',
  '板材': 'Board',
  '高度': 'Height',
  '深度': 'Depth',
  '宽度': 'Width',
  '尺寸': 'Dimensions',
  '闭门器': 'Door Closer',
  '反弹器': 'Push-to-Open',
  '灯光': 'Lighting',
  '照明': 'Lighting',
  '收纳': 'Storage',
  '收纳格': 'Storage Cubbies',
  '镜子': 'Mirror',
  '全身镜': 'Full-Length Mirror',
  '插座': 'Power Points',
  '开关': 'Switches',
  '空调': 'Air-Conditioning',
  '窗帘': 'Curtains',
  '材质': 'Material',
  '颜色': 'Colour',
  '配色': 'Colour Scheme',
  '工艺': 'Craftsmanship',
  '结构': 'Structure',
  '功能': 'Function',
  '风格': 'Style',
  '布局': 'Layout',
  '动线': 'Circulation',
};

/** 材料名里常见的词（'超白玻璃 · 20 隐框款'、'岩板 · Taj Mahal'）；诗意命名（浅川橡）不在此列 */
const MATERIAL_TERMS = {
  '超白玻璃': 'Ultra-Clear Glass',
  '长虹玻璃': 'Reeded Glass',
  '银波纹玻璃': 'Silver Ripple Glass',
  '波纹玻璃': 'Ripple Glass',
  '磨砂玻璃': 'Frosted Glass',
  '夹丝玻璃': 'Wired Glass',
  '夹绢玻璃': 'Fabric-Laminated Glass',
  '灰玻': 'Grey Glass',
  '茶玻': 'Bronze Glass',
  '玻璃': 'Glass',
  '银镜': 'Silver Mirror',
  '灰镜': 'Grey Mirror',
  '茶镜': 'Bronze Mirror',
  '镜面': 'Mirror',
  '岩板': 'Sintered Stone',
  '大理石': 'Marble',
  '石英石': 'Quartz',
  '人造石': 'Solid Surface',
  '洞石': 'Travertine',
  '水磨石': 'Terrazzo',
  '花岗岩': 'Granite',
  '石材': 'Stone',
  '实木': 'Solid Wood',
  '橡木': 'Oak',
  '白橡': 'White Oak',
  '胡桃木': 'Walnut',
  '黑胡桃': 'Black Walnut',
  '木饰面': 'Wood Veneer',
  '免漆板': 'Laminated Board',
  '多层板': 'Plywood',
  '烤漆': 'Lacquer',
  '肤感': 'Soft-Touch Matte',
  '皮革': 'Leather',
  '布艺': 'Fabric',
  '藤编': 'Rattan',
  '不锈钢': 'Stainless Steel',
  '拉丝不锈钢': 'Brushed Stainless Steel',
  '铝合金': 'Aluminium',
  '铝框': 'Aluminium Frame',
  '黑钛': 'Black Titanium',
  '古铜': 'Antique Bronze',
  '黄铜': 'Brass',
  '金属': 'Metal',
  '发光背板': 'Illuminated Back Panel',
  '灯带': 'LED Strip',
  '隐框款': 'Concealed Frame',
  '复合门': 'Composite Door',
  '内嵌拉手': 'Recessed Handle',
  '隐形拉手': 'Concealed Handle',
  '免拉手': 'Handleless',
  '白色': 'White',
  '黑色': 'Black',
  '灰色': 'Grey',
  '米色': 'Beige',
};

/** 团队职位 */
const TEAM_TERMS = {
  '方案设计师': 'Interior Designer',
  '主案设计师': 'Lead Designer',
  '设计师': 'Designer',
  '室内设计师': 'Interior Designer',
  '设计总监': 'Design Director',
  '深化设计师': 'Technical Designer',
  '项目经理': 'Project Manager',
  '项目主管': 'Project Supervisor',
  '销售': 'Sales Consultant',
  '销售顾问': 'Sales Consultant',
  '客户经理': 'Account Manager',
  '店长': 'Store Manager',
  '安装主管': 'Installation Supervisor',
  '安装师傅': 'Installer',
  '客服': 'Customer Service',
  '测量师': 'Site Measurer',
  '工程师': 'Engineer',
};

/** 整句固定短语（项目信息的默认文字） */
const PHRASES = {
  '全屋定制设计方案': 'Whole-House Design Proposal',
  '全屋设计方案': 'Whole-House Design Proposal',
  '设计方案': 'Design Proposal',
  '方案 · 设计图': 'Design Proposal',
  '未命名方案': 'Untitled Proposal',
};

/** 每类文字用哪些词典（按顺序查） */
const DICTS = {
  room: [ROOM_TERMS, VIEW_TERMS],
  view: [VIEW_TERMS, ROOM_TERMS, LABEL_TERMS, ROLE_TERMS],
  role: [ROLE_TERMS, MATERIAL_TERMS, VIEW_TERMS],
  label: [LABEL_TERMS, VIEW_TERMS, ROLE_TERMS, ROOM_TERMS],
  material: [MATERIAL_TERMS, ROLE_TERMS],
  team: [TEAM_TERMS],
  // 备注正文：只认得很短的词（'免拉手'），整句交给 AI
  note: [MATERIAL_TERMS, LABEL_TERMS, VIEW_TERMS, ROLE_TERMS],
  text: [PHRASES],
};

/** 测试 / 检查用：各类词典的全部中文键 */
export const GLOSSARY_KEYS = {
  room: Object.keys(ROOM_TERMS),
  view: Object.keys(VIEW_TERMS),
  role: Object.keys(ROLE_TERMS),
  label: Object.keys(LABEL_TERMS),
  material: Object.keys(MATERIAL_TERMS),
  team: Object.keys(TEAM_TERMS),
};

// ---------------------------------------------------------------------------
// 翻译
// ---------------------------------------------------------------------------

const ZH_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function lookup(word, kind) {
  const w = word.trim();
  if (!w) return '';
  for (const dict of DICTS[kind] || DICTS.view) if (dict[w]) return dict[w];
  return null;
}

/** 单个片段（不含 ' · '）→ 英文；翻不了返回 null */
function segment(seg, kind, depth = 0) {
  const s = seg.trim();
  if (!s) return '';
  if (!hasCJKText(s)) return s;
  const direct = lookup(s, kind);
  if (direct) return direct;
  if (depth > 3) return null;
  let m;
  // 视角二 / 视角 3
  if ((m = /^视角\s*([一二三四五六七八九十]|\d{1,2})$/.exec(s))) return `View ${ZH_NUM[m[1]] || m[1]}`;
  // U 形衣橱 / L形柜
  if ((m = /^([A-Za-z])\s*(?:形|型|字形)\s*(.+)$/.exec(s))) {
    const rest = segment(m[2], kind, depth + 1);
    return rest == null ? null : `${m[1].toUpperCase()}-Shaped ${rest}`;
  }
  // 原女儿房 → Former Daughter's Room
  if ((m = /^原\s*(.+)$/.exec(s))) {
    const rest = segment(m[1], kind, depth + 1);
    return rest == null ? null : `Former ${rest}`;
  }
  // 5 × 抽屉柜 / 2 个抽屉
  if ((m = /^(\d{1,3})\s*(?:[×xX]|个|只|组|扇|层)\s*(.+)$/.exec(s))) {
    const rest = segment(m[2], kind, depth + 1);
    return rest == null ? null : `${m[1]} × ${rest}`;
  }
  // 客房 1 / 卧室2
  if ((m = /^(.+?)\s*(\d{1,2})$/.exec(s))) {
    const rest = segment(m[1], kind, depth + 1);
    return rest == null ? null : `${rest} ${m[2]}`;
  }
  // 规格写在前 / 后：'20 隐框款'、'发光背板 3000K'
  if ((m = /^(\d{1,4}(?:\.\d+)?\s*(?:mm|cm|K)?)\s*([^\d\s].*)$/i.exec(s))) {
    const rest = segment(m[2], kind, depth + 1);
    return rest == null ? null : `${m[1].replace(/\s+/g, '')} ${rest}`;
  }
  if ((m = /^(.+?)\s+([A-Za-z0-9][A-Za-z0-9.\-]*)$/.exec(s)) && !hasCJKText(m[2])) {
    const rest = segment(m[1], kind, depth + 1);
    return rest == null ? null : `${rest} ${m[2]}`;
  }
  // 组合：A & B、A 与 B、A+B、A、B
  const parts = s.split(/\s*(?:&|＆|\+|、|与|和|及)\s*/).filter(Boolean);
  if (parts.length > 1) {
    const out = parts.map((p) => segment(p, kind, depth + 1));
    return out.some((x) => x == null) ? null : out.join(' & ');
  }
  // 前缀是空间名（'卫生间隐形门'、'主人房衣柜'）
  for (const [zh, en] of Object.entries(ROOM_TERMS).sort((a, b) => b[0].length - a[0].length)) {
    if (s.length > zh.length && s.startsWith(zh)) {
      const rest = segment(s.slice(zh.length), kind, depth + 1);
      if (rest != null) return `${en} ${rest}`;
    }
  }
  return null;
}

/**
 * 词典翻译：整串（可含 ' · ' 分段）→ 英文；任一段翻不了返回 null。
 * 不含中文的直接原样返回（'Taj Mahal'、'AG273'）。
 * @param {string} text
 * @param {'room'|'view'|'role'|'label'|'material'|'team'|'text'} kind
 */
export function glossaryEn(text, kind = 'view') {
  const s = normSpace(text);
  if (!s) return '';
  if (!hasCJKText(s)) return s;
  if (PHRASES[s]) return PHRASES[s];
  // 整句（带标点、或很长）的备注不硬翻：交给 AI / 设计师
  if (kind === 'note' && (/[，。,；;！？!?：:]/.test(s) || s.replace(/[^\u3400-\u9fff]/g, '').length > 8)) return null;
  const segs = s.split(' · ');
  // 备注标签的双语写法「隐形门 · Hidden door」：中文段和英文段一一对应 → 只取英文
  const latin = segs.filter((x) => !hasCJKText(x));
  const han = segs.filter((x) => hasCJKText(x));
  if (kind === 'label' && latin.length && latin.length === han.length) {
    if (segs.length === 2 || segs.every((x, i) => hasCJKText(x) === (i % 2 === 0))) return latin.join(' · ');
  }
  const out = [];
  for (const seg of segs) {
    const t = segment(seg, kind);
    if (t == null) return null;
    if (t) out.push(t);
  }
  return out.join(' · ');
}

/** 楼层英文名 → 标题写法：'GROUND FLOOR' → 'Ground Floor' */
export const floorTitleEn = (en) => titleCase(String(en ?? '').trim());

/**
 * 楼层清单 → 英文：'Ground Floor'、'Ground & First Floor'、'Ground, First & Second Floor'
 * @param {Array<{en:string}>} floors
 */
export function floorsLineEn(floors) {
  const names = (floors || []).map((f) => floorTitleEn(f.en)).filter(Boolean);
  if (!names.length) return 'Whole House';
  if (names.length === 1) return names[0];
  const allFloor = names.every((n) => / Floor$/.test(n));
  const bare = allFloor ? names.map((n) => n.replace(/ Floor$/, '')) : names;
  const joined = `${bare.slice(0, -1).join(', ')} & ${bare[bare.length - 1]}`;
  return allFloor ? `${joined} Floor` : joined;
}
