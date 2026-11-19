// 软件体检（全面版）—— Workflow 脚本
//
// 用法：Workflow({ scriptPath: '<这个文件的绝对路径>', args: { ... } })
// args（都由体检第 1、2 步查出来）：
//   appName     软件名，例 'KIRA'
//   appDir      要检查的代码的绝对路径（暂存区里的 git worktree，不是工作目录）
//   outDir      检查员放脚本 / 截图的绝对路径（暂存区）
//   context     这个软件是什么、给谁用、正式版是哪个 commit、最新版是哪个、先读哪几份文档、测试和构建的结果
//   liveFacts   从 Vercel / Supabase / GitHub 读到的事实（检查员不准自己去读正式环境）
//   skip        可选，要跳过的角度，例 ['ai']
//   reviewerModel / verifierModel   可选，例 'opus'。不写就跟对话用同一个 model。额度紧时检查员用 'opus' 或 'sonnet'
//
// 共 9 个帮手以内：每个角度 1 个检查员（最多 7 个），严重 / 高的发现合起来交给 2 个复核员试着推翻。
// 机器同时能跑 nproc - 2 个；4 核 = 一次 2 个，整套大约 40–60 分钟。
// 一启动就因为额度全部失败：等重置后用 resumeFromRunId 接着跑。连续两次都这样，就改做快检，不要再试。
// 2026-11-19 写成时，14 个帮手的版本两次都被 5 小时额度挡下，所以改成这个 9 个的版本；这一版还没有完整跑完过一次。

export const meta = {
  name: 'software-checkup',
  description: '软件体检：最多 7 个角度并行检查（只读），严重和高的发现再由 2 个复核员试着推翻',
  whenToUse: '用户选了「全面体检」时，由 software-checkup skill 调用',
  phases: [
    { title: 'Review', detail: '每个角度一个检查员，只读' },
    { title: 'Verify', detail: '严重 / 高的发现交给复核员试着推翻' },
  ],
}

const A = args || {}
const APP = A.appName || 'the app'
const DIR = A.appDir
const OUT = A.outDir
if (!DIR || !OUT) throw new Error('args.appDir 和 args.outDir 必填（绝对路径）')
const SKIP = Array.isArray(A.skip) ? A.skip : []

const CTX = `
You are auditing ${APP}. Background from the lead:
${A.context || '(no extra context given — read the README and docs in the app directory first)'}

WHERE THE CODE IS: ${DIR}

HARD RULES
- READ-ONLY review. Do NOT modify, stage, commit, push, or checkout anything inside the app directory or its repository. Do not run "npm install". Do not open PRs or post comments.
- Put any scratch scripts / outputs / screenshots ONLY under ${OUT}/<your-key>/ (create it).
- Do NOT touch production: no requests to deployed URLs or hosted databases, no Supabase / Vercel / GitHub tools. localhost only.
- Evidence over opinion: every finding needs file:line, or a script / screenshot you actually ran, so someone else can re-check it. If you could not confirm something, lower "confidence" instead of overstating.
- The owner is a non-technical business person. Write "title", "userImpact" and "suggestedFix" in plain Simplified Chinese (what goes wrong for a salesperson / customer / the boss, everyday words, no jargon). "evidence" and "repro" may be technical.
- Severity: critical = wrong money shown to a customer, data loss, or data exposed to outsiders; high = likely to bite real users soon; medium = worth fixing in a planned phase; low = polish.
- "inProduction": "yes" if the problem also exists in the production version described above, "no" if only in newer unreleased code, "unknown" if you did not check.
- Report real strengths too, so the owner knows what NOT to touch.
- Aim for the 6-12 findings that matter most in your area, not an exhaustive nitpick list. Non-defect opportunities go in "ideas".
`

const LIVE = A.liveFacts ? `\nLIVE FACTS (fetched read-only by the lead; do not re-fetch):\n${A.liveFacts}\n` : ''

