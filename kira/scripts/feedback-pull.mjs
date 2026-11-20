// 把业务按 👎 的 AI 识图反馈拉下来，变成重跑用的测试资料
//   KIRA_FEEDBACK_SUPABASE_URL=… KIRA_FEEDBACK_SERVICE_KEY=… node scripts/feedback-pull.mjs [--since 2026-11-01] [--images]
// → test/fixtures/ai-feedback/fb-<id>.json（AI 结果 + 户型图大小 / 比例 + 被 👎 的建议 + 原因）
//   --images：图存到 test/out/ai-feedback/（不进 git —— 客户的户型图是私人资料，仓库是公开的）
// 拉下来后看一眼，把规则抓得到的那几笔设 "expect": "unpicked"，test/aiFeedback.test.mjs 就会一直检查它们。
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = String(process.env.KIRA_FEEDBACK_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.KIRA_FEEDBACK_SERVICE_KEY;
if (!url || !key) { console.error('Set KIRA_FEEDBACK_SUPABASE_URL and KIRA_FEEDBACK_SERVICE_KEY'); process.exit(1); }
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const since = arg('--since');
const wantImages = process.argv.includes('--images');
const auth = { apikey: key, Authorization: `Bearer ${key}` };

const q = new URLSearchParams({ select: '*', kind: 'in.(bad,missing)', order: 'created_at.desc' });
if (since) q.append('created_at', `gte.${since}`);
const res = await fetch(`${url}/rest/v1/kira_ai_feedback?${q}`, { headers: auth });
if (!res.ok) { console.error('Fetch failed', res.status, await res.text()); process.exit(1); }
const rows = await res.json();

// 同一次识图的图：在第一笔（有 image_path 的那笔）
const imageOf = new Map();
rows.forEach((r) => { if (r.image_path) imageOf.set(r.read_id, r.image_path); });

const dir = path.join(here, '..', 'test', 'fixtures', 'ai-feedback');
const imgDir = path.join(here, '..', 'test', 'out', 'ai-feedback');
mkdirSync(dir, { recursive: true });
if (wantImages) mkdirSync(imgDir, { recursive: true });
const counts = {};
let n = 0;
for (const r of rows) {
  (r.reasons?.length ? r.reasons : [r.kind]).forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
  const file = path.join(dir, `fb-${r.id}.json`);
  if (existsSync(file)) continue; // 已经拉过（可能手动设了 expect）：不盖掉
  writeFileSync(file, `${JSON.stringify({ id: r.id, created_at: r.created_at, kind: r.kind, reasons: r.reasons, note: r.note, template: r.template, suggestion: r.suggestion, ai: r.ai, expect: null }, null, 2)}\n`);
  n += 1;
  const img = imageOf.get(r.read_id);
  if (wantImages && img && !existsSync(path.join(imgDir, img))) {
    const im = await fetch(`${url}/storage/v1/object/authenticated/kira-ai-feedback/${img}`, { headers: auth });
    if (im.ok) writeFileSync(path.join(imgDir, img), Buffer.from(await im.arrayBuffer()));
  }
}
console.log(`${rows.length} feedback rows, ${n} new fixtures → ${path.relative(process.cwd(), dir)}`);
console.log('Most common reasons 最常见的原因:', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ') || '—');
