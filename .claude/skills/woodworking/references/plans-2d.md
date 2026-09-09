# 2D plans, dimensioning, cut list, and cutting diagram

Covers deliverables 4 to 7: dimensioned part drawings, orthographic views, the cut list, and the
optimized cutting diagram. Everything in millimeters.

## Dimensioning conventions

- **Unit**: mm, everywhere, without repeating "mm" on every dimension if a general note states it
  ("Dimensions in mm" in the title block).
- **Dual dimension chain**: an outer chain for overall dimensions (envelope), an inner chain for
  detail dimensions (centers, shelf positions, borings). Avoid redundant dimensions that contradict
  each other when something changes.
- **Functional dimensions first**: dimension what must be accurate for the piece to work (inside
  carcass width, drawer clearance height, hinge centers) rather than convenient but useless
  dimensions.
- **Dimensioning origin**: start from a reference face (often the left side and the bottom) and
  dimension as a chain or by accumulation from that origin, to limit error stack-up.
- **References**: each part carries a reference (A, B, C…) echoed in the cut list, the views, and the
  cutting diagram.
- **Grain / decor direction**: on solid wood, visible plywood, and wood-decor melamine, show the
  grain direction with an arrow. It drives breakdown and appearance.
- **Scale**: state the scale (1:10, 1:20…) and respect it. In SVG, work at real size in mm then apply
  a factor via the `viewBox` / `transform` attribute.

## Orthographic views — SVG template

Produce three dimensioned views: **front**, **side** (profile), **top**. Generate them in SVG (crisp,
zoomable, printable). The template below draws one dimensioned view; duplicate it for the three views,
adapting the silhouette and dimensions. Work in mm coordinates and set the `viewBox` to the part
dimensions plus a margin for dimensions.

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-120 -120 1040 2040" width="100%" style="max-width:520px;background:#fff;font-family:system-ui,sans-serif">
  <!-- style markers -->
  <defs>
    <marker id="ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#1d4ed8"/>
    </marker>
  </defs>
  <!-- FRONT VIEW: example carcass 800 x 1800, sides 18, shelves -->
  <g stroke="#222" stroke-width="3" fill="#f4efe6">
    <rect x="0" y="0" width="800" height="1800"/>            <!-- envelope -->
  </g>
  <g stroke="#222" stroke-width="2" fill="#e8e0d0">
    <rect x="0"   y="0"    width="18"  height="1800"/>       <!-- left side -->
    <rect x="782" y="0"    width="18"  height="1800"/>       <!-- right side -->
    <rect x="18"  y="0"    width="764" height="18"/>         <!-- top -->
    <rect x="18"  y="1782" width="764" height="18"/>         <!-- bottom -->
    <rect x="18"  y="892"  width="764" height="18"/>         <!-- fixed shelf -->
    <rect x="18"  y="312"  width="764" height="18"/>
    <rect x="18"  y="602"  width="764" height="18"/>
    <rect x="18"  y="1192" width="764" height="18"/>
    <rect x="18"  y="1492" width="764" height="18"/>
  </g>
  <!-- DIMENSIONS: outer chain (width, height) -->
  <g stroke="#1d4ed8" stroke-width="1.5" fill="#1d4ed8" font-size="34" font-weight="700">
    <!-- overall width, below the part -->
    <line x1="0" y1="1880" x2="800" y2="1880" marker-start="url(#ar)" marker-end="url(#ar)"/>
    <text x="400" y="1940" text-anchor="middle">800</text>
    <!-- overall height, on the left -->
    <line x1="-80" y1="0" x2="-80" y2="1800" marker-start="url(#ar)" marker-end="url(#ar)"/>
    <text x="-95" y="900" text-anchor="middle" transform="rotate(-90 -95 900)">1800</text>
  </g>
  <!-- inner chain: shelf positions (centers from the bottom) -->
  <g stroke="#0a7d4d" stroke-width="1.2" fill="#0a7d4d" font-size="26" font-weight="600">
    <line x1="840" y1="892" x2="840" y2="1782" marker-start="url(#ar)" marker-end="url(#ar)"/>
    <text x="880" y="1340" text-anchor="middle" transform="rotate(-90 880 1340)">≈ 880</text>
  </g>
  <text x="400" y="-60" text-anchor="middle" font-size="40" font-weight="800" fill="#111">FRONT VIEW — scale 1:10 — dimensions in mm</text>
