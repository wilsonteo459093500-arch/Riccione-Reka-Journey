// 一个整理好的项目 → 案例库里的一个案例（草稿）。字段全部是 cases.js 的案例格式（migrateCase / validateCase 认的那些）。
//
// 隐私：标题只用「风格 + 颜色 + 房子」拼出来（例：原木 · 胡桃色与米白 · 三房公寓），
// 永远不用文件夹名字；城市、人名、文件名都不进案例（城市和「提到的材料」只存在整理工具自己的笔记里，见 cache.js）。

import { getData, index } from './data.js';
import { hashKey } from './parse.js';
import { matchScore, deltaE, rgbToLab } from './color.js';
import { MAT_BY_ID, fits, hexToRgb } from '../../shared/materials.js';
import { CHIP_VALUE, PROPERTY_BY_ID, ROOM_BY_ID, SUPPLY_BY_ID, SUPPLY_OFFER, migrateCase, guessDreamers } from '../../shared/cases.js';
import { AXES, HIDDEN_AXES, DREAMER_BY_CODE } from '../../shared/dreamers.js';

const NEUTRAL = new Set(['black', 'white', 'grey']);
export const TEMPLATE_FOR = { condo: 'condo3', terrace: 'terrace2', semid: 'semid2', bungalow: 'semid2', townhouse: 'terrace2', other: 'condo3' };
const AX = AXES.map((a) => a.id);
const HID = HIDDEN_AXES.map((a) => a.id);

/** 案例 id：由项目文件夹的指纹算出来（同一个项目再整理一次 → 同一个 id，不会变成两个） */
export const caseIdFor = (groupKey, kind = 'home') => (kind === 'showroom' ? 'sr-' : 'p-') + hashKey('case|' + groupKey).slice(0, 10);

/** 几个风格标签 → 案例的 style（轴 = 各标签的档位平均；第一张牌 = 第一个标签的主牌） */
export function styleOf(tags = []) {
  const { styleById } = index();
  const st = tags.map((t) => styleById[t]).filter(Boolean);
  if (!st.length) return { axes: Object.fromEntries(AX.map((k) => [k, 50])), hidden: Object.fromEntries(HID.map((k) => [k, 50])), dreamers: [], mood: 'cozy', features: [] };
  const avg = (k) => Math.round(st.reduce((s, x) => s + (CHIP_VALUE[x.chips?.[k]] ?? 50), 0) / st.length);
  const axes = Object.fromEntries(AX.map((k) => [k, avg(k)]));
  const hidden = Object.fromEntries(HID.map((k) => [k, avg(k)]));
  const primary = st.map((x) => x.dreamers?.[0]).filter(Boolean);
  const dreamers = [...new Set([...primary, ...st.flatMap((x) => x.dreamers || []), ...guessDreamers({ axes })])].filter((d) => DREAMER_BY_CODE[d]).slice(0, 3);
  return { axes, hidden, dreamers, mood: st[0].mood || 'cozy', features: [...new Set(st.flatMap((x) => x.features || []))] };
}

const MAT_LAB = new Map();
export function matLab(id) {
  if (MAT_LAB.has(id)) return MAT_LAB.get(id);
  const m = MAT_BY_ID[id];
  const lab = m ? rgbToLab(...Object.values(hexToRgb(m.color))) : null;
  MAT_LAB.set(id, lab);
  return lab;
}

/**
 * 按风格 + 照片的主色，给每个主要表面挑一个最接近的材质（员工之后在案例库里可以改）。
 * 候选来自风格表（data.json）；第一个候选（风格的招牌材质）有一点点优势。
 * → { floor, walls, cabinetry, [feature], [countertop], upholstery }
 */
export function suggestMaterials(tags = [], swatches = [], rooms = []) {
  const { styleById } = index();
  const st = tags.map((t) => styleById[t]).filter(Boolean);
  if (!st.length) return {};
  const slots = ['floor', 'walls', 'cabinetry', 'feature', 'countertop', 'upholstery'];
  const out = {};
  for (const slot of slots) {
    if (slot === 'countertop' && !rooms.includes('kitchen')) continue;
    const cands = [...new Set(st.flatMap((x) => x.mats?.[slot] || []))].filter((id) => MAT_BY_ID[id] && fits(id, slot));
    if (!cands.length) continue;
    if (slot === 'upholstery' || !swatches.length) {
      out[slot] = cands[0];
      continue;
    }
    let best = cands[0];
    let bv = -Infinity;
    cands.forEach((id, i) => {
      const v = matchScore(swatches, matLab(id)) + (i === 0 ? 0.04 : 0) - i * 0.005;
      if (v > bv) {
        bv = v;
        best = id;
      }
    });
    out[slot] = best;
  }
  // 墙和柜子一样（都挑了奶油色）时，柜子换下一个最像的、颜色不一样的
  if (out.walls && out.cabinetry && deltaE(matLab(out.walls), matLab(out.cabinetry)) < 6) {
    const alt = [...new Set(st.flatMap((x) => x.mats?.cabinetry || []))].find((id) => id !== out.cabinetry && fits(id, 'cabinetry') && deltaE(matLab(id), matLab(out.walls)) >= 6);
    if (alt) out.cabinetry = alt;
  }
  return out;
}

