// 师傅链接：把一个项目的资料打包进链接，外包安装师傅点开就能填这个项目的每日汇报。
// 不需要账号 / 服务器：项目资料就在链接里；师傅填的汇报存在师傅自己的手机，
// 填好照常「分享文案 + 照片」发到群里。每天点同一个链接即可。
import { createReport, duplicateReport } from './report.js';
import { todayISO } from './format.js';

export const CREW_TEMPLATE = 'daily-report';

// 发给师傅的项目资料（不含 SO、设计师、备注等内部资料）
export const CREW_FIELDS = ['name', 'unit', 'client', 'address', 'mapLink', 'startDate', 'plannedDays', 'entryNote', 'parking'];
export const CREW_FIELD_LABELS = {
  name: '项目名称',
  unit: '单位',
  client: '客户称呼',
  address: '地址',
  mapLink: '导航',
  startDate: '开工日期',
  plannedDays: '预计天数',
  entryNote: '进场须知',
  parking: '停车',
};

function b64urlEncode(str) {
  let bin = '';
  for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const text = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));

/** 只取约定的字段，全部转成短字符串（链接内容来自外部，不信任） */
function pickProject(p) {
  const out = { id: text(p?.id, 80) };
  for (const k of CREW_FIELDS) {
    const v = text(p?.[k], k === 'address' ? 1000 : 500);
    if (v) out[k] = v;
  }
  return out;
}

/** 项目 → 链接里的那一段（base64url JSON） */
export function crewPayload(project, settings = {}) {
  const by = {};
  if (settings.name) by.name = text(settings.name, 80);
  if (settings.phone) by.phone = text(settings.phone, 40);
  return b64urlEncode(JSON.stringify({ v: 1, t: CREW_TEMPLATE, p: pickProject(project), by, at: project.updatedAt || 0 }));
}

export function crewLink(project, settings, origin = window.location.origin) {
  return `${origin}/#/crew/${crewPayload(project, settings)}`;
}

/** 从完整网址里取出链接那一段（本身就是那一段时原样返回） */
export function crewPayloadOf(input) {
  const s = String(input || '').trim();
  const m = s.match(/#\/crew\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

/** 解析链接（完整网址或只是那一段）；无效返回 null */
export function parseCrew(input) {
  const raw = crewPayloadOf(input);
  if (!/^[A-Za-z0-9_-]{8,}$/.test(raw)) return null;
  try {
    const d = JSON.parse(b64urlDecode(raw));
    if (d?.v !== 1 || !d.p) return null;
    const p = pickProject(d.p);
    if (!p.id || !p.name) return null;
    const by = { name: text(d.by?.name, 80), phone: text(d.by?.phone, 40) };
    return { template: CREW_TEMPLATE, project: p, by, at: Number(d.at) || 0 };
  } catch {
    return null;
  }
}

/**
 * 链接里的项目合并进本机。返回要保存的项目，不用保存时返回 null。
 * - 本机没有 → 新建（标记 shared）
 * - 本机自己建的同一项目（主管自己点开测试）→ 不动
 * - 之前从链接导入的 → 链接里的资料更新时整份替换（主管删掉的字段也跟着清掉）
 */
export function mergeCrewProject(local, data) {
  const incoming = { ...data.project, shared: { by: data.by, at: data.at } };
  if (!local) return incoming;
  if (!local.shared) return null;
  if ((local.shared.at || 0) >= data.at) return null;
  return { ...incoming, createdAt: local.createdAt };
}

/** 设备上除了师傅链接导入的项目，还有没有自己的项目 / 报告（有的话不切换成师傅模式） */
export function hasOwnWork(projects, reports) {
  const shared = new Set(projects.filter((p) => p.shared).map((p) => p.id));
  return projects.some((p) => !p.shared) || reports.some((r) => !r.projectId || !shared.has(r.projectId));
}

/**
 * 今天该打开哪份汇报：今天已有 → 打开它；否则照最近一份再写一份（文字保留、照片清空、工期减一天）；
 * 都没有 → 新建。返回 { report, created }。
 */
export function todayReport(template, project, reports, settings, today = todayISO()) {
  const mine = reports.filter((r) => r.templateId === template.id && r.projectId === project.id);
  const todays = mine.filter((r) => r.values?.date === today).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (todays.length) return { report: todays[0], created: false };
  const earlier = mine
    .filter((r) => String(r.values?.date || '') < today)
    .sort((a, b) => String(b.values?.date || '').localeCompare(String(a.values?.date || '')) || (b.updatedAt || 0) - (a.updatedAt || 0));
  const report = earlier.length
    ? duplicateReport(template, earlier[0], { project, settings, previous: mine })
    : createReport(template, { project, settings, previous: mine });
  return { report, created: true };
}

/** 发给师傅的 WhatsApp 文案 */
export function crewMessage(label, link) {
  return [
    `【TORA 每日安装汇报】${label}`,
    '师傅好，每天收工前点下面的链接填写当天汇报（进度照 / 卫生 / 水电门窗 / 退场视频），填好点「分享文案 + 照片」发到群里。',
    link,
    '（每天点同一个链接就行，建议用 Chrome / Safari 打开）',
  ].join('\n');
}
