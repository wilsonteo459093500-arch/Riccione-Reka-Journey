/* ============================================================
   SPACE · 第 2 阶段：对话输入（纯函数，有单元测试）
   ------------------------------------------------------------
   • WhatsApp 汇出的 .txt：iPhone / Android、日月年 / 月日年 / 年月日、
     12 / 24 小时、中文「上午 / 下午」都认得
   • Plaud 汇出的 .srt / .vtt：去掉序号和时间轴
   • 对话分析结果：挑出「还没做的承诺」、合并标签
   ============================================================ */
import { normName } from './logic.js';

/* ---------- 来源 ---------- */
export const TALK_SOURCES = [
  { key: 'plaud', label: 'Plaud 逐字稿', short: 'Plaud', kinds: ['meeting', 'call'], hint: 'Plaud App → 逐字稿 → 分享 / 汇出 TXT 或 SRT，贴上或上传' },
  { key: 'voice', label: '语音备注', short: '语音', kinds: ['meeting', 'call', 'note'], hint: '按键盘上的 🎤 直接说：刚刚跟他聊了什么、他提到什么' },
  { key: 'whatsapp_txt', label: 'WhatsApp 聊天记录', short: 'WhatsApp', kinds: ['message'], hint: 'WhatsApp → 跟他的对话 → 汇出对话 →「不附加媒体」→ 存到档案' },
  { key: 'whatsapp_screenshot', label: 'WhatsApp 截图', short: '截图', kinds: ['message'], hint: '一次最多 6 张，按时间顺序选' },
];
export const SOURCE_BY_KEY = Object.fromEntries(TALK_SOURCES.map((s) => [s.key, s]));

export const MAX_TALK_CHARS = 120000; // 约 1.5 小时的会议逐字稿；Haiku 跑这么多也只要几分钱
export const MAX_SCREENSHOTS = 6;
/**
 * 体检第 3 阶段：超过这么多字就建议分段。
 * 一次整理太长，AI 常常写不完（被截断，重按还是一样）或超过服务器的 52 秒期限。
 * 3 万字大约是 1 小时的中英混杂会议逐字稿
 */
export const TALK_SPLIT_CHARS = 30000;

/**
 * 把很长的逐字稿切成几段，每段不超过 max 字、长度差不多。
 * 优先在空行切，其次在换行，最后才硬切（一行就超过 max 的时候）。
 */
