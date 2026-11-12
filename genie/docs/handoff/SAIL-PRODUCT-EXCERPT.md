> Recovered excerpt (sections 1, 2.0, 5, 12, 13) of the digest of the owner's 「SAIL 产品标准设计手册」 (216 p). The full digest and boards-catalogue.json were lost with the old machine; re-read the manual (owner uploads) if more detail is needed.

# 溪岸 sAil — product catalogue for modelling (WISH 3D studio + designer export)

**Sources**
- Manual 「SAIL 产品标准设计手册」, cited **M-p**n. The PDF page and the printed page are the same.
- Brochure, cited **B-p**n (PDF page).
- The furniture catalogue was **not** used (owner decision).
- Reader notes with full verbatim rules are in `read-3.md` … `read-7.md` (manual) and `read-1.md` / `read-2.md` (brochure). Colours are in `boards-catalogue.json`.

**Conventions**
- All sizes are in mm. W = width, H = height, t = thickness, D = depth.
- **est.** marks my estimate from a photo or drawing; it is not printed in the manual. Everything else is printed.
- 抽面 = can be used as a drawer front.
- 「柔性定制」 = non-standard: possible, but it goes through custom ordering.

---

## 1. Material tiers (door + carcass)

| Tier | Substrate / thickness | Max sheet / leaf | Colours | Notes | Ref |
|---|---|---|---|---|---|
| **颗粒板** (particle board, melamine) | 18 (all colours); 9 / 25 only for codes with /B/D; 12 only for 轻衫织 AG270 and 山衣织 AG289 | 国产 AG 2780×1200 (some 2720×1200); imported AK (EGGER, SKIN, Kastamonu) 2780×2080 / 2780×2050, 18 mm only | 75 colours in 9 families (`pb-*`) | Code = A + base (G 国产 / J 进口基材 / K 原装进口 / D 多层板 / Z 中纤) + colour no. + thickness letter (A18 B9 C5 D25 E22 F12 J19) + L for laser edge. A colour with no 9 mm version needs an 18 mm back panel. | M-p8–17 |
| **烤漆** (lacquer) | default 22 密度板 (some types 18); 澳松板; 多层板 | 密度板 2780×1200×18/22 (flat / moulded / curved) · 澳松板 2720×1200 · 多层板 2420×1200×18 (wall panel / carcass / curve) | GKL chips (14) + 哑光 / 水性肤感 numbers P1, 6991, 7068, 9130, **6165**, 6186, **2810**, 7031, 7050, **6162**, 7052, 7023, 7045, 9172. 亮光 and 金属 need a custom sample. | 宣伟 (Sherwin-Williams) paint, double-sided, 3底2面. Lacquer carcass **must** be 多层板 2420×1200×18/9. | M-p23–28, p86 |
| **木皮** (veneer) | default 22 欧松板 (some types 22 云杉板 / 18 欧松板) | veneer is one piece up to 2800 long; finger-jointed (齿接) above that | XA-TP-01…14 (also valid for carcasses) | 宣伟 3底2面 (意卡 costs extra). Finish table on M-p31. Veneer carcass is 多层板. | M-p30–36, p88 |
| **原木** (solid wood) | 22 (25 for doors > 2400 high) | doors W ≤ 600, H ≤ 2400 | XA-SM-01…25 (also 拼框 carcasses) | Curved doors are 拼框 22. 加厚板 is 拼框 with a 3 mm 水缝, total 30/36/40/48/54. Solid carcass is 拼框, ≥ 22, H ≤ 2800. Details are in a separate 「实木类产品手册」 that we do not have. | M-p38–43, p90 |
| **铝框玻璃** | aluminium frame + 5 mm 钢化 glass | W 300–600, H 300–2700 | GFG / GMS profile colours; JJ 星空灰 / 深空灰 / 极光白 | see §2.6 | M-p44–53 |
| **织** woven film | on F★★★★ 颗粒板 | see §2.7 | 桑榆 / 墨染 / 白苎 / 葛麻 | hand-wrapped | M-p54–58 |
| **钢板柜** steel | 3 / 5 mm steel, 墨玉黑 matt | H ≤ 2800, W ≤ 1200, D ≤ 600 | 墨玉黑 only | see §4.3 | M-p94 |

