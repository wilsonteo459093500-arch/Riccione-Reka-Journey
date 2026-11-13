# 案例展示 · Case showcase (HANDOFF step 3) — build spec

Owner request (2026-10-26, verbatim): 「那个案例卡显示出来给客人的时候，我们可以点进去看多一点案例，展示更多的案例细节给客人看。」

Goal: when a guest taps a case card they can see MUCH more of that home — many photos grouped by room, full-screen with zoom,
細节 close-ups, what the firm made in each room (with SAIL boards by their guest names), the house facts and story, homes
similar to it, and a way to browse ALL cases with filters — without ever losing the 1–3 cases they already picked.
Staff can give every case more photos (room, caption 中/EN, 细节 flag, order, cover) and say per room what the firm made.
The photo sorter picks more photos per project. iPad memory and IndexedDB quota stay safe.

## House rules that apply to every part (owner's rules — never break)
- The repo is PUBLIC: never commit real client names, phone numbers, real case photos, factory scans or manual images.
- Guests NEVER see: factory board codes (XA-TP-01, AG337 …; only 「7号 · 黑胡桃乱纹」-style names = `L(MAT_BY_ID[id])`),
  prices, budgets, timelines, designer-only notes, staff warnings, drafts, hidden cases, showroom photos, or real projects without consent.
- Wish Mode (showroom iPad): no downloads, no file pickers, no settings. Guest images must not offer "save image"
  (`-webkit-touch-callout: none`, `draggable={false}`, `onContextMenu` → preventDefault on gallery / lightbox images).
- What the firm makes (「我们做」): custom cabinets, wall panels, doors, worktop (guest-facing counts as 我们做). Loose furniture is
  generic 示意 (「家具示意」), never the firm's product. Never reference the firm's finished-furniture catalogue.
- Every UI string goes through `t('中文')` with an English entry (test/i18n.test.mjs enforces it). Chinese is the key.
- Old projects, cases, packs (WISH-cases-*.json) and share links must keep working and render as before (additive schema only).
- Never call the real Gemini API in tests (mock it). Agents never run git.
- Checks: `cd genie && npm test && npx vite build`. The studio first-load chunk stays ≈ 396 kB gzip (this work must not touch it).

## 1 · Data layer — `src/shared/cases.js` (owner of file: DATA)

### Schema additions (all additive; `migrateCase` fills defaults; v stays 1)
Image: `{ …existing (id, room, kind, w, h, src, thumb, alt, cover, device?),`
`caption: { zh, en }` (guest caption, default empty) `, detail: boolean` (细节 close-up, default false) `}`.
Array order of `case.images` IS the staff order. Exactly one cover (existing rule).

Case: `roomsMade: { [roomKey]: { firm: string[], boards: string[], note: { zh, en } } }` (default `{}`).
- roomKey ∈ ROOMS ids except `plan3d`, plus `ROOM_HOME = 'home'` (「全屋」/ Whole home: doors and things not in one room).
- `firm` ⊆ SUPPLY_OFFER ids (offer group only — never furniture, never context); `boards`: valid board ids (`isBoardId`), ≤ 4.
- A present key = staff override for that room (derivation is NOT used for that room). Absent = derived (see below).

Constants: `PHOTO_MAX = CONFIG.cases.maxPhotos ?? 40` (per case, staff editor limit);
`PHOTO_EST_BYTES = 330 * 1024` (one device photo ≈ 1600 + 480 WebP); `ROOM_HOME = 'home'`;
`SUPPLY_ROOMS` (offer id → candidate rooms, priority order):
kitchen→[kitchen] · worktop→[kitchen, bath] · wardrobe→[master, bedroom, kids] · walkin→[walkin, master] · tvWall→[living, family] ·
shoeCabinet→[foyer] · displayShelf→[living, family, dining] · displayCabinet→[dining, living] · bookwall→[study, living, family] ·
study→[study] · bedStorage→[master, bedroom, kids] · toyStorage→[kids, family] · vanity→[bath] · altar→[living, dining, family] ·
wallPanel→[living, master, bedroom, dining, family, foyer] · featureWall→[living, master, dining, family] · doors→[] (always 全屋).

### New exports
- `guestPool(cases, { allowDrafts = false, keepConcepts = false } = {})` — EXACTLY the eligibility matchCases uses today
  (live; project needs consent; never showroom; drafts only for staff preview, never hidden; concepts dropped once
  ≥ CONFIG.cases.hideConceptsAt live projects). Refactor matchCases to call it with identical results.
- `galleryTabs(c)` → `[{ id: 'all', n }, { id: <room>, n }…(ROOMS order, only rooms with ≥ 1 image, plan3d last), { id: 'detail', n }?]`,
  each with `label` (t()/L()). 'detail' only when ≥ 1 detail image. Images with room '' appear only under 'all'.