</svg>
```

**Adapt for each view**:
- **Front**: width × height, fronts, vertical positions (shelves, rails, drawer openings).
- **Side / profile**: depth × height, any overhang, back setback, drawer and slide depth, hinge
  position in depth.
- **Top**: width × depth, side thickness, back setback, top overhang.

Always show at least: the full envelope, visible thicknesses, and the 2–3 decisive functional
dimensions of the view. Flag any critical dimensions to re-check in the "Dimensions to verify before
cutting" section.

## Cut list — template

The cut list is the source of truth: cutting diagram, budget, and shopping list all derive from it.
Present a clear Markdown table:

| Ref | Description | Qty | Length (mm) | Width (mm) | Thick. (mm) | Material | Edge banding | Notes |
|-----|-------------|-----|------------|-----------|-------------|----------|--------------|-------|
| A | Side | 2 | 1800 | 400 | 18 | Melamine | 1 long edge (front) | Hinge boring if door |
| B | Top / bottom | 2 | 764 | 400 | 18 | Melamine | 1 front edge | Captured between sides |
| C | Fixed shelf | 1 | 764 | 398 | 18 | Melamine | 1 front edge | Stiffens the carcass |
| D | Adjustable shelf | 4 | 764 | 388 | 18 | Melamine | 1 front edge | On pins, back setback |
| F | Back panel | 1 | 800 | 1800 | 8 | Plywood | — | Surface-mounted or grooved |

Rules:
- **Compute each part dimension** by subtraction from the envelope and the clearances (see
  `joinery-calculations.md`). E.g. top/bottom between the sides: `inside width = 800 − 2×18 = 764`.
- **State edge banding** part by part (visible edges only): it drives time and cost.
- **Count identical parts** in the Qty column, but list them once.
- **Check consistency**: the sum of the cut-list areas must match the take-off from the cutting
  diagram.

## Optimized cutting diagram

Goal: get every part out of the **fewest sheets**, minimizing waste and respecting decor direction.

Method:
1. **Group by sheet** (same material + same thickness). One cut list can consume several different
   sheets (e.g. 18 mm melamine + 8 mm plywood for backs).
2. **Pick the sheet format** from `references/materials-hardware.md` (e.g. melamine 2800×2070, plywood
   2500×1250…). Account for the format actually available from the supplier.
3. **Kerf**: subtract the kerf width at each cut. Default **3 to 4 mm** (circular blade). State it
   explicitly.
4. **Nest** the parts: place the large parts first, then fill with the small ones. If the decor has a
   direction (wood-decor melamine, laminate), orient all visible parts the same way — this lowers
   yield but is visually mandatory.
5. **Count**: number of sheets per material, **waste ratio** (% of area lost), and list the reusable
   offcuts (> ~150 mm).

Show the result in SVG: one rectangle per sheet to scale, parts placed and labeled by reference.
Minimal template:

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 2880 2150" width="100%" style="max-width:640px;background:#fff;font-family:system-ui,sans-serif">
  <rect x="0" y="0" width="2800" height="2070" fill="#fbf7ef" stroke="#222" stroke-width="4"/>
  <!-- each part: rect + reference label; positions = result of nesting -->
  <g font-size="60" font-weight="700" text-anchor="middle">
    <rect x="10"   y="10"  width="400" height="1800" fill="#e5dcc7" stroke="#1d4ed8" stroke-width="3"/><text x="210" y="920">A ×1</text>
    <rect x="416"  y="10"  width="400" height="1800" fill="#e5dcc7" stroke="#1d4ed8" stroke-width="3"/><text x="616" y="920">A ×1</text>
    <rect x="822"  y="10"  width="764" height="400"  fill="#ded3ba" stroke="#1d4ed8" stroke-width="3"/><text x="1204" y="220">B</text>
    <!-- … complete per the actual nesting … -->
  </g>
  <text x="1400" y="-10" text-anchor="middle" font-size="64" font-weight="800">Sheet 1 — Melamine 18 mm — 2800×2070 — kerf 4 mm</text>
</svg>
```

If an external optimizer is used (CutList Optimizer, OpenCutList for SketchUp), provide the cut list
in the expected format (length, width, quantity, material, grain) and report the result (number of
sheets, yield) in the package.