export function splitTalk(text, max = TALK_SPLIT_CHARS) {
  const t = String(text || '').trim();
  if (t.length <= max) return t ? [t] : [];
  const n = Math.ceil(t.length / max);
  const target = Math.ceil(t.length / n);
  const out = [];
  let rest = t;
  while (rest.length > max) {
    // 在 target 附近（往前最多找到一半）找空行，再找换行
    const lo = Math.floor(target / 2);
    const win = rest.slice(0, Math.min(max, target + Math.floor(target / 5)));
    let cut = win.lastIndexOf('\n\n');
    if (cut < lo) cut = win.lastIndexOf('\n');
    if (cut < lo) cut = Math.min(max, target);
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/* ---------- WhatsApp .txt ---------- */
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
// [17/11/2026, 10:23:45 AM] 名字: 讯息      ← iPhone
// 17/11/2026, 10:23 - 名字: 讯息            ← Android
// [2026/11/17 下午3:05:09] 名字: 讯息       ← 中文 iPhone
const HEADER = new RegExp(
  '^\\[?' +
  '(\\d{1,4})[/.\\-](\\d{1,2})[/.\\-](\\d{1,4})' + // 日期
  '[,，]?\\s*' +
  '(上午|下午|中午|晚上|凌晨)?\\s*' +
  '(\\d{1,2}):(\\d{2})(?::(\\d{2}))?' + // 时间
  '\\s*([AaPp]\\.?\\s?[Mm]\\.?)?' + // AM / PM
  '\\]?\\s*(?:[-–]\\s*)?' +
  '(.*)$',
);
const MEDIA = /^(?:<media omitted>|<附件已忽略>|<已忽略媒体>|<attached: .*>|(?:image|video|audio|sticker|gif|document|photo) omitted|图片已忽略|视频已忽略|音频已忽略|贴图已忽略|.*\.(?:jpg|jpeg|png|webp|mp4|opus|pdf) \(file attached\))$/i;
const SYSTEM_TEXT = /end-to-end encrypted|端到端加密|端對端加密|disappearing messages|限时消息/i;
const DELETED = /^(?:this message was deleted|you deleted this message|此消息已删除|你删除了此消息|此訊息已刪除)$/i;

function fixYear(y) { return y < 100 ? 2000 + y : y; }

/** 看整份档案决定日期是 日/月/年、月/日/年 还是 年/月/日 */
function detectOrder(rows) {
  let dmy = false;
  let mdy = false;
  for (const r of rows) {
    if (r.a > 31) return 'ymd';
    if (r.a > 12) dmy = true;
    if (r.b > 12) mdy = true;
  }
  if (mdy && !dmy) return 'mdy';
  return 'dmy'; // 马来西亚默认
}

function toDate(r, order) {
  let y; let mo; let d;
  if (order === 'ymd') { y = r.a; mo = r.b; d = r.c; } else if (order === 'mdy') { mo = r.a; d = r.b; y = fixYear(r.c); } else { d = r.a; mo = r.b; y = fixYear(r.c); }
  let h = r.h;
  const ap = (r.ampm || '').toLowerCase().replace(/[.\s]/g, '');
  if (ap === 'pm' || ['下午', '晚上'].includes(r.zh)) { if (h < 12) h += 12; } else if ((ap === 'am' || ['上午', '凌晨'].includes(r.zh)) && h === 12) h = 0;
  if (r.zh === '中午' && h < 11) h += 12;
  const dt = new Date(y, mo - 1, d, h, r.mi, r.s || 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * 解析 WhatsApp 汇出的文字。
 * 回 { messages: [{at: Date, sender, text, media}], participants: [{name, count}], order }
 * 系统讯息（加密提示、某某加入群组）不算。
 */
export function parseWhatsApp(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const rows = [];
  for (const line0 of lines) {
    const line = line0.replace(INVISIBLE, '');
    const m = HEADER.exec(line);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 31) {
      const rest = m[9];
      const i = rest.indexOf(': ');
      if (i <= 0 || i > 80) { rows.push({ system: true }); continue; } // 系统讯息
      rows.push({
        a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), zh: m[4] || '', h: Number(m[5]), mi: Number(m[6]), s: Number(m[7] || 0), ampm: m[8] || '',
        sender: rest.slice(0, i).trim(), text: rest.slice(i + 2),
      });
    } else if (rows.length && !rows[rows.length - 1].system) {
      rows[rows.length - 1].text += `\n${line}`; // 多行讯息
    }
  }
  const real = rows.filter((r) => !r.system);
  const order = detectOrder(real);
  const messages = [];
  const counts = new Map();
  for (const r of real) {
    const at = toDate(r, order);
    if (!at) continue;
    let text = r.text.replace(/\s*<(?:This message was edited|已编辑此消息|已編輯此訊息)>\s*$/i, '').trim();
    if (DELETED.test(text) || SYSTEM_TEXT.test(text)) continue;
    const media = MEDIA.test(text);
    if (media) text = '[媒体]';
    if (!text) continue;
    messages.push({ at, sender: r.sender, text, media });
    counts.set(r.sender, (counts.get(r.sender) || 0) + 1);
  }
  const participants = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count);
  return { messages, participants, order };
}

/** 从档名猜对方名字：「WhatsApp Chat with Tan.txt」「WhatsApp Chat - Tan.zip」「与Tan的 WhatsApp 聊天.txt」 */
export function nameFromWhatsAppFile(filename) {
  const base = String(filename || '').replace(/\.(txt|zip)$/i, '').trim();
  let m = /whatsapp\s+chat\s*(?:with|-|–)\s*(.+)$/i.exec(base);
  if (m) return m[1].trim();
  m = /^与\s*(.+?)\s*的\s*whatsapp/i.exec(base) || /^和\s*(.+?)\s*的\s*whatsapp/i.exec(base);
  if (m) return m[1].trim();
  m = /whatsapp\s*(?:聊天|對話|对话)\s*[-–]?\s*(.+)$/i.exec(base);
  if (m) return m[1].trim();
  return '';
}

/** 参与者里哪个最像这个人（名字 / 另一种写法互相包含） */
export function matchParticipant(participants, person) {
  if (!person) return '';
  const keys = [normName(person.name), normName(person.name_alt)].filter((k) => k && k.length >= 2);
  const hit = participants.find((p) => {
    const n = normName(p.name);
    return n && keys.some((k) => n === k || n.includes(k) || k.includes(n));
  });
  return hit ? hit.name : '';
}

/** 档名 / 参与者 → 人脉里可能是谁 */
export function suggestPeople(people, names) {
  const keys = names.map(normName).filter((k) => k && k.length >= 2);
  if (!keys.length) return [];
  return people.filter((p) => {
    const pn = [normName(p.name), normName(p.name_alt)].filter((k) => k && k.length >= 2);
    return pn.some((a) => keys.some((b) => a === b || a.includes(b) || b.includes(a)));
  }).slice(0, 3);
}

const pad = (n) => String(n).padStart(2, '0');
export function fmtStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 挑要送 AI 的讯息：from 之后（不含），从最新往回拿到 maxChars 为止。
 * meName 的讯息显示成「我」，方便 AI 分清楚。
 * 回 { text, count, total, first, last, truncated }
 */
export function selectWhatsApp(messages, { from = null, meName = '', maxChars = MAX_TALK_CHARS } = {}) {
  const inRange = from ? messages.filter((m) => m.at > from) : messages.slice();
  const out = [];
  let size = 0;
  for (let i = inRange.length - 1; i >= 0; i--) {
    const m = inRange[i];
    const who = meName && m.sender === meName ? '我' : m.sender;
    const line = `${fmtStamp(m.at)} ${who}: ${m.text}`;
    if (size + line.length + 1 > maxChars && out.length) break;
    out.push(line);
    size += line.length + 1;
  }
  out.reverse();
  const kept = inRange.slice(inRange.length - out.length);
  return {
    text: out.join('\n'),
    count: out.length,
    total: inRange.length,
    first: kept.length ? kept[0].at : null,
    last: kept.length ? kept[kept.length - 1].at : null,
    truncated: out.length < inRange.length,
  };
}

/* ---------- Plaud .srt / .vtt ---------- */
const CUE_TIME = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?.*$/;
/** 字幕档 → 纯文字（同一个讲者连续的句子接在一起）；普通文字原样回 */
export function cleanTranscript(raw, filename = '') {
  const text = String(raw || '').replace(/\r\n?/g, '\n').replace(INVISIBLE, '');
  const isSub = /\.(srt|vtt)$/i.test(filename) || /^WEBVTT/.test(text) || /\n?\d+\n\s*\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(text);
  if (!isSub) return text.trim();
  const out = [];
  let lastSpeaker = '';
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || /^WEBVTT/.test(l) || /^\d+$/.test(l) || CUE_TIME.test(l) || /^(NOTE|STYLE|REGION)\b/.test(l)) continue;
    const clean = l.replace(/<[^>]+>/g, '');
    const sp = /^([^:：\s][^:：]{0,29})[:：]\s*/.exec(clean);
    if (sp) {
      const body = clean.slice(sp[0].length);
      if (out.length && lastSpeaker === sp[1]) out[out.length - 1] += ` ${body}`;
      else out.push(`${sp[1]}: ${body}`);
      lastSpeaker = sp[1];
    } else if (lastSpeaker && out.length) {
      out[out.length - 1] += ` ${clean}`; // 同一个讲者的下一句
    } else {
      out.push(clean);
    }
  }
  return out.join('\n').trim();
}

