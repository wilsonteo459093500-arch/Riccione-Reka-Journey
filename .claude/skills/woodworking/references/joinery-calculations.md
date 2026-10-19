# Joinery, functional clearances, and calculations

Covers joint selection and all the calculations that turn an envelope into accurate part dimensions:
clearances, shelf deflection, wood movement, squareness. Everything in millimeters.

## Choosing the joint by use

| Joint | When to use | Tools | Strength |
|-------|-------------|-------|----------|
| Screws (surface / T-joint) | Fast assembly, hidden structure, utility furniture | Driver, drill + countersink | Medium; weak in the panel edge (pre-drill) |
| Dowels | Clean carcasses with no visible screws, panels | Drill + jig or doweling machine | Good; needs boring accuracy |
| Biscuits | Edge joints, corner joints, tops | Biscuit joiner | Good; excellent alignment, fast |
| Cam connectors (minifix) | Knock-down / flat-pack furniture | Drill + jig | Medium; demountable |
| Mortise and tenon | Frames, frame doors, fine structures | Mortiser / router / saw | Very good; traditional, durable |
| Dovetails | Premium solid-wood drawers, visible corners | Jig + router, or by hand | Excellent; decorative |
| Groove + tongue / rabbet | Backs, dividers, tops | Router / saw | Good for holding and squaring |

Principles: in the **panel edge**, screws hold poorly → prefer dowels/biscuits/connectors. A
**grooved back** stiffens and squares the carcass; a **surface-mounted back** (screwed/stapled at the
rear) is simpler but demands careful squaring. Always **dry-fit** before gluing.

## Functional clearances — subtracting dimensions

This is the step that prevents wrong parts. Start from the **envelope** and subtract thicknesses and
clearances to get the **part dimensions**.

### Carcass (example, 18 mm sides)
- Inside width = outside width − 2 × side thickness.
  E.g. `800 − 2×18 = 764`.
- Top/bottom **between** the sides: length = inside width (764). Sides **between** top and bottom:
  side height = outside height; top/bottom carry the full width. Pick one of the two logics and keep
  it (which part "wraps" which).
- Adjustable shelves: width = inside width − ~1 to 2 mm clearance for fitting; depth = inside depth −
  **back setback** (often 10–20 mm) so they don't hit the back.

### Doors
- **Perimeter gap** between fronts and between front/carcass: **2 to 3 mm**. For two side-by-side
  doors: center gap 2–3 mm; side gaps 2 mm; top/bottom gap 2–3 mm.
- **Full-overlay** door: the front covers the carcass edge (overlap ~ panel thickness, 0-crank
  hinge). **Inset** door: the front sits in the opening with the perimeter gap (large-crank hinge).
- Overlay front width (2 doors on a carcass of outside width L) ≈ `(L − center gap)/2`, overlap
  included; fine-tune per the hinge system.

### Drawers (ball-bearing full-extension, ~13 mm/side clearance)
- Drawer **box** width = inside carcass width − **26 mm** (13 each side). Check the exact figure of
  the chosen slides.
- Box depth ≤ slide length; carcass outside depth ≥ slide length + setback.
- **Front**: if overlay, sized like a door (2–3 mm gaps); if inset, the opening minus the perimeter
  gap. The front is usually **applied** to the drawer box (adjustable) rather than integral.
- Drawer clearance height = clear opening height − clearance (top + slide).

Always carry the critical dimensions (inside width, slide clearances, overlaps) into the package's
**"Dimensions to verify before cutting"** section.

## Shelf deflection (don't let a shelf sag)

A shelf that's too long or too loaded deflects. Target a deflection of **≤ span/360** and, for looks,
**≤ ~3 mm** regardless of span.

Formula for a shelf on two supports, uniformly loaded:

```
deflection f = (5 × q × L⁴) / (384 × E × I)
with  I = (b × h³) / 12        (rectangular section)
```
- `q` = load per unit length (N/mm) = total load (N) / span L (mm).  Weight → force: 1 kg ≈ 9.81 N.
- `L` = clear span between supports (mm).
- `b` = shelf width (mm), `h` = thickness (mm).
- `E` = modulus of elasticity (N/mm²), indicative values:

| Material | E (N/mm²) approx. |
|----------|-------------------|
| Particleboard / melamine | 2500 – 3000 |
| MDF | 3500 – 4000 |
| Plywood | 7000 – 9000 (depends on grain) |
| Pine / softwood (solid) | 9000 – 11000 |
| Hardwoods (oak, beech, ash) | 10000 – 16000 |

**Practical guide** (18 mm shelf, moderate load such as books):

| 18 mm shelf material | Recommended max clear span |
|----------------------|----------------------------|
| Melamine / particleboard | ~600 – 700 mm |
| MDF | ~650 – 750 mm |
| Plywood | ~800 mm |
| Solid wood | ~900 mm and more |

Beyond that: add a divider/support, a **stiffener** under the front edge, increase the thickness, or
double the front edge. For heavy loads (tightly packed books, archives), reduce these spans by about
30%.

## Wood movement

**Solid wood** moves with humidity, mostly across the **width** (tangential/radial), little along the
length. Design consequences:
- **Never** fix a wide solid panel rigidly all around: provide **slots (oblong holes)** for the
  fixing screws of tops, floating tongues, or buttons with slots.
- Frame-and-panel door: let the **center panel float** in the groove (do not glue it), with a small
  clearance for movement.
- **Engineered panels** (MDF, plywood, melamine) are dimensionally stable: this concerns them little,
  but they fear **moisture** (irreversible edge swelling) → protect the edges and avoid wet areas
  without a moisture-resistant panel.
- Acclimatize the wood to the room a few days before breakdown. Work and finish **both faces** of a
  panel to limit cupping.

## Squareness and stability

- **Carcass squareness**: measure **both diagonals**; they must be equal (tolerance ≤ 2 mm). Adjust by
  clamping diagonally before the glue sets.
- The **back** (grooved or set true) locks the geometry; fit/screw it while the carcass is square.
- **Tip stability**: any tall, narrow unit (bookcase, tower) must be **fixed to the wall**. A toe kick
  set slightly back and adjustable feet correct an uneven floor.
- **Load and supports**: carry loads onto the vertical members and the backs; avoid loading a simple
  edge-screwed joint heavily.

## Cutting optimization (rule reminder)

- Group by **material + thickness**; one sheet format per group (see `materials-hardware.md`).
- **Kerf 3–4 mm** deducted at each cut.
- Place the **large parts first**, fill with the small ones.
- **Decor direction**: all visible parts oriented the same way (wood-decor melamine, laminate) —
  priority over yield.
- Keep **offcuts > ~150 mm**; aim for and report a reasonable waste ratio.
