// =====================================================================
// PUMM ROUNDTABLE — 提醒自动发送（Supabase Edge Function）
//
// 每天跑一次：把 App 里「提醒」页算出来的那批讯息，直接经
// WhatsApp Cloud API 发到会员手机上。桌长从此不用复制粘贴。
//
// 提醒规则与 /src/utils.js 的 buildReminders 保持一致（五条规则）。
// 这里是 Deno 环境、直接查表，所以是一份独立实现 ——
// ⚠️ 改规则时两边都要改（有 npm test 盯着 src 那份）。
//
// 需要的 Secrets（supabase secrets set KEY=value）：
//   WHATSAPP_TOKEN     Meta WhatsApp Cloud API 的永久 token
//   WHATSAPP_PHONE_ID  发送方号码的 Phone Number ID
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入。
//
// ⚠️ WhatsApp 的规矩：企业主动发起的对话必须用「已审核的模板」，
// 自由文本只能发给 24 小时内主动找过你的人。最省事的做法：
// 让会员先把桌长的这个号码存起来、发一句「hi」入群 ——
// 或者在 Meta 后台把下面 body 的格式申请成一个 utility 模板。
// 发送失败（例如超出 24h 窗口）会记在函数日志里，不会静默丢。
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

type Row = { data: Record<string, any> };

const CN_WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function todayISO(): string {
  // 提醒按马来西亚时间（UTC+8）的「今天」算，不用服务器的 UTC 日期
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string, from: string): number | null {
  if (!dateStr) return null;
  return Math.round((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")} 周${CN_WEEK[d.getUTCDay()]}`;
}

/** 马来西亚号码 → E.164（012-345 6789 → 60123456789） */
function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  return digits;
}

const isDirector = (m: any) => m.role === "director";
const isSeated = (m: any) =>
  m.status === "active" && !isDirector(m) && m.feeStatus === "paid" && m.ndaSigned;

Deno.serve(async (req) => {
  // 只接受带 service key 的调用（pg_cron 或手动 curl），不开放给公网
  const auth = req.headers.get("Authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!auth.includes(serviceKey)) {
    return new Response("unauthorized", { status: 401 });
  }

  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) {
    return new Response("WHATSAPP_TOKEN / WHATSAPP_PHONE_ID 还没设置（supabase secrets set）", { status: 500 });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const [membersQ, sessionsQ, casesQ, commitmentsQ] = await Promise.all([
    db.from("members").select("data"),
    db.from("sessions").select("data"),
    db.from("cases").select("data"),
    db.from("commitments").select("data"),
  ]);
  const members = ((membersQ.data || []) as Row[]).map((r) => r.data);
  const sessions = ((sessionsQ.data || []) as Row[]).map((r) => r.data);
  const cases = ((casesQ.data || []) as Row[]).map((r) => r.data);
  const commitments = ((commitmentsQ.data || []) as Row[]).map((r) => r.data);

  const today = todayISO();
  const seated = members.filter(isSeated);
  const chairs = members.filter((m) => m.status === "active" && m.role === "chair");
  const recorders = members.filter((m) => m.status === "active" && m.role === "recorder");
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "（会员）";

  // 待发清单：{ to: member, text }
  const outbox: { to: any; text: string; kind: string }[] = [];
  const broadcast = (targets: any[], text: string, kind: string) =>
    targets.forEach((m) => outbox.push({ to: m, text, kind }));

  // 1) 会前 7 天 / 1 天 → 全体在桌会员
  for (const s of sessions.filter((x) => x.status === "scheduled")) {
    const d = daysUntil(s.date, today);
    if (d === 7 || d === 1) {
      broadcast(
        seated,
        `【PUMM ROUNDTABLE】提醒：${fmtDate(s.date)} 我们这个月的桌聚。请回复「到」或「请假」。\n开场第一件事是承诺复盘，请先想好上个月那件事做到了没有。`,
        "attendance-confirm",
      );
    }
  }

  // 2) 会后 Case Record 未填 → 记录员
  for (const s of sessions.filter((x) => x.status !== "scheduled")) {
    const d = daysUntil(s.date, today);
    if (d === null || d > 0) continue;
    const missing = (s.presenterIds || []).filter(
      (pid: string) => !cases.some((c) => c.sessionId === s.id && c.presenterId === pid && (c.problemStatement || "").trim()),
    );
    if (missing.length > 0 && d >= -3) {          // 只追 3 天，别永远轰炸
      broadcast(
        recorders,
        `【PUMM】${fmtDate(s.date)} 那场的 Case Record 还没填完（${missing.map(nameOf).join("、")}）。麻烦今天补上，留证是 TABLE 的最后一步。`,
        "case-missing",
      );
    }
  }

  // 3) 承诺到期前 3 天（含当天与逾期 7 天内）→ 案主本人
  for (const c of commitments.filter((x) => x.status === "open")) {
    const d = daysUntil(c.dueDate, today);
    if (d === null || d > 3 || d < -7) continue;
    const m = members.find((x) => x.id === c.memberId);
    if (m) {
      outbox.push({
        to: m,
        text: `【PUMM】${m.name}，你在上一场锁的这件事 ${fmtDate(c.dueDate)} 到期：\n「${c.content}」\n下一场开场第一件事就是查这个。做完了吗？`,
        kind: "commitment-due",
      });
    }
  }

  // 4) 无故缺席第 2 次 → 桌长
  for (const m of members.filter((x) => x.status === "active" && !isDirector(x))) {
    const absences = sessions.filter(
      (s) => s.status === "closed" && s.attendance?.[m.id] === "absent",
    ).length;
    if (absences >= 2) {
      broadcast(
        chairs,
        `【PUMM 内部】${m.name} 已累计 ${absences} 次无故缺席，按桌规该出局。桌长请决定：谈一次，还是执行出局。`,
        "absence-risk",
      );
    }
  }

  // 5) 年费到期前 30 天 → 会员本人
  for (const m of members.filter((x) => x.status === "active" && !isDirector(x) && x.feeDueDate)) {
    const d = daysUntil(m.feeDueDate, today);
    if (d !== null && d <= 30 && d >= 0 && m.renewalStatus !== "renewed" && d % 7 === 0) {
      // 每 7 天提一次，不是 30 天里天天轰炸
      outbox.push({
        to: m,
        text: `【PUMM】${m.name}，你这一年的桌位 ${fmtDate(m.feeDueDate)} 到期。续会名额我先给你留着，这周给我个准话就行。`,
        kind: "fee-renewal",
      });
    }
  }

  // ---- 发送 ----
  const results: { name: string; kind: string; ok: boolean; detail?: string }[] = [];
  for (const item of outbox) {
    const phone = normalizePhone(item.to.phone);
    if (!phone) {
      results.push({ name: item.to.name, kind: item.kind, ok: false, detail: "没有电话号码" });
      continue;
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: item.text },
        }),
      });
      const body = await res.text();
      results.push({ name: item.to.name, kind: item.kind, ok: res.ok, detail: res.ok ? undefined : body.slice(0, 300) });
    } catch (e) {
      results.push({ name: item.to.name, kind: item.kind, ok: false, detail: String(e) });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  console.log(`send-reminders: ${sent}/${results.length} 发送成功`, JSON.stringify(results));
  return new Response(JSON.stringify({ date: today, total: results.length, sent, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
