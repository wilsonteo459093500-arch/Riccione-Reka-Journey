export const meta = {
  name: 'app-checkup',
  description: '软件体检：多个方向同时查一个 app，每个发现再由另一位「怀疑者」反驳核实',
  whenToUse: '由 app-checkup skill 呼叫；args 的栏位见 SKILL.md「第 2 步」',
  phases: [
    { title: '体检', detail: '安全、AI、资料与运维、核心逻辑、实际操作、公开页面、产品缺口' },
    { title: '核实', detail: '每个方向一位怀疑者：逐条尝试推翻，再补漏' },
  ],
}

/* ------------------------------------------------------------------
   args（由主对话摸底之后填；都是真的 JSON，不要包成字串）
     root      repo 的绝对路径
     app       要体检的 app 资料夹（绝对路径）
     name      app 的名字（给人看的）
     about     一段话：这个 app 是什么、谁在用、怎么用、有什么限制（预算、设备…）
     facts     [字串]：主对话已经核实过的事实（测试结果、构建大小、线上状态、真实用量…）
     scratch   放临时脚本 / 截图的资料夹（绝对路径，在 repo 外面）
     hasAI     有没有呼叫 AI（false 就跳过 AI 方向）
     runNotes  怎么在本机跑起来、怎么登入、怎么塞样例资料（没法跑就留空 → 跳过「实际操作」）
     publicNotes 有没有给外人看的公开页面、怎么打开（没有就留空 → 跳过「公开页面」）
     hints     { security, ai, dataops, logic, uxapp, uxpublic, product }：每个方向要先读哪些档案、特别要查什么
     skip      [方向 key]：这次不查的方向
     only      [方向 key]：只查这几个方向。一个 Workflow 一次只同时跑「CPU 数 − 2」个人（云端机器 4 核 = 2 个），
               所以主对话要把七个方向拆成 3–4 组、在同一则讯息里同时开 3–4 个 Workflow（各带不同的 only），见 SKILL.md 第 2 步
     model     体检的人用哪个 model（'opus' / 'sonnet'…）。不填 = 跟主对话一样。
               主对话用 Fable 时建议填 'opus'：十几个人同时用 Fable，很快就撞到帐号的 5 小时用量上限
     effort / verifyEffort   体检的人、怀疑者各自的 effort（不填 = 跟主对话一样；建议 'high' / 'medium'）
     verify    false = 不派怀疑者（省量版的默认做法）：体检的人把证明脚本留在 scratch，主对话自己重跑来核实
     dryRun    true = 不派人，只回传每个方向的任务说明（检查 args 用）
   ------------------------------------------------------------------ */
const A = args || {}
for (const k of ['root', 'app', 'name', 'about', 'scratch']) {
  if (!A[k] || typeof A[k] !== 'string') throw new Error(`app-checkup: args.${k} 没填（见 SKILL.md 第 2 步）`)
}
const hints = A.hints || {}
const skip = new Set(A.skip || [])
const facts = (A.facts || []).map((f) => `- ${f}`).join('\n') || '- (none supplied)'

const COMMON = `
You are part of a review team auditing "${A.name}" (code in ${A.app}, inside the repository ${A.root}).

About the app and its owner (the owner does NOT write code — judge everything by what it means for them):
${A.about}

Read the app's README / PLAN / DEPLOY documents first if they exist.

Facts the lead already verified (use them, do not spend time re-verifying):
${facts}

Hard rules:
- READ-ONLY review. Do not modify, create or delete any file inside ${A.root} (no edits, no git commit or push, no installs that change lockfiles). Put every temporary script, screenshot or build output under your own scratch folder (given below); create it with mkdir -p.
- Never touch production data. Do not read personal records from a live database. Do not read secret values.
- Every finding needs evidence: file:line references, or reproducible steps / a script with the observed output. No evidence -> do not report it (or mark confidence "low" and say what is unverified).
- Things the app's own documents list as "not done yet / maybe later" are known gaps, not bugs: report them only as kind "gap" and say the plan already knows.
- Report the 5–12 most valuable findings for this owner, most severe first. Also list 2–5 genuine strengths.
- Language: "title" and "user_impact" in Simplified Chinese, in plain words a non-programmer boss understands (what goes wrong for them, when, how bad). "evidence" and "fix_idea" may be technical. Keep each field concise.
- Severity: critical = data leak / data loss / runaway cost / app unusable; high = a main flow breaks or a real risk likely to bite; medium = poor experience or edge case; low = polish.
- effort = size of the fix: S (under an hour of agent work), M (one focused session), L (several sessions).
- ids: your dimension prefix plus a number, e.g. SEC-1.
`

