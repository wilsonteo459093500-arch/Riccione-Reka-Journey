// 项目数据模型 —— 导入（PDF 解析）、编辑器、导出（PPT）、AI 功能共用的唯一契约。
// 全部是可 JSON 序列化的纯数据；图片只存引用（'asset:<id>'），二进制在 IndexedDB（store/db.js）。
//
// Project = {
//   id, name, createdAt, updatedAt, version: 1,
//   info: {
//     client: 'Mr Lau', location: 'Muar', date: '2026 · 08',
//     proposalTitle: '全屋定制设计方案',
//     coverTitle: '',            // 方案封面（Material Board 页）大标题，空 = 自动「客户 · 地点」
//     coverSubtitle: '',         // 方案封面副标题，空 = 'THE DREAM HOUSE JOURNEY'
//     sourceFile: '2026.8.6 Muar - Mr Lau - GF L1.pdf',
//     team: [{ en:'DESIGN', name:'Sheerly', role:'方案设计师' }, ...],
//   },
//   floors:    [{ id, zh:'一楼', en:'GROUND FLOOR', image:'asset:…'|null,      // image = 楼层章节页背景（空 = 取该层第一张效果图）
//                plan?:'asset:…', renders3d?:['asset:…'] }],                     // plan = 平面布置图；renders3d = AI 全屋立体图历史
//   materials: [{ id, name:'浅川橡', code:'AG273', image:'asset:…'|null, pending:false }],
//   cover:     { image:'asset:…'|null, layout:'split-light'|'split-dark'|'full' },   // Material Board → 方案封面
//   pages:     [{ n, thumb:'asset:…', kind:'cover'|'title'|'floor'|'view'|'end'|'other', title }],  // 原稿页缩略图（编辑器对照用）
//   slides:    [Slide],          // 有序的整套提案
// }
//
// Slide（共有字段：id, kind, enabled=true）
//   { kind:'company', key:'cover'|…, overrides?:{ [elementIndex]: '整段文字（\n 分段）' } }   公司固定页（engine/companyTemplate.js）
//   { kind:'designCover' }                       方案封面：有 cover.image 用 Material Board，否则退回「方案 · 设计图」章节页
//   { kind:'materials' }                         本案材料（超过 12 种自动分页）
//   { kind:'floor', floorId, image?:'asset:…' }  楼层章节页
//   { kind:'view', floorId, layout:'framed'|'full', image:'asset:…', room:'客厅', roomEn:'LIVING AREA',
//     subtitle:'全景', materials:[{ role:'柜体 & 柜门', materialId }], notes:[{ label:'隐形门 · Hidden door', text:'液压闭门器，配反弹器' }],
//     sourcePage?: 9, tag?:'3d' }               效果图页（tag:'3d' = AI 全屋立体图）
//   { kind:'team' }                              本案服务团队（按 info.team 生成）

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
    cover: { image: null, layout: 'split-light' },
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