/* ---------- 分析结果 ---------- */
/** 一个人所有对话里「还没做的承诺」：[{interaction, index, item}]，最新的在前 */
export function openPromises(interactions = []) {
  const out = [];
  for (const it of interactions) {
    const items = (it.ai && Array.isArray(it.ai.action_items)) ? it.ai.action_items : [];
    items.forEach((item, index) => { if (item && item.what && !item.done) out.push({ interaction: it, index, item }); });
  }
  return out.sort((a, b) => String(b.interaction.occurred_at).localeCompare(String(a.interaction.occurred_at)));
}

/** 字串清单合并去重（不分大小写，保留原本顺序） */
export function mergeList(base = [], add = []) {
  const seen = new Set(base.map((x) => String(x).trim().toLowerCase()));
  const out = base.slice();
  for (const x of add) {
    const v = String(x || '').trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out;
}

/** 把「他的近况 / 家人 / 喜好」接到备注后面，同一句不重复 */
export function appendFacts(notes, facts = [], date = '') {
  const have = String(notes || '');
  const fresh = facts.map((f) => String(f || '').trim()).filter((f) => f && !have.includes(f));
  if (!fresh.length) return have;
  const block = `【${date}】${fresh.join('；')}`;
  return have.trim() ? `${have.trim()}\n${block}` : block;
}

export const MOODS = {
  warm: { label: '很热络', color: '#16A34A' },
  positive: { label: '愉快', color: '#65A30D' },
  neutral: { label: '普通', color: '#A39B8E' },
  cool: { label: '有点冷淡', color: '#CA8A04' },
  negative: { label: '不太好', color: '#B91C1C' },
};

/** 大概要花多少（RM）：Haiku 一个中文字 ≈ 1 token，一张截图 ≈ 1600 token，输出 ≈ 1500 token */
export function estimateTalkMyr(chars = 0, images = 0, rate = 4.4) {
  const inTok = chars * 1.0 + images * 1600 + 1500;
  const outTok = 1500 + images * 800;
  return ((inTok * 0.10 + outTok * 0.50) / 1e6) * rate;
}