const PLAYWRIGHT = `Drive the app with Playwright: require('playwright') works from any directory and chromium.launch() needs no options. Use viewport 390x844 (phone: isMobile, hasTouch) and 1440x900 (desktop), deviceScaleFactor 1. Save screenshots in your scratch folder and LOOK at them (Read tool). This machine renders Chinese with a bitmap font (unifont) — ignore how the Chinese typeface looks. Record console errors and failed requests. Use the port given below (--strictPort) and stop the dev server when you are done.`

const ALL = [
  {
    key: 'security', prefix: 'SEC', label: '安全与隐私', port: 0,
    brief: `Dimension: SECURITY & PRIVACY.
Find and read: every server endpoint (api/, functions/, server/), auth / session code, database schema and access rules (RLS policies, storage bucket policies), deployment config (security headers), every place user-supplied or third-party data reaches the DOM or a URL, and upload handling.
Answer with evidence:
- Can a stranger read or write the owner's data by any path (public endpoints, admin / service keys, access rules, public storage)?
- Abuse of public endpoints: rate limits (how is the client identified, where are counters kept, can they be bypassed), spam filling the database or storage, strangers triggering paid calls.
- Injection: stored XSS, javascript: links, innerHTML / dangerouslySetInnerHTML, file-format injection (vCard, CSV), open redirects.
- Account security: who can sign up or log in, owner checks that are optional, password policy, tokens kept in the browser.
- Personal-data duties for third parties' data (PDPA in Malaysia): consent record, privacy notice, deletion path, retention, personal data in logs.
- Hardening gaps: CSP, bot protection, upload validation, secrets accidentally committed (grep for key-like strings).`,
  },
  {
    key: 'ai', prefix: 'AI', label: 'AI 调用、费用与等待体验', port: 0, needsAI: true,
    brief: `Dimension: AI CALLS — correctness, cost, latency and waiting experience.
Find and read: every place that calls a model, the shared AI client / cost / budget code, the browser code that calls those endpoints and records usage, the screens shown while AI works, function time limits in the deploy config, and the installed SDK in node_modules when you need to confirm a shape.
If the Skill tool is available, load the skill "claude-api" first: it is the authoritative reference for current model ids, prices and request shapes — do not rely on memory for any of those.
Answer with evidence:
- Will any request be rejected or misbehave with the models it names (deprecated parameters, thinking / effort / tool_choice / sampling rules, structured-output shape, server-tool versions, stop reasons such as refusal, max_tokens and pause_turn)?
- Time: client timeout x retries versus the platform's function limit — what does the user get when a function is killed? Estimate realistic durations per feature.
- Waiting experience: what is on screen during each AI call (spinner only? stage text, elapsed or remaining time, cancel)? Where would staged progress or streaming really help, what is the cheapest way, how much effort?
- Budget integrity: who records usage and when; what if the tab closes or the insert fails; does the budget check fail open; do public / anonymous paths spend the owner's budget; is the price table right (thinking tokens, tool fees)?
- Cost per action in the owner's currency and what the monthly budget buys.
- Prompt-injection robustness for untrusted input (uploads, transcripts, web pages).
- Guardrails: sources kept? Anything the AI writes that enters the record without the owner confirming it?`,
  },
  {
    key: 'dataops', prefix: 'OPS', label: '资料可靠性、上线与维护', port: 0,
    brief: `Dimension: DATA RELIABILITY, DEPLOYMENT & MAINTAINABILITY.
Find and read: the data layer (repository / store / client setup), service-worker or PWA config, database schema and migration approach, export / import / backup code, deploy documents and config, package.json, tests, CI config.
If the facts above name a hosting project or database project, use read-only tools (load them with ToolSearch) to check: state and commit of the current PRODUCTION deployment versus the repository's main branch, why any recent deployments failed, which environment variable NAMES exist (never values), recent runtime errors, database advisors. Never write; never read personal rows.
Answer with evidence:
- Data-loss risks: failed writes versus what the screen shows, offline or bad network, stale app after a deploy.
- Several devices or people: can a stale screen overwrite newer data (full-row upserts, last write wins)? Any realtime or refresh?
- Unbounded growth or duplicate rows (compare row counts in the facts with what the code should produce).
- Backup and restore: what the export contains (files and photos too?), whether anything can be imported back; free-tier limits or pausing of the hosting / database and what the owner experiences then.
- Schema upgrades: how they are applied, whether they are idempotent and safe on a database that has data.
- Scaling to realistic volumes (10x today's data): load-everything-at-start patterns, large fields, caching.
- Session expiry and error surfaces; monitoring; CI; dependency health (npm audit --omit=dev, npm outdated — read-only); bundle size and what could be lazy-loaded.
- Maintainability hot spots (very large files, duplicated logic) and drift between the documents and the code.`,
  },
  {
    key: 'logic', prefix: 'LOG', label: '核心计算是否正确', port: 0,
    brief: `Dimension: CORE LOGIC CORRECTNESS (pure functions and business rules) and test coverage.
Find and read carefully: the modules holding business rules and calculations (often src/lib, src/utils, src/engine) and their tests.
Method: after reading, write small scripts in your scratch folder that import those modules (absolute paths) and probe edge cases. Report only bugs you reproduced, with the script output. Areas that usually hide bugs:
- Dates and time zones (the owner is in Malaysia, UTC+8): "today", due / overdue, month boundaries, midnight to 08:00 local time.
- Scores, rankings and thresholds: caps, decay, negative values, future-dated records, values flapping around a boundary.
- Parsing of real-world input: phone numbers, names in Chinese and English, pasted or exported files in several formats, ambiguous dates.
- Duplicate detection and merge rules (false merges, missed duplicates).
- Generated files (vCard, CSV, .ics, PDF, PPT): escaping, encoding, time zones.
- Validation rules: false positives on legitimate input.
Also list exported functions that have no test at all and say which are risky.`,
  },
  {
    key: 'uxapp', prefix: 'UX', label: '手机和电脑上实际用起来', port: 5181, needsRun: true,
    brief: `Dimension: REAL USE — run the app and walk through every main flow as the owner would.
${PLAYWRIGHT}
To see realistic screens: seed sample data the way the run notes describe (or through the app's own modules via page.evaluate), and mock slow / failing network calls with page.route — include a version delayed by 20–40 seconds to judge the waiting experience and an error version.
Judge as a busy non-technical user, often on a phone with one hand free: first-run experience with no data (does the app say what to do first?), number of taps to the most common jobs, clarity of each screen, empty / loading / error states, sense of progress while slow things run, recovery from mistakes (undo, delete, edit, duplicates), tap-target and text sizes on the phone, overflow or clipped layouts at 390px, keyboard covering inputs, desktop layout quality, consistent wording, dead ends with no way back, and anything that errors in the console.`,
  },
  {
    key: 'uxpublic', prefix: 'PUB', label: '给外人看的公开页面', port: 5182, needsPublic: true,
    brief: `Dimension: PUBLIC PAGES — what an outsider (customer, new contact) sees, usually on a phone over 4G.
${PLAYWRIGHT}
If useful, build once into your scratch folder to measure real payload (never write a build inside the repository). Mock backend calls with page.route where the local setup cannot answer them (success, validation error, slow network, offline).
Judge: total bytes and request count for the first screen and the whole page on a throttled connection (CDP Network.emulateNetworkConditions), image sizes versus displayed sizes, lazy loading, time until the key content and the main buttons are usable, any intro animation (can a visitor in a hurry skip it — is the skip obvious?), forms (required fields, error messages, keyboard types, autofill, consent wording, is typed data kept on failure?), the step after submitting, downloads on iPhone and Android, language switch, link previews when the URL is shared on WhatsApp (title, description, image; robots / noindex headers), accessibility (contrast, alt text, focus order, reduced motion, text scaling), desktop layout, page length before the main call to action, broken images and console errors.`,
  },
  {
    key: 'product', prefix: 'PROD', label: '产品缺口与下一步', port: 0,
    brief: `Dimension: PRODUCT GAPS — act as a product manager who is also a heavy user of this kind of tool. Judge the product against its own promise (README / PLAN) and against how the owner actually works.
Read the documents (including any "not done / maybe later" lists and unbuilt phases), then skim the screens and core modules to confirm what truly exists. For every "missing" claim, grep the code to make sure it is really missing and say whether the plan already lists it.
Use the real-usage facts above: if the app has many features but little data or use, treat that as the main problem. Consider:
- Getting existing data in quickly (imports, bulk capture) and the first-week experience.
- Habit loop: does the app only speak when opened? Reminders, digests, calendar / task integration, a weekly review ritual.
- Local context (Malaysia: languages, titles, festivals, WhatsApp-first communication).
- Whether each promised job is truly covered end to end.
- Finding and fixing: search, merge duplicates, undo / history, archive.
- Measuring: can the owner tell whether the tool is working for them?
- Trust in AI output: can they see why and correct it?
Say honestly what looks over-built for the actual use (maintenance cost with little benefit), and what should be tested with real data before building anything new.
For this dimension kind is usually "gap"; severity means value to the owner (critical = without this the app will not get used). Rank by value divided by effort.`,
  },
]

