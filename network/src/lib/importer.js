/* ============================================================
   SPACE · 把现有人脉搬进来（体检第 4 阶段，纯函数，有单元测试）
   ------------------------------------------------------------
   来源（全部在手机 / 浏览器里读，不用 AI、不花钱、不上传档案）：
     • Android 手机通讯录（Chrome 的「选联系人」）
     • 通讯录 .vcf（Android / iPhone / Google 通讯录汇出）
     • CSV（Google 通讯录、Outlook、自己的 Excel 另存 CSV）
     • WhatsApp 群聊记录 .txt / .zip：发过言的人 + 「某某加入 / 被加进群」的号码
   流程：读档 → 整理成同一个样子（候选人）→ 清单里打勾 → 建人。
   导入的人：圈层「认识」、不算刚认识、第一次提醒日 first_due 分散在之后 4 个月。
   ============================================================ */
import { digits, toWhatsApp, pickWhatsApp, findDuplicates, normName, isSharedPhone, uid } from './logic.js';
import { parseWhatsApp, nameFromWhatsAppFile } from './talk.js';
import { guessSalutation } from './salute.js';

export const IMPORT_SOURCES = ['contacts', 'vcf', 'csv', 'whatsapp'];
export const MAX_IMPORT = 3000;          // 一次最多读这么多人（太多手机会卡）
export const STAGGER_DAYS = 120;         // 第一次提醒分散在几天里（=「认识」圈的联系频率）

const DAY = 86400000;
const str = (v) => String(v ?? '').trim();

/* ====================== 电话 ====================== */
const PHONE_LABELS = [
  [/whatsapp/i, 'whatsapp'],
  [/cell|mobile|iphone|handphone|^hp$|手机|手提|移动/i, 'mobile'],
  [/fax|传真|傳真/i, 'fax'],
  [/work|office|business|company|main|公司|办公|辦公|总机|總機/i, 'office'],
  [/home|住家|家/i, 'home'],
];
export function phoneLabel(raw) {
  const s = str(raw);
  for (const [re, l] of PHONE_LABELS) if (re.test(s)) return l;
  return '';
}

/** 一个号码是哪种：mobile（马来西亚手机）/ landline（座机）/ hotline（1300…）/ foreign / '' */
export function phoneKind(number) {
  const d = digits(number);
  if (!d) return '';
  if (/^(?:60)?1[378]00/.test(d)) return 'hotline';
  const wa = toWhatsApp(number);
  if (!wa) return '';
  if (/^601\d{8,9}$/.test(wa)) return 'mobile';
  if (wa.startsWith('60')) return 'landline';
  return 'foreign';
}

/** 显示用：60123456789 → +60 12-345 6789（看不懂的照原样） */
export function prettyPhone(number) {
  const wa = toWhatsApp(number);
  const m = /^60(1\d)(\d{3,4})(\d{4})$/.exec(wa);
  if (m) return `+60 ${m[1]}-${m[2]} ${m[3]}`;
  return str(number);
}

/** 电话整理：去掉 (0)、分机号、重复的号码；标签认出来 */
export function cleanPhones(list) {
  const out = [];
  const seen = new Set();
  for (const p of list || []) {
    const number = str(p && p.number)
      .replace(/\s*(?:ext\.?|extension|x|#|分机|轉|转)\s*\d{1,5}\s*$/i, '') // 分机号不接在号码后面
      .replace(/\(\s*0\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    const d = digits(number);
    if (d.length < 6) continue;
    const key = d.slice(-9);
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = phoneKind(number);
    let label = phoneLabel(p.label);
    if (label === 'mobile' && (kind === 'landline' || kind === 'hotline')) label = 'office'; // 标「手机」的 03 / 1300 号码
    if (!label && kind === 'mobile') label = 'mobile';
    if (!label && kind === 'hotline') label = 'office';
    out.push({ label, number });
  }
  return out;
}

/* ====================== vCard (.vcf) ====================== */
function decodeQP(s, charset = 'utf-8') {
  const bytes = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; } else {
      const code = t.charCodeAt(i);
      if (code < 128) bytes.push(code); else bytes.push(...new TextEncoder().encode(t[i]));
    }
  }
  try { return new TextDecoder(charset).decode(new Uint8Array(bytes)); } catch { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); }
}
const unescapeV = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1');
/** 用没被反斜线跳脱的 ; 切开 */
function splitV(s, sep = ';') {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i += 1; } else if (s[i] === sep) { out.push(cur); cur = ''; } else cur += s[i];
  }
  out.push(cur);
  return out.map(unescapeV);
}