**Finish → roughness defaults for 3D** (M-p31, p40):
- **√ 半透哑光** (semi-transparent matt, open-ish pores; est. roughness 0.55–0.65): red oak, castanea, white oak, ash, walnut.
- **√ 清漆封闭哑光** (closed-pore matt, smoother; est. 0.45–0.55): cherry and birch.
- 开放哑光 is only △ for oak and ash. 亮光 is always △ or −.
- 颗粒板 melamine: est. 0.6–0.75, with texture families (布纹, 岩石纹, 土纹) rougher.
- 烤漆 哑光: est. 0.5. 水性肤感 (skin-touch): est. 0.7.

---

## 2. Doors — parametric catalogue

### 2.0 A door-face model that covers the whole catalogue (proposal for `furniture.js`)

Today `panel()` draws a slab, an optional `fluted` face and four handle types. Below is a single `doorFace(spec)` that would cover about 95 % of the codes. Values marked est. are defaults read from drawings, to be tuned against the owner's section drawings when available.

```js
doorFace({
  w, h, t,                       // mm, from the tables below
  face: 'slab' | 'groove' | 'frame' | 'raised' | 'fluted' | 'glass' | 'rattan' | 'louvre' | 'woven' | 'skeletal',
  frame: 0.12,                   // frame width as a share of W (est.; clamp 45–75 mm). 原木 ≈ 0.13–0.15; 拼框编织 = 20 mm; 拼框玻璃 = 60 mm
  recess: 6,                     // panel set back behind the frame face (est.)
  inner: 'square' | 'bevel' | 'step2' | 'cove' | 'bead',   // inner edge of the frame
  opening: 'rect' | 'arch-round' | 'arch-quarter' | 'arch-sweep' | 'segmental' | 'notch' | 'notch-shoulder' | 'chamfer',
  mirror: true,                  // asymmetric openings mirror on the paired leaf (102/103/112X/113X/202/203/…)
  groove: { inset: 40, w: 6, d: 3 },          // 'groove' face: one V/U line following `opening` (est.)
  reeds: { n: 15, d: 4 },                     // 'fluted' (est. counts below)
  ornament: null | 'dots' | 'ruyi' | 'fret' | 'french',   // corner ornaments (305D1/2/3, 151–153)
  insert: 'glass:超白' | 'rattan:c' | 'woven:桑榆' | null,
  pull: see §5,
})
```

**Shared opening shapes** (all est. from the drawings on M-p25–27, p32–34, p41–42):
- **arch-quarter:** a straight top that turns into a quarter circle at the top-right corner, radius ≈ 0.55–0.65 × opening width, then straight down the right side. A mirrored pair reads as one arch. Used by 102, 112X, 202, 232T, 323B and 333T.
- **arch-sweep:** a top that rises in one long curve from the left side to the top-right corner, also mirrored. Used by 103, 113X, 123B, 203, 213X and 233T.
- **arch-round:** a symmetric semicircle, r = opening width / 2. Used by 122B, 212X and 322B.
- **segmental:** a shallow segmental arch on the top rail. Used by 312K5.
- **notch:** concave quarter-circle corners, r ≈ 30–40. Used by 105, 115X, 125B, 205, 215X, 235T and 335T.
- **notch-shoulder:** a cushion shape with larger shouldered corners at top and bottom. Used by 116X, 216X, 236T and 336T. 106 / 206 have the shoulder at top-right only.
- **chamfer:** 45° clipped corners (octagon). Used by 126B and the mislabelled "321B" on M-p42.

### 2.1 颗粒板 doors (M-p18–21, p69)
## 5. Handles (拉手系统, M-p163–167, plus brand cues)