/** 标题：「原木 · 胡桃色与米白 · 三房公寓」/ "Natural wood · walnut & cream · 3-bedroom condo" */
export function titleOf({ styles = [], raw = [], type = null, bedrooms = null, families = {} } = {}) {
  const d = getData();
  const { styleById, familyById } = index();
  const st = styles.map((s) => styleById[s]).filter(Boolean).slice(0, 2); // 标题最多写两个风格
  const J = d.join || { family: { zh: '', en: ' & ' }, style: { zh: '', en: ' & ' } };
  const zhStyle = st.map((s) => s.zh).join(J.style.zh) || raw[0] || '';
  const enStyle = st.map((s) => s.en).join(J.style.en) || '';
  const skip = new Set(st.flatMap((x) => x.famSkip || [])); // 「原木」的标题不再写「原木色」
  const fam = Object.entries(families)
    .filter(([id, w]) => w >= (NEUTRAL.has(id) ? 0.3 : 0.18) && familyById[id] && !skip.has(id)) // 黑白灰要占得多才写进标题
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => familyById[id]);
  const zhFam = fam.map((f) => f.zh).join(J.family.zh);
  const enFam = fam.map((f) => f.en).join(J.family.en);
  const p = PROPERTY_BY_ID[type];
  const beds = d.beds.find((b) => b.n === Math.min(6, bedrooms || 0));
  const zhProp = p && type !== 'other' ? `${beds ? beds.zh : ''}${p.zh}` : beds ? beds.zh : '';
  const enProp = p && type !== 'other' ? (beds ? `${beds.en} ${p.en.toLowerCase()}` : p.en) : beds ? beds.en : '';
  const zh = [zhStyle, zhFam, zhProp].filter(Boolean).join(' · ');
  const enParts = [enStyle, enFam, enProp].filter(Boolean);
  const en = enParts.length ? enParts.join(' · ').replace(/^./, (c) => c.toUpperCase()) : '';
  return { zh, en };
}

/**
 * 两句话的故事（员工在案例库里改；草稿先有个像样的开头）：
 *   第一句：什么风格、什么房子、我们做了哪几样（只说定制柜、台面、墙板、门这些「我们做」的）；
 *   第二句：主要的材质（柜体 · 台面 · 墙面）。
 * 只用风格 / 房子 / 材质 —— 永远不用文件夹名字、城市、人名。
 * → { zh, en }
 */
/** 英文名字放进句子里：首字母小写；TV 这种全大写的、French / Nanyang 这种专有名词不动 */
const PROPER = /^(French|Nanyang|American|Japandi|Scandinavian|Nordic|Chinese|Japanese|Mediterranean|Balinese|Peranakan)\b/;
const lc = (x) => (PROPER.test(String(x || '')) ? String(x) : String(x || '').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()));

export function storyOf({ styles = [], type = null, bedrooms = null, firm = [], materials = {} } = {}) {
  const d = getData();
  const T = d.story;
  const { styleById } = index();
  const st = styles.map((x) => styleById[x]).filter(Boolean).slice(0, 2);
  if (!st.length || !T) return { zh: '', en: '' };
  const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const p = PROPERTY_BY_ID[type];
  const beds = d.beds.find((b) => b.n === Math.min(6, bedrooms || 0));
  const offer = SUPPLY_OFFER.filter((x) => firm.includes(x.id)).slice(0, 3);
  const m = (slot) => MAT_BY_ID[materials[slot]] || null;
  const cab = m('cabinetry');
  const top = m('countertop');
  const wall = m('walls');
  const line = (lang) => {
    const L = T[lang];
    const en = lang === 'en';
    const prop = p && type !== 'other' ? (en ? (beds ? `${beds.en} ${lc(p.en)}` : lc(p.en)) : `${beds ? beds.zh : ''}${p.zh}`) : L.home;
    const style = en ? st.map((x) => lc(x.en)).join(' & ') : st.map((x) => x.zh).join('');
    const names = offer.map((x) => (en ? lc(x.en) : x.zh));
    const list = en ? (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '') : names.join(d.join?.list?.zh || '、');
    const one = fill(list ? L.made : L.plain, { style, prop, list, all: names.length > 1 ? L.all : '' });
    const name = (mat) => (en ? lc(mat.en) : mat.zh);
    const two = cab ? fill(L.mats, { cab: en ? cab.en : cab.zh, top: top ? fill(L.top, { 0: name(top) }) : '', wall: wall ? fill(L.wall, { 0: name(wall) }) : '' }) : '';
    return [one, two].filter(Boolean).join(en ? ' ' : '');
  };
  return { zh: line('zh'), en: line('en') };
}