- `galleryImages(c, tabId)` → images in staff order (room tabs include that room's detail photos; 'detail' = all detail photos).
- `boardGuestName(id)` → guest label of a KNOWN board (`L(m)`, with the series prefix exactly as CaseDetail's alsoBoards does),
  '' when this device does not know the board. Never returns a factory code.
- `caseRoomsMade(c)` → `[{ room, label, firm: [{ id, label }], boards: [{ id, name, color }], note: string, images: n, cover: img|null, derived: bool }]`
  in ROOMS order then 'home' last. Override rooms use staff data. Derived: each offer id in `c.supplies.firm` goes to the FIRST room in
  `SUPPLY_ROOMS[id]` that is in `c.rooms` (else 'home'); worktop only when `offersWorktop(firm)` (home.js), next to the kitchen/vanity room;
  the case's cabinetry board goes to every derived room that got a cabinet offer (anything except wallPanel/featureWall/doors/worktop);
  the feature board goes to rooms that got wallPanel/featureWall (else 'home'). Guest output lists only known boards (name via boardGuestName).
  Rooms with nothing to say (no firm, no boards, no note) are left out. Staff UI may call it with `{ staff: true }` to also get unknown boards
  (name = idLabel) and empty rooms from `c.rooms`.
- `caseFacts(c)` → `[{ k, label, value }]` guest-safe facts only: type (房子), size (面积, 「约 1,100 sq ft」), beds/baths (房间),
  storeys (楼层, landed & > 1 only), scope (我们做了: 「整个家」/「{0} 个房间」), style (风格: first dreamer card name), area (地区: `L(c.place)`
  only when it is not just the placeLine again). Never price / budget / timeline / staff fields.
- `similarCases(c, cases, { n = 4, profile = null, exclude = [] } = {})` → `[{ case, score }]` from `guestPool(cases)`, never `c` itself or
  `exclude` ids, never a case the profile hard-avoids (`caseNoGo(x) ∩ profile.avoid`). Score: 0.55 style-axes similarity + 0.15 same first
  dreamer + 0.1 any shared dreamer + 0.1 property class (+0.05 same type) + 0.1 rooms Jaccard + 0.02 real project; ties by `order`.
- `browseCases(profile, cases, filters = {})` → `{ list: Match[] (ranked like matchCases with limit = all, reasons included), excluded: [{ id, tags }],
  facets: { kind: [{ id, n }], type: [{ id, n }], room: [{ id, n }], style: [{ code, n }] }, total }`.
  filters = `{ kind: 'all'|'project'|'concept', type: [], room: [], style: [] }` — AND across groups, OR inside a group; room = in `c.rooms`
  or has a photo of it; style = first dreamer code. Facet counts over the unfiltered (eligible, not excluded) pool. Hard no-go cases are excluded.
- `loadImageURL(c, img, size = 1600)` → `Promise<{ url, release() }>` — ONE image; device photos read from IndexedDB into an object URL
  (release revokes it); bundled photos return `imageURL()` and a no-op release. Lets the gallery / lightbox load big images one at a time.
- `storageInfo()` → `Promise<{ usage, quota, persisted } | null>` (navigator.storage; null in Node / unsupported);
  `askPersist()` → `Promise<boolean>` (navigator.storage.persist; false when unsupported).
- English for every new label goes in `src/shared/i18n/en-cases.js`.

## 2 · Guest UI — `src/quiz/home/*` (owner: GUEST)
Files: CaseDetail.jsx (rewrite; keep default export, keep `useCaseBoards` export, keep old props working), new CaseGallery.jsx,
Lightbox.jsx, CaseBrowser.jsx, showcase.css; edit CasesStep.jsx, BlueprintCases.jsx (CaseCard.jsx only if needed). English → `src/shared/i18n/en-showcase.js`.

- **Detail sheet** (near full-screen on iPad; two columns landscape ≥ 900 px: gallery left & sticky, info right & scrolling; stacked on portrait/phone):
  - Gallery: room tabs as chips 「全部 18 · 客厅 5 · 厨房 4 · … · 细节 3 · 整个家（3D）」; big image (480 first, 1600 swapped in; only current
    ± 1 big images loaded); counter 「3 / 18」; caption + room label at the bottom; small 「细节」 badge on detail photos; swipe left/right;
    ←/→ keys; a thumbnail strip with ALL photos of the tab (lazy 480s, horizontally scrollable, active one scrolled into view);
    tap the big image (or a ⤢ button) → Lightbox.
  - Lightbox: full-screen black, image contained, pinch-zoom (two pointers) up to 4×, double-tap toggles 1× / 2.5×, drag to pan when zoomed
    (clamped), swipe to next/prev only at 1×, Esc / ✕ closes back to the sheet at the same photo, caption + room + counter, no download,
    no long-press save. Respect reduced motion.
  - Info column order: eyebrow · title · sub · story → 为什么适合你 (≤ 3) → 房子档案 (caseFacts as a small grid) →
    每个房间我们做了什么 (caseRoomsMade: room cover thumb, room name, 「我们做」 items, board chips (swatch + guest name), note;
    tap → gallery switches to that room's tab and (stacked layout) scrolls up to it) → 这个家用了 (existing materials) →
    我们做的 · 只是示意 (existing supply split, unchanged wording) → products (existing) → 相似的家 (similarCases, 3–4 compact cards; tap →
    that case's detail inside the same sheet with a 「← 返回」 back step; can select it if not readOnly) → actions.
  - New optional props: `all` (case list for similar homes), `profile`, `isOn(c)`, `onToggleCase(c, e)`. Without `all` there is no 相似的家.
- **Browse all** (CaseBrowser, lazy-loaded chunk): a 「看全部 {0} 个家」 button on the cases step (the same button in the blueprint's 参考案例)
  opens a full-screen overlay: header (title, count, ✕ back), filter chips (种类 · 房子 · 房间 · 风格) from `browseCases` facets, a grid of
  CaseCards ranked for this guest, the same select toggles (max 3, same 「最多三个哦」), a footer with the picked thumbnails and 「好了」 that
  closes the overlay. Picks live in CasesStep — closing the browser, opening details or changing filters never loses them. Cards open CaseDetail.
  Read-only in the blueprint. Excluded (no-go) homes stay out with the existing 「已经帮你避开…」 note.
- Device photos (staff-added on the iPad): covers via `resolveImages(…, { coverOnly: true, thumbsOnly: true })`, big ones via `loadImageURL`;
  always release object URLs on close / unmount. Never decode all 1600s at once.
- Keep CasesStep's own chunk small; CaseBrowser and Lightbox may be lazy. No change to the studio chunk.

## 3 · Staff UI — `src/cases/CaseManager.jsx` + `cases.css` (owner: STAFF). English → `src/shared/i18n/en-casestaff.js`
- Photos field: count 「{0} / {1} 张」; per photo: cover star, ✕, ← →, room select (existing) + 「细节」 toggle + caption inputs 中文 / English
  (compact); toolbar: 「按房间排」 (stable sort by ROOMS order, cover first), storage line 「这台设备的照片空间：已用 {0} MB · 还有约 {1} MB」
  (storageInfo; ask `askPersist()` once when the first photo is added), warning when free space < 150 MB or > 85 % used, refuse photos beyond
  PHOTO_MAX (flash how many were skipped). Many photos must stay usable on an iPad (lazy thumbs, no layout blow-up).
- New field 「每个房间我们做了什么」 after 做了哪些地方: one row per room (from `caseRoomsMade(draft, { staff: true })`): 「自动」 badge when derived;
  offer chips (SUPPLY_OFFER) to toggle; board chips from this case's boards (boards.cabinetry / boards.feature / boardsAlso — staff see codes via
  idLabel); note 中文 / English; 「恢复自动」 removes the override. Writing any change creates `roomsMade[room]` with the full current values.
- The guest preview (「用示范客人看看」) shows the new detail automatically (CasesStep preview mode).

## 4 · Photo sorter + import script (owner: SORTER)
- `src/cases/sorter/pick.js`: PICK.max 6 → 18 with a per-room cap (≤ 4 non-detail photos per room, unknown room counts as one room) and up to
  4 detail close-ups; keep the near-duplicate rule (> 0.93 similar → skip), cover rules unchanged, projectScore semantics unchanged.
- Detail close-ups: new view 'detail' in `src/cases/sorter/data.json` views (细节, 特写, 局部, 近景, detail, close-up, closeup, macro); the case image
  gets `detail: true` (session.js where cases are built); AI fill (ai.js) may also return `"detail": true` per photo (schema + prompt; tests mock it).
- Sorter UI shows up to 18 picks without breaking layout.
- `scripts/import-cases.mjs`: filename words → `detail: true`; re-import keeps staff captions / detail flags by image id.
- Tests in test/sorter.test.mjs (+ cases tests if touched). English → `src/shared/i18n/en-photopick.js`.

## 5 · Seed concept cases get more pictures (owner: SEED)
The 10 bundled 3D concept cases have only 2 eye-level renders + 1 whole-home 3D each. Using OUR OWN render pipeline only
(`src/cases/seed/render.html` + `scenes.js` + `src/quiz/vignettes/stage.js`; dev server; headless Chromium), add per case 2–4 more eye-level
rooms from the case's own `rooms` and 1–2 close-up 「细节」 shots (cabinet doors / handles / board grain / joinery), as `NN-1600.webp` +
`NN-480.webp` next to the existing files, appended to the case's `images` in `src/cases/manifest.json` with room, kind 'render', `detail`,
caption { zh, en } (short, factual, matching the case's materials) and alt. Existing images (ids 01–03, cover) stay byte-identical.
Look at every render before keeping it. Budget ≈ 6 MB total for the new files.