const only = A.only && A.only.length ? new Set(A.only) : null
const DIMENSIONS = ALL.filter((d) => {
  if (only && !only.has(d.key)) return false
  if (skip.has(d.key)) return false
  if (d.needsAI && A.hasAI === false) return false
  if (d.needsRun && !A.runNotes) return false
  if (d.needsPublic && !A.publicNotes) return false
  return true
})
const dropped = ALL.filter((d) => !DIMENSIONS.includes(d) && !(only && !only.has(d.key))).map((d) => d.label)
if (dropped.length) log(`这次不查：${dropped.join('、')}`)
if (!DIMENSIONS.length) throw new Error('app-checkup: 没有要查的方向（检查 only / skip / runNotes / publicNotes）')

function reviewPrompt(d) {
  let extra = ''
  if (d.needsRun) extra += `\nHow to run it locally (from the lead):\n${A.runNotes}\nYour port: ${d.port}\n`
  if (d.needsPublic) extra += `\nPublic pages and how to open them (from the lead):\n${A.publicNotes}\n${A.runNotes ? `How to run locally:\n${A.runNotes}\n` : ''}Your port: ${d.port}\n`
  if (hints[d.key]) extra += `\nApp-specific pointers from the lead (start here):\n${hints[d.key]}\n`
  return `${COMMON}\nYour scratch folder: ${A.scratch}/${d.key}\nYour id prefix: ${d.prefix}\n\n${d.brief}\n${extra}`
}