/** 照片拍到的房间 → 公司做的东西（默认值，员工在案例库里可以改） */
export function suppliesOf(rooms = []) {
  const d = getData();
  const firm = [...new Set(rooms.flatMap((r) => d.supplyByRoom[r] || []))].filter((id) => SUPPLY_BY_ID[id]);
  return { firm, context: (d.contextDefault || []).filter((id) => SUPPLY_BY_ID[id]) };
}

/**
 * 整理好的项目 → 案例（还没存；调用的人先 putImage 存照片，再 saveCase）。
 * g：项目（groups 的一项）；dec：员工的决定 { styles, type, bedrooms, consent, rooms:{key:room} }；
 * shots：[{ key, room, view, image }]（image = putImage 的结果，封面在第一个）；palette：color.paletteOf 的结果
 */
export function caseFromGroup(g, dec = {}, shots = [], palette = { families: {}, swatches: [] }, { now = new Date().toISOString(), prev = null } = {}) {
  const styles = dec.styles?.length ? dec.styles : g.styles || [];
  const style = styleOf(styles);
  // 没标房间的照片：room ''（案例库显示「房间？」，客人看不到房间名字）—— 永远不猜成客厅。
  // 整个家的 3D 鸟瞰：room 'plan3d'、kind 'plan3d'（客人那边标「整个家（3D）」，不算一个房间）
  const images = shots.map((s, i) => {
    const room = s.room && ROOM_BY_ID[s.room] ? s.room : '';
    return { ...s.image, room, kind: room === 'plan3d' ? 'plan3d' : s.view === 'render' ? 'render' : 'photo', cover: i === 0, alt: { zh: '', en: '' } };
  });
  const rooms = [...new Set(images.map((im) => im.room))].filter((r) => r && r !== 'plan3d');
  const type = dec.type || null;
  const showroom = g.kind === 'showroom';
  const id = prev?.id || caseIdFor(g.from ? `${g.dir}#${g.id}` : g.dir, g.kind);
  const raw = {
    id,
    kind: showroom ? 'showroom' : 'project', // 展厅：cases.js 的 'showroom' 类，matchCases 永远不配给客人
    v: 1,
    rev: prev?.rev || 0,
    status: showroom ? 'hidden' : 'draft',
    order: prev?.order ?? 1000,
    consent: !showroom && !!dec.consent,
    title: titleOf({ styles, raw: g.raw, type, bedrooms: dec.bedrooms, families: palette.families }),
    story: prev?.story?.zh || prev?.story?.en ? prev.story : null, // 下面按风格 / 房子 / 材质补上两句
    place: prev?.place || { zh: '', en: '' },
    property: { type: type || 'other', sizeSqft: prev?.property?.sizeSqft ?? null, bedrooms: dec.bedrooms || null, bathrooms: prev?.property?.bathrooms ?? null, storeys: prev?.property?.storeys ?? 1 },
    scope: rooms.includes('living') || rooms.length >= 3 ? 'whole' : 'rooms',
    rooms: rooms.length ? rooms : ['living'],
    template: TEMPLATE_FOR[type] || null,
    style: { dreamers: style.dreamers, axes: style.axes, hidden: style.hidden, wishes: prev?.style?.wishes || [], features: style.features },
    materials: suggestMaterials(styles, palette.swatches, rooms),
    mood: style.mood,
    time: null,
    furniture: prev?.furniture || {},
    supplies: suppliesOf(rooms),
    products: prev?.products || [],
    wishNotes: prev?.wishNotes || {},
    images,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
  if (!raw.story) raw.story = storyOf({ styles, type, bedrooms: dec.bedrooms, firm: raw.supplies.firm, materials: raw.materials });
  return migrateCase(raw);
}