const ANGLES = [
  { key: 'money', label: '钱对不对', live: false, prompt: `YOUR AREA: IS THE MONEY RIGHT? (skip and say so if the app has no prices or amounts)
Write small scripts that import the real calculation modules and price realistic examples; check them against the rules written in the docs.
The SAME document must give the SAME total in every output (screen, print/PDF, Excel, chat text, image) and the lines must add up to each sub-total — check every audience / version of each output, not only the default one.
Edge inputs: 0, negative, huge, empty, wrong unit (mm typed as m), comma decimals — check the calculation function first, then whether the screen blocks it (blocked on screen = not a problem).
Discounts: items that must not be discounted; discount above 100% or negative; any limit or approval.
Things added automatically (AI suggestions, template defaults) vs the same thing added by hand: same size, same price?
When the price list changes, are old saved documents re-priced or frozen? Is the price-list version stamped on them?` },
  { key: 'ai', label: 'AI 功能', live: false, prompt: `YOUR AREA: AI FEATURES. (skip and say so if the app has none)
Which model, cost per call, latency and what the user sees while waiting; malformed / truncated output, refusal, timeout; who can burn the budget (rate limit, monthly cap); whether the model ids and SDK parameters used are current.
Is there a human check before an AI result enters real data (house rule: AI may only suggest)?
If a number the AI reads (scale, size) is wrong, does it turn straight into money — by how much?
Where does customer data (plans, photos) go and how long is it kept? Does feedback actually flow back into rules / tests?
If the owner asked a "could AI one day do X automatically?" question (see background), list in "ideas" which building blocks already exist in the code, what is missing, and the main risks.` },
  { key: 'security', label: '安全与隐私', live: true, prompt: `YOUR AREA: SECURITY & PRIVACY.
Is the repository public, and what commercially sensitive things can an outsider read (price lists, margins, discount rules, customer data in fixtures, internal docs)?
Login, who can read / change whose records (compare any SQL policy files with the live facts), any audit trail of who changed what.
Secrets committed by mistake (grep code, fixtures, docs). Server endpoints: auth, input validation, size limits, error leakage.
What happens when a staff member leaves (account, data left on their phone)?
Dependencies with known vulnerabilities — and whether the vulnerable path is actually used.` },
  { key: 'data', label: '资料会不会丢', live: true, prompt: `YOUR AREA: DATA SAFETY — SYNC, OFFLINE, STORAGE, BACKUP.
Two people (or two devices) editing the same record: what happens, is anyone warned? Comparisons that trust the device clock.
Offline, a push failing half-way, local storage full, an old cached app version against a newer data shape.
Is there ANY backup / export-everything / restore? Can a hosted free-tier database be paused for inactivity? Can a mistaken overwrite be undone (history)?
Where useful, write a script that drives the pure sync functions to demonstrate a loss scenario.` },
  { key: 'ux', label: '实际操作体验', live: false, prompt: `YOUR AREA: REAL USABILITY — phone (390x844, touch) and laptop (1280x800).
Actually USE the app: start its preview / dev server on a free localhost port in the background, drive it with Playwright (require('playwright'); chromium.launch() needs no options; do NOT install anything). If the app ships a browser test script, read it first for working selectors and run it.
Walk the main flows on both viewports from first open to a finished, sendable document; count taps and time. Screenshots (deviceScaleFactor 1) go in your scratch folder. Only one CJK font exists on this machine — ignore ugly glyphs, judge layout, wording and flow.
Report friction, jargon, hidden features, unclear errors and empty states, mobile layout breakage, slowness, mixed languages, anything broken. Judge the customer-facing output too: validity date, "estimate" disclaimer, terms, company contact, staff name, document number / date.
Put the screenshot path(s) in "evidence". Stop your server when done.` },
  { key: 'delivery', label: '代码与上线流程', live: true, prompt: `YOUR AREA: ENGINEERING HEALTH AND THE DELIVERY PROCESS.
Tests: how many, which important behaviour has none, does anything automatic stop a broken build reaching production (CI)?
How production is released: from which branch, by hand or automatic, is the app on the default branch at all? What is the simplest safe process for a non-technical owner who works only through an AI assistant?
Very large files, duplicated logic, first-load download size and what is lazy-loaded.
Do the docs match reality (if a doc says "same database / same login as the old system", check the live facts)?
How easily can a brand-new AI coding session pick this app up (is it mentioned in the root CLAUDE.md, where are the plan docs)?` },
  { key: 'business', label: '业务缺口', live: true, prompt: `YOUR AREA: PRODUCT / BUSINESS GAPS.
First understand the company's flow from the repo's READMEs and skills (lead -> needs -> quote -> proposal -> contract -> delivery) and which part this app covers.
Is anyone really using it (see live facts)? If not, what is missing that stops the team switching to it?
Check against the code (say where you looked): document lifecycle (draft / sent / won / lost), numbering, who made it, discount limits, links to the company's other apps (no double typing), dashboards.
Rank by sales impact vs effort (S = under a day of AI-assisted work, M = a few days, L = a week or more). Defects go in "findings", opportunities in "ideas".` },
].filter(a => !SKIP.includes(a.key))

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '3-6 sentences, plain Simplified Chinese: overall state of this area' },
    score: { type: 'number', description: '0-10 health of this area (10 = excellent)' },
    strengths: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short unique id prefixed with your area key, e.g. money-1' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          evidence: { type: 'string' },
          repro: { type: 'string' },
          userImpact: { type: 'string' },
          suggestedFix: { type: 'string' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          inProduction: { type: 'string', enum: ['yes', 'no', 'unknown'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['id', 'title', 'severity', 'evidence', 'userImpact', 'suggestedFix', 'effort', 'inProduction', 'confidence'],
      },
    },
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          why: { type: 'string' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
        },
        required: ['title', 'why', 'impact', 'effort'],
      },
    },
  },
  required: ['summary', 'score', 'strengths', 'findings'],
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
          verdict: { type: 'string', enum: ['confirmed', 'partially', 'refuted', 'unverifiable'] },
          correctedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          notes: { type: 'string', description: 'what you checked and why; if partially, exactly which part is true' },
        },
        required: ['id', 'verdict', 'correctedSeverity', 'notes'],
      },
    },
  },
  required: ['verdicts'],
}

