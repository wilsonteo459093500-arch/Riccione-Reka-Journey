# HANDOFF — WISH by RICCIONE REKA (for the next conversation)

Read this first. Reply to the owner in **Chinese**, short and plain. Do one step per conversation, then stop.

## Where things are (2026-11-21)
- **LIVE since 2026-11-21 01:34 UTC: steps 3 + 3b + 1 together** (owner: 「可以上线了」).
  - Production = commit **3d2bcf0** on `ccr-eb67bc6b-ecbura`, deployment `dpl_HDWqKbbihQBn3hgMrU8XTsccjQp8`, deployed manually by commit.
  - Rollback: promote `dpl_DTjwcxRscXjo9Jr11ZbUW3RV7Ymp` (3ea54bf, the previous production).
  - Checked live: `/`, `/studio.html` and `/cases.html` serve the same content-hashed entry files as the build that passed every check (`studio-0vtMhwam.js`, `main-3hF5WimZ.js`, `cases-B09P_cBw.js`), and the WalkMode chunk loads.
  - PR #65 stays open (draft, not merged into `claude/ecstatic-keller-sw56vw`). Merging is a separate decision.
- **Step 1 (walk-in 「走进去」) is LIVE.** Same branch `ccr-eb67bc6b-ecbura` / PR #65, on top of step 3 + 3b.
  - Spec and as-built notes: `genie/docs/walk/SPEC.md`. Code: `genie/src/studio/walk/` (lazy chunk ~44 kB gzip); seam in `Engine.js` / `house.js` / `StudioApp.jsx` / `studio.css`.
  - Release check passed after the review fixes (commit f12454b and later):
    - `npm test`
    - build; studio entry 397.14 kB gzip (limit 397.5)
    - bird's-eye pixel checks: mode A 14/14 and mode B 6/6 identical (`scripts/walk-pixels.mjs`)
    - real-browser e2e: condo3 21/21, semid2 22/22, wish 21/21 (`npm run walk:e2e`)
    - screenshots at 4 sizes × zh/en (`scripts/walk-shots.mjs`)
    - preview video (`scripts/walk-video.mjs`)
  - Independent Opus review: 15 findings confirmed and fixed in two rounds, each fix re-checked by a separate agent. The 2 high ones: Pangie claimed kept cabinets as 我们做; the joystick crawled on iPad. Details are in SPEC §10 "Review fixes".
  - Fixed after watching the preview video (2026-11-20, SPEC §10):
    - **Turning view:** while walking a route, the view now looks 1.5 m ahead along the path (2 m on stairs) instead of at the next corner point. It no longer stares at a wall at corners, on the stair landing, or going into the wet kitchen. The path itself is unchanged; routes take about 2% longer.
    - **Plaster edges:** the slab edge at the stair hole and the strips above doors and windows were dark ink (the bird's-eye cutaway colour) and read as black from inside. In walk mode only, `walk/plaster.js` swaps them to plaster and puts the exact original materials back on exit.
    - **Reduced-motion fix:** an instant exit during the reduced-motion fly-in no longer leaves ceilings or plaster behind in the bird's-eye view.
    - **Second pass after re-recording the video:**
      - On the U-stair landing the view now looks up the next flight, instead of about 1 s of the stairwell wall.
      - When a walk ends with a given direction (tour stops, room views), the view starts turning that way over the last 1.2 m, but only if that side is open. Walking into the master bedroom it no longer walks at the wall and then spins round.
      - A second independent review of that pass confirmed 2 issues, both fixed in d94388d. The arrival direction had come from a tiny A* end hook (head whip). After a stair, a short last leg made the head reverse.
      - 3d2bcf0: while looking sideways on a stair flight the view lowers to −0.3 rad. The next flight's treads and rail stay in frame instead of the stairwell wall. It was chosen from 3 variants recorded in the real app.
      - Final release check on 3d2bcf0: npm test, build (studio entry 397.14 kB), mode B 6/6, e2e 64/64, 32 re-shot screenshots, 78 s video. SPEC §10 "Second pass".
  - Known small leftover: if the guest picks a new destination while standing inside an open door's swing, the camera can brush the door panel. A random stress test hit this 1–3 times per 1,200 walks (10× fewer than before). Idea: make path walking respect `doors.clearOf`.
  - The owner saw the screenshots and the video and said go. Real iPad smoothness is now checked on the showroom iPad on the live site (refresh; there is no service worker).
  - Known small leftover: turning round on the tight semid2 U-stair still shows about 0.4 s of mostly wall.
  - Deploys are by commit (manual `create_deployment`, target production, gitSource ref + sha).
  - Defaults the owner may change: painting is per surface type (all cabinets together); the tour auto-starts on the first walk-in only; bookmarks stay on the device (max 12, wiped for the next guest).
- **Step 3 (case showcase) is LIVE (with step 1, see above).** Branch `ccr-eb67bc6b-ecbura` = 3ea54bf + these notes + step 3; draft PR #65 into `claude/ecstatic-keller-sw56vw`.
  - Spec: `genie/docs/showcase/SPEC.md`. Release check passed (npm test, vite build, studio chunk 395.70 kB gzip, screenshots at 4 sizes × zh/en, independent review: 14 findings fixed).
  - The owner OKed it; deployed with step 1 on 2026-11-21 (3d2bcf0). The 3ea54bf deployment is kept for rollback.
  - Owner's small open choices from step 3: browse footer 「选好了」 wording; unlabelled-room projects auto-pick only 4 photos (pick.js PICK.perRoom); projects saved in the sorter before step 3 keep their old 6 photos until staff re-pick.
- **Step 3b (real cases first + suggested SAIL series) is LIVE (same deployment).** Spec: `genie/docs/showcase/SERIES.md`. Commit a7ca947.
  - Owner's choices: real photos only on the showroom iPad; the 3D concepts are never shown to guests once ≥ 1 live, consented real case exists (`CONFIG.cases.hideConceptsAt` = 1); the five series are 骨骼线 · 空山 · 织 · 雾山 · 侘寂东方.
  - **To make it real:** staff import the photos on the showroom iPad (案例库 → 整理照片文件夹), set each case's 溪岸系列, then 保存并上架 with consent. Until then the iPad and phones still show the concepts.
  - Small open choices: English brand spelling (SAIL vs sAil); the series card's small colour swatches (keep or text only).
- **Live site:** https://wish-riccione-reka.vercel.app = commit **3d2bcf0** (steps 3 + 3b + 1). The previous live commit was 3ea54bf (board library 溪岸板材).
  - Vercel project `wish-riccione-reka`, team `team_o5uT7vzbGzKNPpi04SRuCi0n`, Root Directory `genie`.
  - Production deploys are MANUAL: `create_deployment` with gitSource github `wilsonteo459093500-arch/Riccione-Reka-Journey`, ref + sha, `target: production`.
  - Rollback: deployment of 38b6c25 (`dpl_61wydBDgYPv8BFbgaz8Dmvx5uhta`).
- **Main working branch:** `claude/ecstatic-keller-sw56vw` = 3ea54bf. Draft PR wilsonteo459093500-arch/Riccione-Reka-Journey#50.
- **Branch `claude/walk-in-wip`** = 3ea54bf + older notes only (superseded by `ccr-eb67bc6b-ecbura`).
  - The first walk-in code was lost (never pushed); step 1 was rebuilt from scratch on `ccr-eb67bc6b-ecbura`.
  - The design (GDD), the full SAIL manual digest and `boards-catalogue.json` were lost too.
  - What survived: `OWNER-ANSWERS.md`, plus `SAIL-PRODUCT-EXCERPT.md` (§1 tiers, §2.0 door model, §5 handles, §12 gaps, §13 export snapping).
- The repo is **PUBLIC**. Never commit real client names, phone numbers, real case photos, factory scans or manual images.

## Owner's rules (always)
- Chinese replies. The owner prefers action over questions; ask only real decisions.
- **New features:** show screenshots / a preview video first, deploy only after the owner says go.
- **Never call the real Gemini API in tests** (mock it). Agents never run git.
- **What the firm makes (我们做):** custom cabinets, wall panels, doors, worktop (designer-facing: 外购).
  - Loose furniture is generic 示意.
  - **Never model or reference the firm's finished-furniture catalogue.**
- **Guests never see:** factory board codes (only 「7号 · 黑胡桃乱纹」 style names), prices, budgets, timelines, or designer-only notes.
- **Wish Mode:** no downloads, no file pickers, no settings.
- **No China contacts:** no 400 number, saildz.com or WeChat QR; use the Malaysian WhatsApp. Don't show the founder's name. Brand line: 「SAIL BY RICCIONE REKA」.
- **Checks before every push:** `cd genie && npm test && npx vite build`.
  - Use headless Chromium (Playwright is preinstalled) at iPad 1180×820 and 820×1180, phone 412×860 and desk 1440×900, in zh + en; look at every screenshot.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011Ur8W3ce2kPLTt5uszJyei
  ```
  (The session URL may change with a new conversation; use the trailer the system gives you.)

## Steps (the owner says which one to do: 「做第 N 步」)
**1. Walk-in 「走进去」 — LIVE (3d2bcf0, 2026-11-21).** See `genie/docs/walk/SPEC.md` (§9 scripts, §10 as-built notes). Release check before any deploy:
- `cd genie && npm test && npx vite build && node scripts/chunk-size.mjs`
- `node scripts/walk-pixels.mjs --check` against a saved baseline, and `--walk --scenario all`
- `npm run walk:e2e` (about 35 min)
- `node scripts/walk-shots.mjs` (about 1 h)

Original scope (all built):
- **Entry and look:** from the bird's-eye studio a gold 走进去 button flies in through the front door to eye height (1.55 m).
- **Moving:** tap-to-walk (nav grid + A*), joystick, look-drag; doors open by themselves; real stairs between floors; minimap.
- **Tool wheel:**
  - Paint the surface under the finger. The old critique's blocker was that only 墙面 got painted.
  - Floor, Furnish / Move, Light (time of day, night lighting), Measure.
  - Photo: in Wish Mode it saves only a bookmark, no download.
- **Pangie's tour** with voice + captions; exit flies back to the dollhouse.
- **Bird's-eye must stay pixel-identical.** Keep it light on an iPad: lazy-load the walk modules and keep the studio first-load chunk ≈ 396 kB gzip.
- **Before any deploy:** release check, then the owner's OK.

**2. Cabinet detail configurator.** Owner request in OWNER-ANSWERS.md. Wait for the owner's reference screenshots first.
- **Colour per group:** kitchen base / wall / tall / island, TV wall, wardrobe, shoe, bookshelf, vanity, wall panels, and per single cabinet.
- **Parts:** carcass vs door (+ drawer fronts, end panels, plinth, open shelves) coloured separately.
- **SAIL door styles** (`doorFace(spec)` in SAIL-PRODUCT-EXCERPT §2.0), **handles** (§5 codes + finishes) and **boards** (溪岸板材 library + tiers).
- **Presets** (上浅下深 / 双色厨房 / 原木侘寂 / 全屋统一). Guests see names; designers see codes; the designer export carries codes.
- **Old projects, cases and share links must render exactly as before.** Today there is ONE `cabinetry` slot (`genie/src/shared/materials.js` SLOTS); cabinets are built in `genie/src/studio/engine/furniture.js` (`panel()` handles: none / bar / barH / knob / groove; `doorRow`, `kitchenRun`, `wardrobe`, `tvWall`, …).
- **Order:** show a design + mock-ups and the owner's questions first, then build.

**3. Case showcase — LIVE with 3b (3d2bcf0, 2026-11-21).** See `genie/docs/showcase/SPEC.md` and `SERIES.md`.
- **Guest:** `CaseDetail.jsx` (gallery by room, 细节 tab, captions, house facts, 每个房间我们做了什么, 相似的家), `CaseGallery.jsx`, `Lightbox.jsx` (zoom), `CaseBrowser.jsx` (看全部 + filters; picks shared with `CasesStep.jsx`), `showcase.css`.
- **Data:** `src/shared/cases.js` (image `caption` / `detail`, case `roomsMade`, guestPool, galleryTabs, caseRoomsMade, caseFacts, similarCases, browseCases, boardGuestName(s), loadImageURL, storageInfo, isQuotaError). Tests: `test/showcase*.test.mjs`, `test/case-manager.test.mjs`.
- **Staff:** `CaseManager.jsx` (up to 40 photos per case, 细节, captions 中/EN, 按房间排, storage meter; 每个房间我们做了什么 editor). Sorter `pick.js` picks up to 18 (≤ 4 per room + 4 close-ups); re-saving keeps staff work; `import-cases.mjs` matches photos by file name.
- **Seed concepts:** 38 more renders (our own stage, `src/cases/seed/scenes.js`), images 01–03 untouched.
- **3b · series:** `src/shared/series.js` (SERIES brand copy, SERIES_TARGET, recommendSeries, seriesKeyOf); `matchCases` adds W.series; case `series`; guest `SeriesCard.jsx` (cases step, re-ranks when a guest picks a case of another series), card badge 「溪岸 · 空山」, browse 系列 filter, detail facts 系列, blueprint VIII 建议的系列; staff series chips in CaseManager; designer brief + README line. Tests: `test/series.test.mjs`.
  - Calibration (16 style cards → top series): 骨骼线 5, 雾山 4, 织 3, 空山 2, 侘寂东方 2. Tune `SERIES_TARGET` if the owner disagrees.
- **Known small leftovers:** on a phone a cut tab can show next to ✕ after the tab strip scrolls to the end; cards run under the fixed footer at first view on iPad landscape (reachable by scrolling); the series card makes the iPad-landscape header taller.

**4. Later.**
- Bahasa Melayu (third language).
- Import real case photos via 整理照片文件夹 (and set their series).
- Owner's open decisions:
  - make the repo private, or ask GitHub Support to purge old commits 79ae03f / 33f20be that hold real client names;
  - `crm/src/seed.js` (older code) has real names / phones in the public repo;
  - 溪岸 SAIL plinth wording;
  - the timeline in guest `#p=` links;
  - add a real 侘寂 case (and at least one real case per series).

## How to start the next conversation
> 先切到分支 `claude/walk-in-wip`，读 `genie/docs/handoff/HANDOFF.md`，做第 N 步。用中文回答我。
