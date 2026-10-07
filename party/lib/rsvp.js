/* ============================================================
   RSVP 数据规则 —— 前端、API、测试共用这一份。
   一条 RSVP = 一户人家（一个名字，带几个大人、几个小孩）。
   ============================================================ */

export const DIET_KEYS = ['vegetarian', 'no-beef', 'halal', 'no-spicy', 'allergy'];

export const LIMITS = {
  name: 40,
  dietNote: 120,
  wish: 300,
  invitedAs: 40,
  maxPerGroup: 20
};

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** 去掉控制字符、合并空白、截断。 */
export function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function toCount(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/**
 * 把前端送来的东西整理成一条干净的 RSVP。
 * 返回 { value } 或 { errors: { field: code } }。
 */
export function normalizeRsvp(input) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};

  const id = typeof src.id === 'string' ? src.id.trim() : '';
  if (!isValidId(id)) errors.id = 'invalid';

  const name = cleanText(src.name, LIMITS.name).replace(/\n/g, ' ');
  if (!name) errors.name = 'required';

  const attending = src.attending === 'yes' || src.attending === 'no' ? src.attending : '';
  if (!attending) errors.attending = 'required';

  let adults = 0;
  let kids = 0;
  let diet = [];
  let dietNote = '';

  if (attending === 'yes') {
    adults = toCount(src.adults);
    kids = src.kids === undefined || src.kids === null || src.kids === '' ? 0 : toCount(src.kids);
    if (!Number.isInteger(adults) || adults < 1 || adults > LIMITS.maxPerGroup) errors.adults = 'range';
    if (!Number.isInteger(kids) || kids < 0 || kids > LIMITS.maxPerGroup) errors.kids = 'range';

    const rawDiet = Array.isArray(src.diet) ? src.diet : [];
    diet = DIET_KEYS.filter((k) => rawDiet.includes(k));
    dietNote = cleanText(src.dietNote, LIMITS.dietNote);
  }

  const wish = cleanText(src.wish, LIMITS.wish);
  const invitedAs = cleanText(src.invitedAs, LIMITS.invitedAs).replace(/\n/g, ' ');
  const lang = src.lang === 'en' ? 'en' : 'zh';

  if (Object.keys(errors).length) return { errors };

  return {
    value: { id, name, attending, adults, kids, diet, dietNote, wish, invitedAs, lang }
  };
}

/** 主人看的完整统计：人数、餐量、饮食需求。 */
export function summarize(list) {
  const rsvps = Array.isArray(list) ? list : [];
  const yes = rsvps.filter((r) => r && r.attending === 'yes');
  const no = rsvps.filter((r) => r && r.attending === 'no');

  const adults = yes.reduce((s, r) => s + (r.adults || 0), 0);
  const kids = yes.reduce((s, r) => s + (r.kids || 0), 0);

  const diet = {};
  for (const key of DIET_KEYS) {
    const groups = yes.filter((r) => Array.isArray(r.diet) && r.diet.includes(key));
    diet[key] = {
      groups: groups.length,
      people: groups.reduce((s, r) => s + (r.adults || 0) + (r.kids || 0), 0),
      names: groups.map((r) => r.name)
    };
  }

  return {
    responses: rsvps.length,
    groups: yes.length,
    declined: no.length,
    adults,
    kids,
    people: adults + kids,
    // 小孩算半份，往上取整 —— 给订餐一个起点，不是精算。
    portions: Math.ceil(adults + kids * 0.5),
    diet
  };
}

/** 给邀请函页面看的公开数字：只有人数，没有名字。 */
export function publicSummary(list) {
  const s = summarize(list);
  return { groups: s.groups, adults: s.adults, kids: s.kids, people: s.people };
}

/** 主人列表：最新回复在最前。 */
export function sortForHost(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
}
