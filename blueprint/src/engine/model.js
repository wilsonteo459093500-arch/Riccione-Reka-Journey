// 项目数据模型 —— 导入（PDF 解析）、编辑器、导出（PPT）、AI 功能共用的唯一契约。
// 全部是可 JSON 序列化的纯数据；图片只存引用（'asset:<id>'），二进制在 IndexedDB（store/db.js）。
//
// Project = {
//   id, name, createdAt, updatedAt, version: 1,
//   layoutVersion: 2,            // 版式版本：2 = B「格物」起的数据结构（C「安然」只换版式、沿用）；旧项目打开时由 lib/project.js upgradeProject 升级
//   info: {
//     client: 'Mr Lau', location: 'Muar', date: '2026 · 08',
//     proposalTitle: '全屋定制设计方案',
//     coverTitle: '',            // 方案封面（Material Board 页）大标题，空 = 自动（客户与地点两行）
//     coverSubtitle: '',         // 方案封面副标题，空 = 自动（楼层：一楼与二楼）
//     lang: 'zh'|'en'|'bi',      // 提案语言：华文 / English / 中英（engine/lang.js）
//     sourceFile: '2026.8.6 Muar - Mr Lau - GF L1.pdf',
//     team: [{ en:'DESIGN', name:'Sheerly', role:'方案设计师' }, ...],
//   },
//   floors:    [{ id, zh:'一楼', en:'GROUND FLOOR', image:'asset:…'|null,      // image = 楼层章节页背景（空 = 取该层第一张效果图）
//                plan?:'asset:…', renders3d?:['asset:…'],                        // plan = 平面布置图（裁剪后的那张，坐标按它量）；renders3d = 保存的 3D 户型图
//                planSource?, planCrop?, planScope?, planRegion?, render3dInfo?,       // 原图 / 框选范围 / 每张图的设置（ai/dollhouse.js）
//                plan3d?:{ planSrc, geo, detected, detect, view, tex } }],              // 3D 户型图：核对过的坐标、视角、贴图（ai/plan3d.js）
//   materials: [{ id, name:'浅川橡', code:'AG273', image:'asset:…'|null, pending:false }],
//   cover:     { image:'asset:…'|null },   // Material Board → 方案封面（整张放进右侧，不裁；旧项目的 layout 字段已不用）
//   translations: { [中文]: 'English' },  // 翻译记忆：English / 中英版的英文（整套共用，engine/lang.js）
//   pages:     [{ n, thumb:'asset:…', kind:'cover'|'title'|'floor'|'view'|'end'|'other', title }],  // 原稿页缩略图（编辑器对照用）
//   slides:    [Slide],          // 有序的整套提案
// }
//
// Slide（共有字段：id, kind, enabled=true）
//   { kind:'company', key:'cover'|…, overrides?:{ [字段]: '中文' }, overridesEn?:{ [字段]: 'English' }, images?:{ [照片位]: 'asset:…' } }
//                                                公司固定页 = 品牌画册（engine/b/company.js；字段 / 照片位见 COMPANY_PAGES_B）
//   { kind:'designCover', overrides?, overridesEn?, images? }
//                                                方案封面：有 cover.image 用 Material Board，否则退回「方案」章节页（design-divider）
//   { kind:'materials' }                         本案材料（超过 12 种均分成几页）
//   { kind:'floor', floorId, image?:'asset:…' }  楼层章节页
//   { kind:'view', floorId, layout:'auto'|'framed'|'full', image:'asset:…', room:'客厅', roomEn:'LIVING AREA',
//     subtitle:'全景', materials:[{ role:'柜体 & 柜门', materialId }], notes:[{ label:'隐形门 · Hidden door', text:'液压闭门器，配反弹器' }],
//     sourcePage?: 9, tag?:'3d' }               效果图页（tag:'3d' = 3D 户型图）
//                                                layout：auto = 整套自动排（b/design.js planViews）；full = 满版大图（满版带标题：视角名 + 材料）；framed = 图文
//   { kind:'team' }                              本案服务团队（按 info.team 生成）
//   任何页都可以带 adjust?:{ [组名]: 块 { dx, dy, k } | 照片 { box?, view? } } —— 设计师在画布上手动调的位置 / 大小 / 取景
//                                                （engine/adjust.js；没调过就没有这个字段，版面全由程序排）

