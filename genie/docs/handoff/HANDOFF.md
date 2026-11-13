# HANDOFF — WISH by RICCIONE REKA (for the next conversation)

Read this first. Reply to the owner in **Chinese**, short and plain. Do one step per conversation, then stop.

## Where things are (2026-11-13)
- **Step 3 (case showcase) is BUILT, not live.** Branch `ccr-eb67bc6b-ecbura` = 3ea54bf + these notes + step 3; draft PR #65 into `claude/ecstatic-keller-sw56vw`.
  - Spec: `genie/docs/showcase/SPEC.md`. Release check passed (npm test, vite build, studio chunk 395.70 kB gzip, screenshots at 4 sizes × zh/en, independent review: 14 findings fixed).
  - **Waiting for the owner's OK on the screenshots.** On "go": merge PR #65 (or deploy the branch head) to production as below; keep 3ea54bf's deployment for rollback.
  - Owner's small open choices from step 3: browse footer 「选好了」 wording; unlabelled-room projects auto-pick only 4 photos (pick.js PICK.perRoom); projects saved in the sorter before step 3 keep their old 6 photos until staff re-pick.
- **Step 3b (real cases first + suggested SAIL series) is BUILT on the same PR #65, not live.** Spec: `genie/docs/showcase/SERIES.md`. Commit a7ca947.
  - Owner's choices: real photos only on the showroom iPad; the 3D concepts are never shown to guests once ≥ 1 live, consented real case exists (`CONFIG.cases.hideConceptsAt` = 1); the five series are 骨骼线 · 空山 · 织 · 雾山 · 侘寂东方.
  - **To make it real:** staff import the photos on the showroom iPad (案例库 → 整理照片文件夹), set each case's 溪岸系列, then 保存并上架 with consent. Until then the iPad and phones still show the concepts.
  - Small open choices: English brand spelling (SAIL vs sAil); the series card's small colour swatches (keep or text only).
- **Live site:** https://wish-riccione-reka.vercel.app = commit **3ea54bf** (board library 溪岸板材 live).
  - Vercel project `wish-riccione-reka`, team `team_o5uT7vzbGzKNPpi04SRuCi0n`, Root Directory `genie`.
  - Production deploys are MANUAL: `create_deployment` with gitSource github `wilsonteo459093500-arch/Riccione-Reka-Journey`, ref + sha, `target: production`.
  - Rollback: deployment of 38b6c25 (`dpl_61wydBDgYPv8BFbgaz8Dmvx5uhta`).
- **Main working branch:** `claude/ecstatic-keller-sw56vw` = 3ea54bf. Draft PR wilsonteo459093500-arch/Riccione-Reka-Journey#50.
- **This branch (`claude/walk-in-wip`)** = 3ea54bf + these notes only.
  - The walk-in 「走进去」 code was **lost** when the cloud machine was replaced: it was never pushed.
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
**1. Walk-in 「走进去」 — rebuild.** The previous code is gone. Rebuild on `claude/ecstatic-keller-sw56vw`. Scope:
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

**3. Case showcase — DONE on PR #65 (with 3b), waiting for the owner's OK to deploy.** See `genie/docs/showcase/SPEC.md` and `SERIES.md`.
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