| Kind | Code | Geometry (mm) | Finishes | Limits |
|---|---|---|---|---|
| Edge J-profile | **C252** | 35 high × 20 deep, slot-in on the door edge (uses 35 of the door height) | 哑黑 / 哑金 / 钛空灰 / 赫拉红 | custom length |
| Edge T-bar | **AM536** | 10 × 37, slot-in (uses 3). Horizontal on top / bottom edges or vertical on the side. Doors ≥ 1500: **length fixed 1070**; doors < 1500: length = H − 50 at top and bottom. | same | |
| Edge profile | F304 | 32 × 19 (uses 32) | same | |
| Edge T-bar | 隆科367 | 10 × 37 | 哑黑 / 哑金 | 20 mm LVTT veneer only |
| L cap on top edge | F935A / F935B | 37 / 11 high | 哑黑 / 太郎灰 / 香槟金 / 赫拉红 | 150–2900; factory doors only, not 实木 / 吸塑 / 烤漆 |
| Scooped edge | AM511 | 3 thick, left and right versions | same | 280–2900; factory doors only |
| Recessed cup | M1889 | 125 × 42 × 18 deep | 绅士灰 / 哑黑 | |
| Lip insert | GL2235 | 140 × 36 (139 × 33) | 月光银 / 极光白 / 奶咖 | |
| Flush recessed | L8100 | 45 × 45 / 45 × 119 / 45 × 172 | 铁灰 / 砂金 / 电泳黑 | |
| Slim vertical recess | L9619-1 / -2 | 73 / 158 | 太郎灰 / 哑黑 | pocket doors: front, back and edge |
| Gola, base | **ML002** | J-channel under the worktop | 哑黑 | custom length |
| Gola, tall | **ML001** | horizontal C-channel at mid height | 哑黑 | custom length |
| Gola, wall unit | **ML015** | slim profile under the door | 哑黑 | custom length |
| Surface handles | 明装拉手 | 「产品更新中」 — **no data** | | |
| Milled | XX-01…05 | §2.5 | — | flat 颗粒板 only |
| 45° bevel | — | §2.5 | — | |
| **Brand rail pulls** (photos) | 骨骼线 rail (§2.8); 原木 applied horizontal batten across the top of each front + vertical stiles (B-p41, p44); 微侘寂 proud full-width top rail ≈ 20 high, 15–20 proud (B-p46); 橱柜系列 inset fronts in an exposed face-frame with a top-rail grip (B-p39) | est. | board | |
| Long bar (photo) | slim black vertical bar ≈ 900–1000 on the lower half of the meeting edges (B-p40); JJ glass doors 1100 bar (M-p45); 扬帆4号 long black verticals (M-p110) | est. | | |
| Tatami | 半月拉手 | recessed half-moon, centred on each lid, avoiding cross panels | | M-p204 |
| Room-door levers | SG-MS01…07 | §7 | | M-p184–186 |

---

## 6. Kitchen (橱柜系统, M-p119–149)
## 12. What our 3D already approximates, and the biggest gaps

Engine files read: `genie/src/studio/engine/furniture.js`, `furnish.js`, `house.js` (production adccd6a). wt-walk's `house.js` adds door pivots, glass sliders, skirting 80 × 12 and **门套 60** (the same as the manual's 套线 60).

