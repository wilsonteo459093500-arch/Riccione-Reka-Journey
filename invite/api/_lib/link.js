/* ============================================================
   签名链接（VISI 体检第 2c 阶段）
   ------------------------------------------------------------
   邀请函 / 需求卡链接里「销售的名字、职称、WhatsApp、留言」谁都能改（repo 是公开的，
   看得到参数怎么写）。所以这几样要有伺服器的签名才算数：
     - 销售登入（团队密码，跟案例库同一个）后，VISI / 销售端向 POST /api/link 要签名
     - 邀请函 / 需求卡打开时向 GET /api/link 问「这个签名对不对」，不对 → 退回公司预设（config.js 的 host）
   签名只盖这四样（用户 2026-11-20 定的）：客户名字、日期、时间不签，手改照样能用。

   sig = base64url(HMAC-SHA256(key, JSON['v1', by, role, wa, note])) 前 22 个字（约 131 bit）
   key = HMAC(SECRET, 'visi-link-v1')：不含团队密码 —— 老板换密码，已经发出去的链接照样有效。
   换 SESSION_SECRET 会让所有发出去的签名失效（链接退回公司预设）。

   先把字整理成固定的样子（canonical）再签 / 验：去控制字元、空白合并、剪长度、号码只留数字。
   回给前端的也是整理过的字，链接就用它们 —— 签的跟印的永远是同一份。
   ============================================================ */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { secret } from './auth.js';

export const LINK_MAX = { by: 40, role: 60, note: 500 };
export const SIG_LEN = 22;

function codePoints(s, max) {
  var a = Array.from(s);
  return a.length > max ? a.slice(0, max).join('').trim() : s;
}

// 一行字：去掉控制字元（含双向文字控制、换行），空白合并
function line(v, max) {
  if (typeof v !== 'string') return '';
  var t = v.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return codePoints(t, max);
}

// 留言：可以换行（最多连续两个），其它控制字元拿掉
function para(v, max) {
  if (typeof v !== 'string') return '';
  var t = v.normalize('NFC').replace(/\r\n?/g, '\n')
    .replace(/[\p{Zl}\p{Zp}]/gu, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/(?!\n)[\p{Cc}\p{Cf}]/gu, '')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return codePoints(t, max);
}

// WhatsApp：只留数字，8–15 位（国际格式）；不对就当没填
function phone(v) {
  var d = String(typeof v === 'string' || typeof v === 'number' ? v : '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : '';
}

/** 整理成签名用的固定样子 */
export function linkFields(o) {
  o = o && typeof o === 'object' ? o : {};
  return { by: line(o.by, LINK_MAX.by), role: line(o.role, LINK_MAX.role), wa: phone(o.wa), note: para(o.note, LINK_MAX.note) };
}

function key() { return createHmac('sha256', secret()).update('visi-link-v1').digest(); }

/** f 要先经过 linkFields */
export function linkSig(f) {
  var payload = JSON.stringify(['v1', f.by, f.role, f.wa, f.note]);
  return createHmac('sha256', key()).update(payload).digest('base64url').slice(0, SIG_LEN);
}

/** 原样拿到的字 + 签名 → 对的话回整理过的字，不对回 null */
export function checkLink(raw, sig) {
  if (typeof sig !== 'string' || sig.length !== SIG_LEN) return null;
  var f = linkFields(raw);
  var got = Buffer.from(sig), want = Buffer.from(linkSig(f));
  return got.length === want.length && timingSafeEqual(got, want) ? f : null;
}
