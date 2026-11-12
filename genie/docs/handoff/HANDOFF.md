# HANDOFF — WISH by RICCIONE REKA (for the next conversation)

Read this first. Reply to the owner in **Chinese**, short and plain. Do one step per conversation, then stop.

## Where things are (2026-11-12)
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
  Claude-Session: https://claude.ai/code/session_01FfASrzHoAkdYs5Ur895BaZ
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

**3. Case showcase.** Owner request in OWNER-ANSWERS.md. Today `genie/src/quiz/home/CaseDetail.jsx` shows ≤ 5 thumbs.
- **Guest view:**
  - Many more photos per case, by room, full-screen + zoom, 细节 close-ups.
  - What the firm made per room, with boards (guest names).
  - House facts + story.
  - 相似的家 + browse all cases (filters) without losing the guest's picks.
- **Staff:** more photos per case (room, caption 中/EN, 细节 flag, order, cover) in `genie/src/cases/CaseManager.jsx`. The sorter (`genie/src/cases/sorter/pick.js`, today cover + 5) picks more.
- **Limits:** watch iPad IndexedDB quota and memory. Show the owner screenshots before deploy.

**4. Later.**
- Bahasa Melayu (third language).
- Import real case photos via 整理照片文件夹.
- Owner's open decisions:
  - make the repo private, or ask GitHub Support to purge old commits 79ae03f / 33f20be that hold real client names;
  - `crm/src/seed.js` (older code) has real names / phones in the public repo;
  - 溪岸 SAIL plinth wording;
  - the timeline in guest `#p=` links;
  - add a real 侘寂 case.

## How to start the next conversation
> 先切到分支 `claude/walk-in-wip`，读 `genie/docs/handoff/HANDOFF.md`，做第 N 步。用中文回答我。