// ---- 第一段：每个角度一个检查员（要等全部回来，才能把严重 / 高的合起来分给复核员）----
phase('Review')
const reviews = await parallel(ANGLES.map(a => () =>
  agent(CTX + (a.live ? LIVE : '') + '\n' + a.prompt, {
    label: 'review:' + a.key, phase: 'Review', schema: FINDINGS_SCHEMA,
    ...(A.reviewerModel ? { model: A.reviewerModel } : {}),
  }).then(r => (r ? { key: a.key, label: a.label, ...r } : null))
))
const areas = reviews.filter(Boolean)
const dropped = ANGLES.filter((a, i) => !reviews[i]).map(a => a.key)
if (dropped.length) log('没有跑完的角度：' + dropped.join(', '))

// ---- 第二段：严重 / 高的发现，分成两堆，各由一个复核员试着推翻 ----
const serious = areas.flatMap(a => (a.findings || []).filter(f => f.severity === 'critical' || f.severity === 'high').map(f => ({ area: a.key, ...f })))
const notVerified = areas.reduce((n, a) => n + (a.findings || []).filter(f => f.severity === 'medium' || f.severity === 'low').length, 0)
log(`严重 / 高的发现 ${serious.length} 条送去复核；中 / 低的 ${notVerified} 条不复核（报告里要标明「未复核」）`)

let verdicts = []
if (serious.length) {
  phase('Verify')
  const piles = serious.length > 3 ? [serious.filter((f, i) => i % 2 === 0), serious.filter((f, i) => i % 2 === 1)] : [serious]
  const out = await parallel(piles.map((pile, i) => () =>
    agent(CTX + LIVE + `
YOU ARE AN INDEPENDENT SECOND CHECKER. Other reviewers produced the findings below. The lead will put the surviving ones in front of a non-technical business owner, so a wrong finding is costly.
Try to REFUTE each one: open the cited files, read the real code paths, and for logic / money / data claims write and run a small script (for screen claims re-run the flow in a browser on another localhost port and look at the cited screenshots). Scratch folder: ${OUT}/verify-${i + 1}/.
- "confirmed" only if you reproduced it, or the code unambiguously does what is claimed AND the impact on real users is real.
- "partially" if the core is true but the scope / severity / production claim is wrong — say exactly what is true.
- "refuted" if the code does not behave as claimed (cite the line that disproves it).
- "unverifiable" if you could not establish it either way. When in doubt do NOT confirm.
Give correctedSeverity (your own judgement) and one verdict for EVERY id.

FINDINGS TO CHECK (JSON):
${JSON.stringify(pile, null, 1)}
`, { label: 'verify:' + (i + 1), phase: 'Verify', schema: VERDICT_SCHEMA, ...(A.verifierModel ? { model: A.verifierModel } : {}) })
  ))
  verdicts = out.filter(Boolean).flatMap(v => v.verdicts || [])
  if (out.some(v => !v)) log('有一个复核员没跑完：对应的发现在报告里标「未复核」')
}

return { areas, dropped, verdicts, seriousSent: serious.length, notVerified }