/** 解析 .vcf（可以一档很多人）。回 [{ name, title, company, phones, emails, notes, birthday }] */
export function parseVCard(text) {
  const raw = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  // 接回被折行的：下一行开头是空白（vCard 3/4）；或 QUOTED-PRINTABLE 行尾是 =（vCard 2.1）
  const lines = [];
  for (const l of raw) {
    const prev = lines.length ? lines[lines.length - 1] : null;
    if (prev != null && /^[ \t]/.test(l)) lines[lines.length - 1] = prev + l.slice(1);
    else if (prev != null && /QUOTED-PRINTABLE/i.test(prev.split(':')[0]) && /=$/.test(prev)) lines[lines.length - 1] = `${prev.slice(0, -1)}${l}`;
    else lines.push(l);
  }
  const out = [];
  let cur = null;
  let labels = {}; // iPhone：item1.X-ABLabel:WhatsApp
  for (const line of lines) {
    if (/^BEGIN:VCARD/i.test(line)) { cur = { fn: '', n: null, org: '', title: '', phones: [], emails: [], notes: [], birthday: '' }; labels = {}; continue; }
    if (/^END:VCARD/i.test(line)) {
      if (cur) {
        for (const p of cur.phones) if (p.group && labels[p.group]) p.label = labels[p.group];
        out.push(finishVCard(cur));
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const ci = line.indexOf(':');
    if (ci <= 0) continue;
    const head = line.slice(0, ci);
    let value = line.slice(ci + 1);
    const parts = head.split(';');
    let prop = parts[0];
    let group = '';
    if (prop.includes('.')) { [group, prop] = [prop.slice(0, prop.lastIndexOf('.')), prop.slice(prop.lastIndexOf('.') + 1)]; }
    prop = prop.toUpperCase();
    const params = parts.slice(1);
    const enc = params.find((x) => /ENCODING=QUOTED-PRINTABLE|^QUOTED-PRINTABLE$/i.test(x));
    const cs = (params.find((x) => /^CHARSET=/i.test(x)) || '').split('=')[1];
    if (enc) value = decodeQP(value, cs || 'utf-8');
    const types = params.flatMap((x) => (/^TYPE=/i.test(x) ? x.slice(5).split(',') : /=/.test(x) ? [] : [x])).map((x) => x.replace(/"/g, ''));
    switch (prop) {
      case 'FN': cur.fn = unescapeV(value).trim(); break;
      case 'N': cur.n = splitV(value); break;
      case 'ORG': cur.org = splitV(value).filter((x) => x.trim()).join(' · '); break;
      case 'TITLE': cur.title = unescapeV(value).trim(); break;
      case 'TEL': cur.phones.push({ label: types.join(' '), number: value.replace(/^tel:/i, '').trim(), group }); break;
      case 'EMAIL': if (value.trim()) cur.emails.push(value.replace(/^mailto:/i, '').trim().toLowerCase()); break;
      case 'NOTE': if (value.trim()) cur.notes.push(unescapeV(value).trim()); break;
      case 'BDAY': cur.birthday = cleanBirthday(value); break;
      case 'X-ABLABEL': if (group) labels[group] = value.replace(/^_\$!<|>!\$_$/g, ''); break;
      default:
    }
  }
  return out.filter((c) => c.name || c.phones.length || c.emails.length);
}

function finishVCard(c) {
  let name = c.fn;
  if (!name && c.n) {
    const [family = '', given = '', middle = '', prefix = '', suffix = ''] = c.n.map((x) => x.trim());
    name = /[㐀-鿿]/.test(family + given) ? `${prefix}${family}${given}` : [prefix, given, middle, family, suffix].filter(Boolean).join(' ');
  }
  if (!name) name = c.org;
  return {
    name: str(name), title: c.title, company: c.org, phones: c.phones.map(({ label, number }) => ({ label, number })),
    emails: [...new Set(c.emails)], notes: c.notes.join('\n'), birthday: c.birthday,
  };
}

/** 生日统一成 YYYY-MM-DD；不知道年份 → --MM-DD */
export function cleanBirthday(v) {
  const s = str(v);
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  if (m) return m[1] === '1604' ? `--${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`; // iPhone 没年份时写 1604
  m = /^--(\d{2})-?(\d{2})/.exec(s);
  if (m) return `--${m[1]}-${m[2]}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s); // 15/03/1980（马来西亚：日/月/年）
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

/* ====================== CSV ====================== */
/** CSV 切成一格一格（引号里的逗号、换行都对）；分隔符自动认：逗号 / 分号 / Tab */
export function parseCSV(text) {
  const t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = t.split('\n', 1)[0];
  const sep = [',', ';', '\t'].map((c) => [c, firstLine.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const H = (h) => String(h || '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
const COLS = {
  name: /^(name|full name|display name|file as|姓名|名字|名称|名稱|联系人|聯絡人|nama|nama penuh)$/,
  first: /^(first name|given name|名)$/,
  middle: /^(middle name|additional name)$/,
  last: /^(last name|family name|surname|姓)$/,
  prefix: /^(name prefix|title prefix|prefix|称谓)$/,
  company: /^(organization name|organization 1 - name|company|company name|organisation|organization|公司|公司名称|公司名稱|单位|syarikat)$/,
  title: /^(organization title|organization 1 - title|job title|title|position|职位|職位|职称|職稱|jawatan)$/,
  notes: /^(notes?|备注|備註|remarks?|catatan)$/,
  tags: /^(labels|group membership|categories|tags?|标签|標籤|分组|分組)$/,
  birthday: /^(birthday|生日|date of birth|dob)$/,
};
const PHONE_COL = /(phone|mobile|tel\b|telephone|handphone|^hp$|whatsapp|手机|手機|电话|電話|fax|传真)/;
const EMAIL_COL = /(e-?mail|邮箱|郵箱|电邮|電郵|邮件)/;
const META_COL = /(label|type|标签类型)$/;

/** CSV 的每一列 → 候选人（认得 Google 通讯录、Outlook、自己写的中文 / 英文表头） */
export function csvToContacts(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(H);
  const find = (re) => head.findIndex((h) => re.test(h));
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, find(re)]));
  const phoneCols = head.map((h, i) => (PHONE_COL.test(h) && !META_COL.test(h) && !EMAIL_COL.test(h) ? i : -1)).filter((i) => i >= 0);
  const emailCols = head.map((h, i) => (EMAIL_COL.test(h) && !META_COL.test(h) ? i : -1)).filter((i) => i >= 0);
  // Google：「Phone 1 - Value」旁边的「Phone 1 - Label」
  const labelFor = (i) => {
    const m = /^(phone \d+) - value$/.exec(head[i]);
    if (m) { const j = head.findIndex((h) => h === `${m[1]} - label` || h === `${m[1]} - type`); return j >= 0 ? j : -1; }
    return -1;
  };
  const out = [];
  for (const r of rows.slice(1)) {
    const g = (k) => (idx[k] >= 0 ? str(r[idx[k]]) : '');
    let name = g('name');
    if (!name) {
      const first = g('first'); const last = g('last'); const mid = g('middle');
      name = /[㐀-鿿]/.test(first + last) ? `${last}${first}` : [g('prefix'), first, mid, last].filter(Boolean).join(' ');
    }
    const phones = [];
    for (const i of phoneCols) {
      const li = labelFor(i);
      const label = li >= 0 ? str(r[li]) : head[i];
      // Google 一格可以有好几个号码：「012-345 6789 ::: 03-1234 5678」
      for (const n of str(r[i]).split(/\s*:::\s*|\s*[\/,]\s*(?=\+?\d)/)) if (digits(n).length >= 6) phones.push({ label, number: n });
    }
    const emails = emailCols.flatMap((i) => str(r[i]).split(/\s*:::\s*|[\s,;]+/)).filter((e) => /@/.test(e)).map((e) => e.toLowerCase());
    const tags = g('tags').split(/\s*:::\s*|[,;，、]/).map((x) => x.replace(/^\*\s*/, '').trim()).filter((x) => x && !/^(mycontacts|my contacts|starred)$/i.test(x));
    const c = { name, title: g('title'), company: g('company'), phones, emails: [...new Set(emails)], notes: g('notes'), birthday: cleanBirthday(g('birthday')), tags };
    if (c.name || c.phones.length || c.emails.length) out.push(c);
  }
  return out;
}

/* ====================== WhatsApp 群 ====================== */
const NUMBER_ONLY = /^[+\d][\d\s\-().]{6,}$/;
const ME = /^(you|你|您|我)$/i;
// 系统讯息：谁加了谁、谁用邀请链接进来、谁退出、群名
const SYS_ADDED = [/^(.+?) added (.+)$/i, /^(.+?)\s*(?:添加了|已添加|新增了)\s*(.+)$/];
const SYS_JOINED = [/^(.+?) joined using (?:this|a) group'?s? (?:invite )?link$/i, /^(.+?) joined from the community$/i, /^(.+?)\s*(?:已?通过此群组的邀请链接加入|通過此群組的邀請連結加入|已加入)$/];
const SYS_LEFT = [/^(.+?) left$/i, /^(.+?)\s*(?:已?退出(?:了群组)?|已離開)$/];
const SYS_REMOVED = [/^.+? removed (.+)$/i, /^.+?\s*(?:移除了|已移除)\s*(.+)$/];
const SYS_SUBJECT = [/created group [“"](.+)[”"]$/i, /changed the (?:subject|group name) (?:from [“"].*[”"] )?to [“"](.+)[”"]$/i, /创建了群组[“"「](.+)[”"」]$/, /(?:将群组名称|把群组名称)(?:更改|改)为[“"「](.+)[”"」]$/];
const HEAD = /^\[?\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}[,，]?\s*(?:上午|下午|中午|晚上|凌晨)?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?(.*)$/;
const splitList = (s) => s.split(/\s*(?:,|，|、| and | 和 |与|及)\s*/).map((x) => x.replace(/[.。]$/, '').trim()).filter(Boolean);
const cleanSender = (s) => str(s).replace(/[‎‏‪-‮⁦-⁩﻿]/g, '').replace(/^~\s*/, '').trim();

/**
 * WhatsApp 群聊记录 → 群成员。
 * 回 { group, members: [{ name, number, count, joined, left }] }
 *   name：你手机里存的名字（存过的人才有）；number：没存过的人只显示号码
 * meNames：自己在 WhatsApp 的名字（自己不用导入）
 */
export function groupMembers(text, filename = '', { meNames = [] } = {}) {
  const raw = String(text || '');
  const parsed = parseWhatsApp(raw);
  const me = new Set(meNames.map((x) => normName(x)).filter(Boolean));
  const map = new Map();
  const add = (who, patch = {}) => {
    const n = cleanSender(who);
    if (!n || ME.test(n) || me.has(normName(n))) return;
    const isNum = NUMBER_ONLY.test(n);
    const key = isNum ? `#${digits(n).slice(-9)}` : `@${normName(n)}`;
    const cur = map.get(key) || { name: isNum ? '' : n, number: isNum ? n : '', count: 0, joined: false, left: false };
    map.set(key, { ...cur, ...patch, count: cur.count + (patch.count || 0) });
  };
  for (const p of parsed.participants) add(p.name, { count: p.count });

  let group = nameFromWhatsAppFile(filename);
  for (const line0 of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const m = HEAD.exec(cleanSender(line0));
    if (!m) continue;
    const rest = m[1];
    if (/^[^:]{1,80}: /.test(rest)) continue; // 一般讯息
    let hit;
    for (const re of SYS_SUBJECT) if ((hit = re.exec(rest))) group = hit[1].trim();
    for (const re of SYS_ADDED) if ((hit = re.exec(rest))) { splitList(hit[2]).forEach((x) => add(x, { joined: true, left: false })); break; }
    for (const re of SYS_JOINED) if ((hit = re.exec(rest))) { add(hit[1], { joined: true, left: false }); break; }
    for (const re of SYS_LEFT) if ((hit = re.exec(rest))) { add(hit[1], { left: true }); break; }
    for (const re of SYS_REMOVED) if ((hit = re.exec(rest))) { splitList(hit[1]).forEach((x) => add(x, { left: true })); break; }
  }
  const members = [...map.values()].sort((a, b) => Number(a.left) - Number(b.left) || b.count - a.count);
  return { group, members };
}

/** 群成员 → 候选人 */
export function membersToContacts(members, group = '') {
  return members.map((m) => ({
    name: m.name || '',
    phones: m.number ? [{ label: 'mobile', number: m.number }] : [],
    emails: [],
    notes: '',
    groupInfo: { count: m.count, joined: m.joined, left: m.left },
    tags: group ? [group] : [],
  }));
}

/* ====================== Android 手机通讯录（Contact Picker） ====================== */
export const pickerSupported = () => typeof navigator !== 'undefined' && !!(navigator.contacts && navigator.contacts.select);
/** navigator.contacts.select 的结果 → 候选人 */
export function pickerToContacts(list) {
  return (list || []).map((c) => ({
    name: str((c.name || [])[0]),
    phones: (c.tel || []).map((number) => ({ label: '', number })),
    emails: (c.email || []).map((e) => str(e).toLowerCase()).filter(Boolean),
    notes: '',
  })).filter((c) => c.name || c.phones.length);
}

/* ====================== 整理成清单 ====================== */
/**
 * 读到的联系人 → 清单上的候选人：
 *   • 同一个号码 / 邮箱在档案里出现两次 → 并成一个
 *   • 已经在 SPACE 的人 → existing（灰掉，不重复建）；只是名字一样 → maybe（提醒你看一下）
 *   • 猜好称呼、挑好 WhatsApp
 *   • 默认勾不勾：有手机号、不是已在 SPACE、不像旧朋友、没退群 → 勾（WhatsApp 群）；通讯录默认不勾（人太杂，你自己挑）
 */
export function prepareCandidates(contacts, { people = [], companies = [], source = 'vcf' } = {}) {
  const merged = [];
  const byKey = new Map();
  for (const c0 of contacts.slice(0, MAX_IMPORT)) {
    const c = { ...c0, name: str(c0.name).replace(/\s+/g, ' '), phones: cleanPhones(c0.phones), emails: [...new Set((c0.emails || []).map((e) => str(e).toLowerCase()).filter((e) => /@/.test(e)))] };
    const keys = [
      ...c.phones.filter((p) => !isSharedPhone(p.number, p.label)).map((p) => `p${digits(p.number).slice(-9)}`),
      ...c.emails.map((e) => `e${e}`),
    ];
    const hit = keys.map((k) => byKey.get(k)).find(Boolean);
    if (hit) {
      hit.phones = cleanPhones([...hit.phones, ...c.phones]);
      hit.emails = [...new Set([...hit.emails, ...c.emails])];
      for (const k of ['title', 'company', 'notes', 'birthday']) if (!hit[k] && c[k]) hit[k] = c[k];
      if (!hit.name && c.name) hit.name = c.name;
      hit.tags = [...new Set([...(hit.tags || []), ...(c.tags || [])])];
      keys.forEach((k) => byKey.set(k, hit));
      continue;
    }
    merged.push(c);
    keys.forEach((k) => byKey.set(k, c));
  }

  return merged.map((c, i) => {
    const dups = findDuplicates({ name: c.name, company: c.company, phones: c.phones, emails: c.emails }, people, companies);
    const strong = dups.find((d) => d.strong);
    // WhatsApp 群里没号码的人只有名字可以认：名字一样就当作已经在 SPACE
    const nameOnly = !c.phones.length && !c.emails.length;
    const existing = strong || (nameOnly ? dups.find((d) => d.reasons.includes('名字一样') || d.reasons.includes('名字和公司都一样')) : null) || null;
    const maybe = existing ? null : dups[0] || null;
    const whatsapp = pickWhatsApp(c.phones);
    const left = !!(c.groupInfo && c.groupInfo.left);
    const checked = source === 'whatsapp' ? !existing && !maybe && !left && (!!whatsapp || !!c.name) : false;
    return {
      key: `c${i}`,
      name: c.name,
      title: str(c.title),
      company: str(c.company),
      phones: c.phones,
      emails: c.emails,
      notes: str(c.notes),
      birthday: c.birthday || '',
      tags: c.tags || [],
      groupInfo: c.groupInfo || null,
      whatsapp,
      salutation: c.name ? guessSalutation(c.name) : '',
      existing: existing ? { id: existing.person.id, name: existing.person.name, reasons: existing.reasons } : null,
      maybe: maybe ? { id: maybe.person.id, name: maybe.person.name, reasons: maybe.reasons } : null,
      checked,
    };
  });
}

/** 清单的筛选：搜名字 / 公司 / 电话；只看有手机号；隐藏已在 SPACE */
export function filterCandidates(list, { q = '', mobileOnly = false, hideExisting = true } = {}) {
  const t = str(q).toLowerCase();
  const td = digits(q);
  return list.filter((c) => {
    if (hideExisting && c.existing) return false;
    if (mobileOnly && !c.whatsapp) return false;
    if (!t) return true;
    if (`${c.name} ${c.company} ${c.title} ${c.salutation} ${(c.tags || []).join(' ')}`.toLowerCase().includes(t)) return true;
    return td.length >= 3 && c.phones.some((p) => digits(p.number).includes(td));
  });
}

/* ====================== 第一次提醒：分散开 ====================== */
const dateKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 给 count 个新导入的人排第一次提醒日（YYYY-MM-DD），分散在明天起 days 天里，
 * 每天的人数尽量平均 —— 也把之前导入、还没到期的人算进去（分两晚导入也不会挤在同几天）。
 */
export function staggerDue(count, existingDues = [], { now = Date.now(), days = STAGGER_DAYS } = {}) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const keys = Array.from({ length: days }, (_, i) => dateKey(start.getTime() + (i + 1) * DAY + 3600000)); // +1 小时避开夏令时（马来西亚没有，保险）
  const load = new Map(keys.map((k) => [k, 0]));
  for (const d of existingDues) if (load.has(d)) load.set(d, load.get(d) + 1);
  const out = [];
  let ptr = 0;
  for (let n = 0; n < count; n += 1) {
    let min = Infinity;
    for (const k of keys) min = Math.min(min, load.get(k));
    let i = ptr;
    while (load.get(keys[i % days]) !== min) i += 1;
    const k = keys[i % days];
    load.set(k, load.get(k) + 1);
    out.push(k);
    ptr = (i % days) + Math.max(1, Math.floor(days / Math.max(1, count))); // 跳着放，不会先塞满前面几天
  }
  return out;
}

/* ====================== 建人 ====================== */
/**
 * 候选人 → people 表的一列（公司另外处理：company 名字交给 store 找 / 建公司）
 * opts: { source, tags: [], howMet, firstDue }
 */
export function toPersonRow(c, { source = 'vcf', tags = [], howMet = '', firstDue = null } = {}) {
  const name = str(c.name) || prettyPhone((c.phones[0] || {}).number) || (c.emails[0] || '');
  return {
    id: uid(),
    name,
    title: str(c.title),
    phones: c.phones,
    emails: c.emails,
    whatsapp: c.whatsapp || pickWhatsApp(c.phones),
    notes: str(c.notes),
    tags: [...new Set([...(c.tags || []), ...tags].map(str).filter(Boolean))],
    how_met: str(howMet),
    met_on: null,
    tier: 'known',
    affinity: 50,
    interests: [],
    salutation: str(c.salutation) && str(c.salutation) !== guessSalutation(name) ? str(c.salutation) : '', // 跟猜的一样就不存，以后规则改进会跟着变
    birthday: c.birthday || '',
    import_source: IMPORT_SOURCES.includes(source) ? source : 'vcf',
    first_due: firstDue,
    pending_review: false,
  };
}