/** 版式版本：2 = B「格物」起的数据结构（C「安然」只换版式，数据不变，所以不升版本） */
export const LAYOUT_VERSION = 2;

export const uid = (p = 'x') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const DEFAULT_TEAM = [
  { en: 'DESIGN', name: '', role: '方案设计师' },
  { en: 'TECHNICAL', name: '', role: '深化设计师' },
  { en: 'PROJECT', name: '', role: '项目经理' },
  { en: 'SALES', name: '', role: '销售' },
  { en: 'STORE', name: '', role: '店长' },
];

/** 默认整套顺序：开篇 → 品牌 → 公司 → [方案] → 服务 */
export const COMPANY_BEFORE_DESIGN = [
  'cover', 'contents',
  'brand-divider', 'brand-philosophy', 'brand-story', 'brand-collections', 'brand-awards', 'brand-supply',
  'company-divider', 'company-about', 'company-history', 'company-showrooms', 'company-certified',
];
export const COMPANY_AFTER_DESIGN_HEAD = ['service-divider'];
export const COMPANY_AFTER_DESIGN_TAIL = ['service-process', 'service-cycle', 'service-aftersales', 'closing'];

export function newProject(partial = {}) {
  const now = Date.now();
  const base = {
    id: uid('p'),
    name: '',
    createdAt: now,
    updatedAt: now,
    version: 1,
    layoutVersion: LAYOUT_VERSION,
    info: {
      client: '',
      location: '',
      date: '',
      proposalTitle: '全屋定制设计方案',
      coverTitle: '',
      coverSubtitle: '',
      sourceFile: '',
      team: DEFAULT_TEAM.map((m) => ({ ...m })),
    },
    floors: [],
    materials: [],
    cover: { image: null },
    pages: [],
    slides: [],
  };
  return {
    ...base,
    ...partial,
    info: { ...base.info, ...(partial.info || {}) },
    cover: { ...base.cover, ...(partial.cover || {}) },
  };
}

export const companySlide = (key) => ({ id: uid('s'), kind: 'company', key, enabled: true });

/**
 * 用解析出的方案页（designSlides：floor/view 等）拼出完整提案：
 * 公司开篇 + 方案封面 + 本案材料 + 方案页 + 服务团队 + 服务尾页
 */
export function assembleDeck(designSlides, { withMaterials = true } = {}) {
  return [
    ...COMPANY_BEFORE_DESIGN.map(companySlide),
    { id: uid('s'), kind: 'designCover', enabled: true },
    ...(withMaterials ? [{ id: uid('s'), kind: 'materials', enabled: true }] : []),
    ...designSlides,
    ...COMPANY_AFTER_DESIGN_HEAD.map(companySlide),
    { id: uid('s'), kind: 'team', enabled: true },
    ...COMPANY_AFTER_DESIGN_TAIL.map(companySlide),
  ];
}

/** 「客户 · 地点」等常用拼接 */
export function clientLine(info) {
  return [info?.location, info?.client].map((s) => (s || '').trim()).filter(Boolean).join(' · ');
}

/** 楼层清单 → 「一楼与二楼」「一楼、二楼与三楼」 */
export function floorsLine(floors) {
  const names = (floors || []).map((f) => f.zh).filter(Boolean);
  if (!names.length) return '全屋';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join('、')}与${names[names.length - 1]}`;
}

export const findMaterial = (project, id) => (project.materials || []).find((m) => m.id === id) || null;
export const findFloor = (project, id) => (project.floors || []).find((f) => f.id === id) || null;
