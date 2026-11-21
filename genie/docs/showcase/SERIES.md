# 实拍案例优先 + 建议五大系列 — build spec (step 3b)

Owner, 2026-11-13 (verbatim): 「这个案例里面的3d太不好看了 能不能直接用我们实体照的案例？可是你要可以做到读取客人的需求
同时可以帮我们从我们的案例库选择对的案例给到客人 并且建议他拿我们5大系列的哪个系列」

Owner decisions (same day):
1. Real case photos live **only on the showroom iPad** (IndexedDB, imported by staff with 整理照片文件夹 / 案例库). Nothing real goes in the repo.
2. **3D concept cases are never shown to guests once at least one real project is live** (with consent). If no real case fits,
   the guest goes on with their card (no 3D fill-in). On devices with no real cases (a guest's own phone) the 3D concepts still show.
3. The five SAIL series are exactly: **骨骼线 · 空山 · 织 · 雾山 · 侘寂东方** (brand manual p.6 order).

All house rules in `SPEC.md` still apply (guests never see factory codes, prices, budgets, timelines, staff notes; Wish Mode
no downloads; public repo; every string through t(); never call real Gemini in tests).

## 1 · Data (`src/shared/series.js` NEW, `src/shared/cases.js`, `src/shared/config.js`)
- `CONFIG.cases.hideConceptsAt` 8 → **1** (guestPool already applies it). Regression fixtures that assumed 8 set it explicitly in the test.
- `src/shared/series.js` exports:
  - `SERIES = [{ key, zh, en, family: { zh, en } | null, title: { zh, en }, body: { zh, en }, note: { zh, en } }]` in the order
    skeleton 骨骼线 · mountain 空山 · weaving 织 · misty 雾山 · wabi 侘寂东方. Copy the brand text EXACTLY from
    the VISI app (`scratchpad/series-concept-from-visi.js`, the owner-approved copy from the brand manual) — do not invent copy.
  - `SERIES_BY_KEY`, `seriesKeyOf(text)` (maps 骨骼线/空山/织/织系列/雾山/侘寂东方/Skeleton Line/… to keys; '自然线' and '庭前' → null).
  - `SERIES_TARGET` (data, tunable): per series the target guest profile on the axes (0–100, 100 = the `a` side:
    temp 暖, density 简, texture 朴, storage 藏; hidden light 明亮, curve 圆润) plus style tags and material affinities:
    - skeleton 骨骼线 — classical furniture lines in a modern home, frame as handle, warm wood, 中古:
      temp 75, density 40, texture 50, storage 50, light 40, curve 30; styles 中古 原木 美式复古 法式; mats walnut / cherry / smoked-oak.
    - mountain 空山 — pared back, cabinetry “steps back”, empty-yet-not-empty display (grid book walls):
      temp 60, density 85, texture 65, storage 35, light 65, curve 35; styles 极简 原木 侘寂; mats light/white oak, warm white.
    - weaving 织 — linen-weave texture, soft, sensory, natural:
      temp 70, density 55, texture 90, light 55, curve 65; styles 侘寂 南洋; mats linen / rattan / woven / oat.
    - misty 雾山 — mist grey, spring wood, early green; light, calm, cabinetry fades:
      temp 40, density 75, texture 60, light 70, curve 55; styles 极简 奶油; mats grey / sage / light oak.
    - wabi 侘寂东方 — solid wood, Eastern sense of time, wabi-sabi:
      temp 70, density 60, texture 90, storage 60, light 35; styles 侘寂; mats smoked oak / walnut / elm / limewash / travertine.
  - `recommendSeries(profile, { chosen = [] } = {})` → `[{ key, score, reasons: [{ key, vars }] }]` sorted best first.
    Score = axis similarity to the target (only axes the guest answered) + small bonuses from the guest's own facts
    (card's design style words, picked-image materials, wishes like display/storage/kids) + a strong bonus for the series of
    real cases the guest has chosen (`chosen` = case objects; a chosen case with `series` counts most). Reasons are guest-safe
    sentences (t() keys) built only from the guest's own answers, e.g. 「你喜欢暖暖的木头和经典的线条」. Deterministic.
- Case schema (additive, migrateCase): `series: key | null` (accepts legacy names via seriesKeyOf). `caseFacts` adds 系列 when set.
- Matching: `matchCases` computes `recommendSeries(p)` once; `scoreOne` adds `W.series` (0.12) when the case's series is the
  guest's top series, 0.05 for the second; a reason 「和最适合你的系列一样：{0}」 when it applies. Cases without `series`
  (all seed concepts) score exactly as before → existing regression fixtures unchanged.
- `browseCases` facets + filter gain `series`.

## 2 · Sorter + import (`src/cases/sorter/*`, `scripts/import-cases.mjs`)
- `data.json` series vocabulary = the five keys (words: 骨骼线; 空山; 织系列 / exact 织; 雾山; 侘寂东方). 自然线 stays a word
  that implies 原木 but sets no series; 庭前 is removed from the series list (keep it harmless if seen).
- When the sorter builds a case, `case.series` = the first series parsed from the project folder name (else null; staff set it).
  Re-save keeps a staff-set series. `import-cases.mjs` passes `series` through from case.json.

## 3 · Guest (`src/quiz/home/*`)
- Cases step header: a calm series card 「最适合你的系列 · 空山」 + the series title line (e.g. 「入空山，感物近人。」) + 1–2 reasons.
  Tapping it shows the series body + note (sheet or inline expand). It updates when the guest picks a real case of another series.
- Real cases with a series show a small badge 「溪岸 · 空山」 on the card and in the detail (facts row 系列).
- Browse-all: 系列 filter chips.
- Blueprint: a short 「建议的系列」 block with the top series (name, title line, reasons) next to 参考案例.
- No 3D concept appears anywhere for guests once ≥ 1 real case is live (cases step, similar homes, browse, blueprint).

## 4 · Staff + designer
- CaseManager: series chips (5 + 未定) on each case; staff see the series name only (no codes involved).
- Designer hand-off brief (`src/studio/export/brief.js`): one line with the guest's recommended series (top 1–2).
