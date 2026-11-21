/* ============================================================
   人脉 App · 从汇出的 JSON 补回资料（体检第 3 阶段）
   ------------------------------------------------------------
   只「补回不见的」：备份里有、现在没有的那几笔才写回去。
   现在有的一律不动（不会把今天改的盖回旧的），所以按错了也不会坏事。
   备份里没有的：照片本身（只有路径；照片还在云端就看得到）、公开页的留资料记录、好感度历史。
   ============================================================ */

/** 写回去的顺序：被指到的先写（公司 → 人 → 互动……） */
export const RESTORE_ORDER = [
  'profile', 'companies', 'circles', 'events', 'photos', 'people',
  'person_circles', 'resources', 'interactions', 'attendance', 'photo_people', 'ai_usage',
];

/** 每张表指向别的表的栏位：[栏位, 指向的表, 必填?] —— 指的东西不在就（必填）跳过 /（选填）清空 */
const REFS = {
  people: [['company_id', 'companies', false]],
  events: [['circle_id', 'circles', false]],
  photos: [['event_id', 'events', false]],
  person_circles: [['person_id', 'people', true], ['circle_id', 'circles', true]],
  resources: [['person_id', 'people', true]],
  interactions: [['person_id', 'people', true]],
  attendance: [['event_id', 'events', true], ['person_id', 'people', true]],
  photo_people: [['photo_id', 'photos', true], ['person_id', 'people', true]],
};

export class BackupError extends Error {}

/** 读汇出的档案 → 检查是不是 SPACE 的备份 */
export function parseBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new BackupError('读不懂这个档案（不是 JSON）'); }
  if (!j || typeof j !== 'object' || !Array.isArray(j.people)) throw new BackupError('这不是 SPACE 汇出的备份（找不到「人」）');
  return j;
}

/**
 * 算出要补回哪些
 * @returns {{ plan: Array<[table, rows]>, counts: Record<table, number>, skipped: number }}
 */
export function planRestore(backup, current) {
  const have = Object.fromEntries(RESTORE_ORDER.map((t) => [t, new Set((current[t] || []).map((r) => r.id))]));
  const plan = [];
  const counts = {};
  let skipped = 0;
  for (const t of RESTORE_ORDER) {
    const rows = Array.isArray(backup[t]) ? backup[t] : [];
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object' || !r.id || have[t].has(r.id)) continue;
      if (t === 'profile' && (current.profile || []).length) continue; // 一个人只有一份「我的资料」
      const { owner, ...row } = r; // owner 由资料库填（换了帐号也能补）
      let ok = true;
      for (const [col, ref, required] of REFS[t] || []) {
        if (row[col] && !have[ref].has(row[col])) {
          if (required) { ok = false; break; }
          row[col] = null;
        }
      }
      if (!ok) { skipped += 1; continue; }
      out.push(row);
      have[t].add(row.id); // 后面的表可以指到它
    }
    if (out.length) { plan.push([t, out]); counts[t] = out.length; }
  }
  return { plan, counts, skipped };
}