| Manual item | Engine today | Match |
|---|---|---|
| Flat slab doors 18–22, W ≤ 600 | `panel()` t 18, `doorRow()` maxW 0.6, **3 mm gap** + black shadow backer | ✓ (平板 / 100-2 / 200-2) |
| Fluted fronts (108–110, 220: W ≤ 450, **H ≤ 900**) | `flutedGeo`, pitch 22–30; sideboard (0.61 high) and shoe cabinet low doors (0.82) | ✓ within the 900 limit. Never use it on tall doors. |
| Handles | 'bar' (≤ 500 vertical), 'barH', 'knob', 'groove' (top-edge finger groove ≈ C252 / F304) | partial. No gola ML001 / 002 / 015, AM536, milled XX, 45° bevel, or brand rail pulls. |
| Kitchen base | `kitchenRun`: D **600**, top at 900 with a 30 top, plinth **100 high, ≈ 100 back**, doors stop 35 under the top (handleless shadow ≈ ML002) | close. Manual: D **560 / 580**, plinth **80 high, 60 back**, H 800 / 840 / 880 + top. |
| Kitchen wall units | 720 high, D 330, doors drop 20 below the box as the pull, LED under, filler to the ceiling | close. Manual: default **700**, D 300 / **350** / 400. ML015 profile instead of a drop. |
| Backsplash / worktop | 600-high 12 mm countertop-material splash, 30 top with a rounded front | worktop is **context, not offer** (M-p127). Manual edges: 下挂 45 front, 45 upstand. |
| Tall unit | `tallUnit`: D 600, H 2.4, bar handles, split at 58 % | close to 2200–2600 / D 580. **No oven tower** (a key brochure image). |
| Island | waterfall stone top, groove doors | ✓ matches the brochure (B-p9, p26) |
| Wardrobe | D 600, **plinth 80** ✓, 19 doors ≈ 500 wide, 10 hand groove between pairs or a 600 bar | partial. No straightener cue (invisible anyway). AM536 vertical (1070) or the brochure's long black bar on the lower half. No internals, no open / lit walk-in. |
| Glass display | `displayCabinet`: 22 black frame, glass, LED under every shelf | ✓ ≈ JJ2025 深空灰 + D-004; bar 420 vs manual 200 / 1100 |
| Bookshelf | 25 boards, 70 plinth, flush shelves ≈ 360 pitch | **not 空山**: needs shelves **25 proud**, staggered bays, thick shelves, LED |
| TV wall | slats 26 @ 40 pitch, 22 deep; flat panels ≤ 1.2 m with 4 joint; floating TV cabinet **340 high** | slats ≈ 颗粒板格栅 (18 slat + 15 / 20 gap = 33 / 38 pitch). Panel joint should be 脱缝 5 × 12. **The floating TV cabinet must be 150–220 high**, D 300–400. |
| Vanity | floating 0.36–0.85, D 480, W 0.9, groove handle | ✓ (manual D 400–500, H 300–500, W ≤ 900) |
| Shoe cabinet | D 380, floating low part with LED, fluted low doors, niche | plausible; no manual standard |
| Room doors | `doorLeaf` 40 slab, ≤ 1.3 m, head 2.1, 75° open (+ wt-walk pivots, 门套 60) | size ✓ (W 700–1000, H 1900–2200). **No hidden-door, pocket, pivot, ghost or top-hung types.** |
| Wall panels | `featurePanel` flat ≤ 1.2 m or slats | partial (see TV wall) |
| Beds | generic upholstered bed | **no tatami, 栖云 or 翻床** (all are the firm's offer) |
| Lighting | `led()` strips under wall units, the TV cabinet and display shelves | partial. **No vertical wardrobe side LED, no shelf spots.** |
| Door styles beyond slab | — | **missing**: Shaker / arch / glass / rattan / woven / French / skeletal |

### Biggest gaps, in priority order

1. **Door-face families.** Implement `doorFace(spec)` (§2.0): slab, groove, frame, fluted, glass, rattan / woven, and 骨骼线 rails. That turns the catalogue into a style picker and lets each case's doors look like the brand's.
2. **骨骼线 kitchen and wardrobe (§2.8)**, with the oven tower, charcoal floating shelves and hood box: the brand's most recognisable image (B-p9, p21–26).
3. **空山 open grid (§4.3)**: 25 proud shelves, staggered, LED. This is the 侘寂 / 原木 signature and the owner's strongest styles.
4. **Kitchen standards:** plinth 80 / 60, depth 580, wall unit 700 × 350, tall 2200–2600 with an appliance tower; worktop flagged as context.
5. **Floating TV cabinet H 150–220** (today 340) and the 脱缝 panel joint.
6. **Handles:** ML001 / 002 / 015 gola, AM536 vertical, 45° bevel, brand rail / batten pulls, long bar.
7. **Room doors:** hidden door flush with wall panelling (51 / 46 leaf, rebate 19 × 13), pocket, pivot, top-hung slider (wt-walk already has pivots and sliders).
8. **Beds as offer:** tatami platform with lift lids, 栖云.
9. **Wardrobe interiors and lit open walk-in** (B-p11, p20; M-p153): rails, drawer stacks, vertical side LED. Visible in walk-in mode.
10. **Names in the export:** door code, board code, finish and series in component and layer names, and standard sizes snapped to the manual (§13).

---

## 13. Snapping table for the designer export

Snap these values; flag anything off-standard as 「柔性定制」.

| Item | Snap to |
|---|---|
| Base H (incl. plinth) | 800 / 840 / 880 (or 920 / 960 / 1000) |
| Base D | 560 / 580 |
| Plinth | 80 high, 60 back |
| Wall-unit H | 700 default, 200–1000 |
| Wall-unit D | 300 / 350 / 400 |
| Wall-unit W | ≤ 1200 (≤ 900 on exposed hangers) |
| Tall H | 2200–2600 |
| Tall D | 560 / 580 |
| Door W | ≤ 600 (see the family tables) |
| Door H | ≤ 2780; ≥ 2400 → straightener note |
| Drawer front | ≤ 400 |
| Wardrobe accessory W | cabinet W − 36 |
| Floating TV cabinet | H 150–220, D 300–400 |
| Floating vanity | W ≤ 900, D 400–500, H 300–500 |
| Room doors | W 700–1000, H 1900–2200 |
| Pocket door | W 800–1000 |
| Centre pivot door | W 1100–1500 |
| Closure strip | 50 × 18 (60 laser) |
| Skirting / crown | 80 / 80 |
| 套线 (architrave) | 60 |

Every cabinetry component name should carry:
- the **door code** (for example 100-2 / 211X / SG-PK02-1 / 骨骼线);
- the **board key** from `boards-catalogue.json` (for example vn-XA-TP-01 → 「7号黑胡桃 XA-TP-01 半透哑光」);
- the **handle code** (C252 / ML002 / XX-03 …).