if (A.dryRun) {
  return { dryRun: true, dimensions: DIMENSIONS.map((d) => ({ key: d.key, label: d.label, prompt: reviewPrompt(d) })), dropped }
}

const FINDING = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    kind: { type: 'string', enum: ['bug', 'risk', 'ux', 'cost', 'gap', 'debt'] },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    evidence: { type: 'string' },
    user_impact: { type: 'string' },
    fix_idea: { type: 'string' },
    effort: { type: 'string', enum: ['S', 'M', 'L'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['id', 'title', 'kind', 'severity', 'evidence', 'user_impact', 'fix_idea', 'effort', 'confidence'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: FINDING },
    strengths: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['findings', 'strengths'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'partly', 'refuted'] },
          reason: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          correction: { type: 'string' },
        },
        required: ['id', 'verdict', 'reason', 'severity'],
      },
    },
    missed: { type: 'array', items: FINDING },
  },
  required: ['verdicts', 'missed'],
}

// 只在有填的时候才带 model / effort，没填就跟主对话一样
function opts(base, effort) {
  const o = { ...base }
  if (A.model) o.model = A.model
  if (effort) o.effort = effort
  return o
}

// pipeline：每个方向查完马上核实，不用等其它方向
const results = await pipeline(
  DIMENSIONS,
  (d) => agent(reviewPrompt(d), opts({ label: `体检:${d.label}`, phase: '体检', schema: FINDINGS_SCHEMA }, A.effort)),
  (review, d) => {
    if (!review || !review.findings || !review.findings.length) return { review, check: null }
    if (A.verify === false) return { review, check: null } // 省量版：不派怀疑者，由主对话自己重跑证明脚本核实
    const runs = d.needsRun || d.needsPublic
    return agent(
      `${COMMON}\nYour scratch folder: ${A.scratch}/${d.key}-verify\nYour id prefix for anything new: ${d.prefix}-V\n\n` +
      `You are the SKEPTIC for the dimension "${d.label}". Another reviewer produced the findings below. Try to REFUTE each one by independently reading the cited code or re-running the reproduction ` +
      `(the first reviewer's scripts and screenshots are in ${A.scratch}/${d.key}` +
      (runs ? `; if you need the app running, follow the run notes in the brief below but use port ${d.port + 10}` : '') + `).\n` +
      `Verdict per finding:\n- "confirmed": you verified it yourself and the severity is right.\n- "partly": the core is true but details or severity are off — give the corrected severity and put the fix in "correction".\n- "refuted": the evidence does not hold, the code already handles it, or it is a documented deliberate decision. If you cannot verify it, it is refuted.\n` +
      `Be concrete in "reason" (file:line or what you ran). "severity" is your corrected severity.\n` +
      `Then, as a completeness check, add up to 3 important issues in this dimension that the reviewer MISSED — only ones you verified with evidence — in "missed" (same shape as findings; title and user_impact in Simplified Chinese).\n\n` +
      `Original brief (for scope):\n${reviewPrompt(d)}\n\nFindings to challenge (JSON):\n${JSON.stringify(review.findings, null, 1)}`,
      opts({ label: `核实:${d.label}`, phase: '核实', schema: VERDICT_SCHEMA }, A.verifyEffort || A.effort),
    ).then((check) => ({ review, check }))
  },
)

const out = DIMENSIONS.map((d, i) => {
  const r = results[i]
  if (!r || !r.review) return { key: d.key, label: d.label, failed: true }
  const byId = {}
  for (const v of (r.check && r.check.verdicts) || []) byId[v.id] = v
  return {
    key: d.key,
    label: d.label,
    strengths: r.review.strengths,
    notes: r.review.notes || '',
    verified: !!r.check,
    findings: r.review.findings.map((f) => ({ ...f, check: byId[f.id] || null })),
    missed: (r.check && r.check.missed) || [],
  }
})
const total = out.reduce((s, d) => s + ((d.findings && d.findings.length) || 0), 0)
const refuted = out.reduce((s, d) => s + (d.findings || []).filter((f) => f.check && f.check.verdict === 'refuted').length, 0)
const failed = out.filter((d) => d.failed).map((d) => d.label)
const unverified = out.filter((d) => !d.failed && !d.verified).map((d) => d.label)
log(`共 ${total} 个发现，${refuted} 个被推翻；没跑完的方向：${failed.join('、') || '无'}；没核实到的方向：${unverified.join('、') || '无'}`)
return { scratch: A.scratch, total, refuted, failed, unverified, dropped, dimensions: out }
