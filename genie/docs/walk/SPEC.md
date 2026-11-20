# 走进去 (walk-in) — build spec (HANDOFF step 1)

The owner approved this on 2026-11-19. The owner-facing summary and the defaults are in the approved plan. This file holds the **contracts** that the parallel build units work against. If a contract has to change, change it here first.

## House rules (all units)

**Text**
- Every Han string literal in `src/` needs English: `t('中文')`.
- Walk-mode English lives ONLY in the lazy dictionaries `src/shared/i18n/en-walk.js` and `en-walktools.js`.
  - They are loaded by `src/studio/walk/words.js` through `addWords()`, the same way as `en-export.js`.
  - Exception: 「走进去」「正在走进去…」「回到全屋」 go in `en-studio.js`, because StudioApp shows them before the lazy chunk loads.
- `test/i18n.test.mjs` gets a WALK carve-out.
- **Lazy dictionary files, one per owner**, so units can work in parallel. Each is `export default { '中文': 'English' }`:

  | File | Owner |
  |---|---|
  | `en-walk.js` | U2b, then U5a appends |
  | `en-walktour.js` | U4 |
  | `en-walktools.js` | U5b |

  - `walk/words.js` (U2b) imports all three and calls `addWords`.
  - U2b creates the other two as empty stubs.

**Colour and layout**
- No hex colours anywhere in UI files. CSS uses the `base.css` tokens (`--gold-btn`, `--gold`, `--gold-l`, `--paper…`).
- three.js colours come from `src/shared/palette.js` `PALETTE`; add keys there if needed.
- Touch targets are at least 44 px.

**Guest rules**
- Wish Mode (`isWishMode()`): no downloads, no file pickers, no settings.
- Guests never see board codes, prices, budgets, timelines or staff notes. Show material names only.
- 我们做 (we make) = cabinets, wall panels, doors, worktop. Loose furniture is 示意 (illustration).

**Bundle**
- Walk code may use only three.js core classes **already used by non-walk studio code**. `Quaternion`, `Euler` and `Spherical` are also allowed.
- No `three/addons` imports.
- No `localStorage`, `sessionStorage`, `indexedDB`, `download`, `createObjectURL` or `type="file"` in `src/studio/walk/`.

**Process**
- Never call the real Gemini API in tests.
- Agents never run git.
- Tests are plain node with `node:assert`, in the style of the existing suites.

## Coordinates

| Space | Convention |
|---|---|
| Plan | metres; `x` → world x; plan `y` → world **z**; height → world **y** |
| `stairPath` points | `{x, y, z}` with plan x/y; `z` = height above the `from` floor; `elev` = that floor's world y |
| Floor `i` | world y of its floor surface = `navData().floors[i].elev` |
| Eye | `elev + 1.55` |

## 1 · Engine seam (U1 — `src/studio/engine/Engine.js`, `house.js`)

`this.walk = null` (constructor). The walk controller owns the object; the engine only reads it:

```js
walk = { fov: 62,          // vertical FOV (deg) used by applyView/setPrincipal
         vo: { x: 0, y: 0 },// principal-point offset in px (0 = centred)
         ev: 1.0,           // exposure multiplier on top of daylight exposure
         pr: 0 }            // optional pixel-ratio cap (0 = none)
```

`engine.setWalk(w | null)` does the following:
- sets `this.walk` and clears `this.tween`
- `controls.enabled = !w`
- `renderer.shadowMap.autoUpdate = !w; needsUpdate = true`
- `dof.enabled = !w`, if a DOF pass exists
- on enter: `select(null)` and hide the hover ring
- re-applies exposure (`day.exposure * (w?.ev || 1)`)
- `lastCut = null`
- `applyCovered()`
- `if (applyPixelRatio()) resize(); else applyView();`
- `dirty = true`

Gates. With `walk === null`, each one reduces to today's code exactly:

| Where | Change |
|---|---|
| `applyView()` | `setPrincipal(cam, W, H, w ? w.vo.x : this.vo.x, w ? w.vo.y : this.vo.y, w ? w.fov : BASE_FOV)` |
| `setPrincipal(cam,W,H,ox,oy, base = BASE_FOV)` | use `base` instead of `BASE_FOV` (thumbs keep the default) |
| `isFramed()` | `if (this.walk) return false;` |
| `frame()` | `if (this.walk) return;` |
| `targetPR()` | also `Math.min(..., this.walk?.pr \|\| 9)` |
| `setTime()` | `toneMappingExposure = d.exposure * (this.walk?.ev \|\| 1)`; set `shadowMap.needsUpdate = true` |
| `setFurniture` / `setCeilings` / `setFloorView` | set `shadowMap.needsUpdate = true` (no effect in bird's-eye, where `autoUpdate` is true) |
| `activeWallMode()` | `if (this.walk) return 'up';` |
| `setFloorView()` | `hide = !this.walk && i > idx`; `coverFrac = this.walk ? 1 : (…)` |
| `applyCovered()` | `far = this.walk \|\| (!this._showAll && !this._near)` |
| `placeRoomLights(near)` | optional `{x, z}`: order rooms by distance to it (no arg = today's area order) |
| `loop()` | `moved = this.walk ? false : this.controls.update(dt)`; skip `emitAnchors` / `emitSelMove` while walking |
| `bindEvents` onDown + hover | return early while walking |

`house.js`:
- `export` the existing `doorLeaf(wall, p, lib)` and `windowFrame(...)`. No behaviour change.
- After the per-floor door leaves / handles are merged, set `userData.doorLeaves = true` on those two meshes.

`setCeilings(on)` must also call `collectPickables()`.

Existing methods the walk code uses, unchanged:
- `navData()`, `setCeilings`, `setFloorView(id, {instant, quiet})`, `setTime`, `setMaterial`
- `slotAt` / `hitAt` / `itemAt` / `groundAt` / `rayAt`, `highlightSlot`, `snapshot(scale)`
- `onTick`, `camera`, `controls`, `renderer`, `scene`, `floors[]` (`F.group`, `F.shell`, `F.ceiling`, `F.furn`, `F.wallSets`, …)
- `lib` (MatLib), `wallsBy`, `plan`

**Pixel-identity requirement.** With `walk === null`, bird's-eye renders and `insets` / `vo` must be bit-identical to the baseline (`scripts/walk-pixels.mjs`, mode A).

## 2 · Pure modules (node-testable)

### `walk/nav.js` (U2)

`navDataOf(plan)` returns the same shape as `Engine.navData()`:
- `{ floors: [{ id, level, elev, ceil, height, rooms, walls, openings }], stairs: [stairPath…] }`
- `walls` come from `buildAllWalls(plan)`.

`buildNav(navData, items = [], opts)` returns `nav`. Options (defaults):
- `cell: 0.1`
- `radius: 0.22`
- `skip(kind)` — ignore `flat` / `ceiling` / `wallMounted` catalog kinds and curtains
- `size(kind)` — optional

Grid and blocking:
- One grid per floor over the floor bounds plus a 1.5 m margin.
- Cells inside any room are walkable, outdoor rooms included.
- Blocked:
  - `void` rooms
  - stair rooms on the stair's **to** floor (hole) and on its **from** floor (flights)
  - every wall drawn as a band of thickness `t`, except pieces of kind `door`, `open`, and `slider` with `sill <= 0.3`
  - slider mullions (every ~1.0 m along the piece)
  - furniture footprints via `furnish.footprintOf(item)`, items of that floor only
  - everything outside rooms, except a 1.5 m apron outside the main entrance so the entry flight can start outside
- A clearance (distance-to-blocked) map; a cell is passable when its clearance is at least `radius`.

Search:
- A* with the octile heuristic plus a small clearance cost, which keeps paths centred.
- Smoothed with line-of-sight checks against the clearance map.
- Floors connect through stair links: `stairPath.entry` on the `from` floor and `stairPath.exit` on the `to` floor. Cost = the 3D polyline length.
- A stair with `fits === false` gets no link.

API:
- `path(nav, from, to)`
  - `from` / `to` are `{ fi, x, z }`: floor index plus plan x/y. **NB:** these keys are `x, z`, where `z` = plan y.
  - Returns `{ legs: [{ kind: 'walk', fi, pts: [{x, z}] } | { kind: 'stair', stair, from: fi, to: fi, pts: [{x, z, y}] }], length }`, or `null`.
  - Stair-leg `y` is the height above the `from` floor.
- `nearest(nav, {fi, x, z})` returns the nearest passable point `{fi, x, z}`.
- `roomAt(nav, {fi, x, z})` returns the room or `null`.
- `clearance(nav, {fi, x, z})` returns metres.
- `passable(nav, {fi, x, z})` returns a boolean.
- `rebuildFloor(nav, fi, items)` re-rasterises furniture after a move.
- `nav.floors[fi]` holds `{ id, elev, x0, z0, nx, nz, cell, grid, clear }`; `nav.stairs` holds `[{ stair, from, to, entry, exit, pts, length }]`.

Performance target: `buildNav` under 150 ms on semid2 with furniture; `path` under 20 ms.

**As built (U2) — additions, read these**

Stair legs:
- A leg's `from` / `to` are the floors walked from and to. Going down, `from` is the upper floor and the `pts` are reversed.
- Each point's `y` is measured from the leg's `from` floor, so it is negative when going down.
- So eye y = `floors[leg.from].elev + y + 1.55` holds in both directions.

Extra `nav` fields:

| Field | Value |
|---|---|
| `nav.door` | the main door: `{ id, kind, wall, piece, inward: ±1, cross, apron }`, or `null` |
| `nav.start` | `{ fi, x, z }`: a passable point 0.6 m inside the main door, at the panel centre for a slider; `null` if there is no door |
| per floor | `pass` and `reach` (`Uint8Array`); `grid` cells are 0 free / 1 structure / 2 furniture |
| `nav.stairs` | only the linked stairs |

Extra exports:
- `SKIP_KINDS` — kinds that never block: rugs, pendants, art, curtains.
- `wallBlocks(wall)`
- `doorCross(piece)` — the crossing point; for a slider, the panel centre clear of mullions. Use it in `entryPlan`.

Behaviour:

| Call | Behaviour |
|---|---|
| `nearest` | searches up to 4 m and prefers reachable cells |
| `path` | first snaps an unreachable from/to to the nearest reachable point; returns `null` only when there is no route |
| `rebuildFloor(nav, fi, allItems)` | takes the full item list and filters it by floor; it also redoes stair links and reachability |

`clearance` is continuous (interpolated). Use it for joystick sliding.

P2 (1.2 m outside the door) may land on porch furniture. Do not require P2 to be passable; P3 is.

### `walk/paint.js`, `walk/measure.js`, `walk/marks.js` (U2b)

`slotOfHit(hit)` takes a three.js intersection `{ object, face }`:
- material = `Array.isArray(object.material) ? object.material[face.materialIndex] : object.material`
- returns `material.userData.slot`
- `null` if the material is fixed (`userData.fixed`), glass, or has no slot
- never falls back to `object.userData.slot`

`floorSlotOf(roomType)` returns `'tile'` for wet rooms (`ROOM_TYPES[type].floor === 'tile'`), otherwise `'floor'`.

`measureText(a, b)` takes two `{x, y, z}` world points:
- distance in mm (rounded to 10)
- returns `{ mm, text }`, where `text = mmFt(mm)` from `shared/units.js`

`slotOfHit` also accepts `Engine.hitAt` results; it never uses `engine.slotAt`, which falls back to `'walls'`.

`wallDims(wall, ceil)` returns:
- `{ lengthMm, heightMm, text }`
- `text` = `t('{0} 长 · {1} 高', [...])` using `mmFt`
- The UI may show `lengthMm` and `heightMm` separately: the combined text repeats the · separator.
- As built, `marksOf(project)` and `MAX_MARKS` are exported.
- `mark.room` is a room id.
- Marks are kept oldest first.

Marks:
- `addMark(list, pose)` returns a new list.
- `pose` = `{ floor: id, x, z, yaw, pitch, hour, room }`.
- A mark = `{ id, floor, x, z, yaw, pitch, hour, room, at }`. Numbers are rounded (positions to 0.01, angles to 0.001). `at` = ISO date.
- At most 12 marks; the oldest is dropped.
- `removeMark(list, id)`.
- Marks are stored on the project as `walkMarks` (autosaved with the project; removed with the project by `shared/forget.js`).
- `packProject()` must NOT include `walkMarks`. Check `store.js`; add an exclusion if needed.

### `walk/tour.js` — pure part (U4)

`tourStops(plan, items, nav, offer = null)` returns `[{ id, fi, x, z, yaw, line }]`. With `offer = { materials, locked }` (the controller always passes it), a `tvWall` / `kitchenRun` / `wardrobe` is introduced only when `offerTagOf(kind, offer) === 'make'` — kept cabinets (`locked.cabinetry`) and painted / limewash / microcement TV walls are never claimed as 我们做. `offer = null` = no filtering (tests). Order:
1. entrance (just inside the main door)
2. living (+ TV wall, if a 'make' `tvWall` item exists in that room)
3. kitchen (if a 'make' `kitchenRun` exists)
4. master bedroom (+ wardrobe, if a 'make' `wardrobe` exists; otherwise the centre + walk.paint)
5. stairs, then upper-floor stops (if the plan is multi-floor and the stair link exists)
6. end

Rules:
- Every stop must be passable and reachable from the entrance.
- No stop in a stair or void room.
- `line` is a `voice-lines.js` id in the group `walk`.

**As built (U4) — read these**

Yaw convention, used everywhere (tour, flight, controller, marks):
- three.js Euler order `'YXZ'`.
- View direction in plan x/z is `(-sin yaw, -cos yaw)`.
- `yaw = atan2(-dx, -dz)`.
- `tour.js` exports `yawOf` and `yawToward`.

Stops:
- Each stop also has `room` (an id or `null`).
- Stop ids are `entrance`, `living`, `tv`, `kitchen`, `bedroom`, `stairs`, `upstairs`, `tip`, `end`.
- When the living room has a TV wall, `living` and `tv` share the TV viewing spot.

`createTour({ stops, walkTo, say, hush, halt, onStop, onState, onEnd, dwell, read, wait, now })` returns:
- `start(from) → Promise<reason>`, `stop()`, `next()`
- `running`, `index`, `current`, `total`, `stops`
- `state() → { running, index, total, stop, line, phase: 'walking' | 'talking' | 'idle' }`

The end reason is one of `'done' | 'stopped' | 'interrupted' | 'error' | 'empty'`.

`walkTo(stop)` must return `Promise<boolean>`: `true` after arriving and turning to `stop.yaw`, `false` if the guest took over (joystick / tap). Call `tour.stop()` on guest input.

`TourBubble` props: `{ ...tour.state(), onNext, onSkip, onStart }`. Classes for positioning are `.walk-tour` and `.walk-tour-start`. The tour starts by itself on the first walk-in, and after that only from the button.

Pixel harness notes (P0):
- Fixtures are in the stored `localStorage` shape; load them with `store.fromStoredProject()`.
- The harness clicks `[data-walk=enter]` / `[data-walk=exit]` with `el.click()`.
- It needs `window.__genieWalk`, `on('state', {phase})`, `pose() → {fi, x, z}`, and `walkTo() → Promise`.
- After exit, `engine.walk` and `engine.onTick` must be `null`.
- Nothing may change StudioApp's measured insets while walking: `setInsets` has 2 px hysteresis, and the boot estimate is top = 185 while a fresh measure gives 184.
- Do not add `Math.random` calls between creating the renderer and `setupComposer()`.

## 3 · three.js modules

### `walk/doors.js` (U3)

`doorList(navData)` lists the door pieces that house.js gives a leaf: kind `door`, width ≤ 1.3 m, and not on an outdoor-side wall (mirror the `house.js` rules exactly). Each entry: `{ fi, wall, piece, hinge: {x, z}, axis, width, closedAngle }`.

`createDoors(engine, navData)` returns `{ update(eye, pathAhead, dt) → bool changed, openAll(), dispose() }`.

On create:
- For every floor, build closed leaves with `house.doorLeaf`. Closed angle = 0 for axis `x`, −π/2 for axis `z`.
- Add them to `F.group`.
- Hide the merged meshes tagged `userData.doorLeaves`.

Swing:
- Open when the eye is within 1.6 m, or when the next 2 m of the path crosses the door.
- Close when the eye is beyond 2.2 m, after 3 s.
- Swing to 90°. With no path: **away from the walker's side**. With a path (as built after review): the leaf picks hinge end (a or b, `dir`) and side so the open leaf and its sweep keep ≥ 0.3 m from the eye and the path ahead (`pickLeaf` / `pickSide` / `leafRoom`); an open leaf that would block a new path flips or re-hangs (close, switch hinge, reopen) when that cannot hit the walker. A walker pushing an open leaf from behind (joystick) swings it away.
- The front door opens **outward** during the fly-in (`from: plan.P3`), so it never sweeps the entrance stop.
- Joystick / WASD treat open or moving leaves as thin walls (`doors.clearOf` in `slideMove` / `canStand`, radius 0.22).
- While the eye rises or falls on stairs (and 0.5 s after), a door with no path does not open.
- Ease about 0.45 s.
- `changed === true` while any leaf moves; the controller then sets `shadowMap.needsUpdate`.

Sliders: on the walker's floor, hide the glass mesh of a wall set (material `lib.fixed.glass`) when the eye is within 1.2 m of a slider piece. Restore it afterwards.

`dispose()`:
- Remove the leaves and restore visibility.
- Never dispose cached geometry (`geometry.userData.cached`).

### `walk/flight.js` (U3)

`walkFov(W, H)`:
- landscape: 62° vertical
- portrait: whichever is larger of 62° and the vertical FOV that gives ~70° horizontal, capped at 82°

`entryPlan(navData, nav)` returns either:
- `{ door, out: {x, z}, P1, P2, P3, yaw }` — world points `{x, y, z}`; or
- `{ fallback: { fi, x, z, yaw } }`

How it is built:
- The door is the main entrance from `furnish.mainEntrance`.
- "Outside" = the side without an indoor room (the porch / outdoor side counts as outside), not `wall.outward`.
- Points:
  - P1 = 3.2 m out, 2.2 m up
  - P2 = 1.2 m out, at eye height
  - P3 = 1.0 m inside, at eye height, passable
- For a slider, cross at the panel centre that avoids mullions.
- No main entrance → fallback = the centre of the largest living-type room.

`flyIn(engine, plan, hooks)` / `flyOut(engine, saved, hooks)` are promise-returning tweens driven from `engine.onTick`.

Fly in (~3 s total):
1. t0: walls up (via `setWalk`), upper floors visible.
2. P0 → P1: FOV goes from 28 to 48, then to `walkFov`; `vo` goes to 0.
3. P1 → P2: `hooks.openDoor()`.
4. P2 → P3: `hooks.ceilings(true)` when crossing the threshold.

Fly out: rise with the ceilings off, hide the floors above the walker, glide to the saved pose, then restore exactly (§4).

`prefers-reduced-motion`: a 250 ms fade to paper instead of either flight.

### `walk/marks3d.js` (U6)

- Target ring: `RingGeometry`.
- Path ribbon: `TubeGeometry` on a `CatmullRomCurve3`, 1.5 cm above the floor.
- Measure end-points: small spheres, plus a thin cylinder between them.
- `PALETTE` colours, `MeshBasicMaterial` with `depthTest` on.
- `dispose()` cleans up everything it built.

### `walk/controller.js` (U6)

`createWalk(engine, { project, api, wish, onEvent })` returns:

```
enter() → Promise          exit({ instant }) → Promise      dispose()
setTool(id)                 // 'walk' | 'paint' | 'floor' | 'furnish' | 'light' | 'measure' | 'photo'
joystick(x, y)              // -1..1 each; 0,0 stops
walkTo({ fi, x, z })        goFloor(fi)        pose() → { fi, floor, x, z, yaw, pitch, room }
project(v3) → { x, y, visible }    // screen px for DOM overlays
photo() → mark              goto(mark)
tour: { start(), stop(), next(), running }
on(evt, fn) → off           // events: 'state' {phase:'flying-in'|'walking'|'flying-out'|'out'}, 'pose',
                            // 'room' {room}, 'pick' {slot, matId, hit}, 'item' {id|null}, 'measure' {...},
                            // 'tour' {stop, line}, 'floor' {fi}
```

Input:
- Pointer events go on `engine.renderer.domElement`.
- Drag (more than 9 px on touch, 5 px on mouse) = look: yaw / pitch, with pitch clamped to ±1.2 rad.
- A tap is handled by the current tool. With the walk tool, a tap on the floor → `walkTo`; a tap on a door / stair area → walk there.
- Desktop: WASD / arrow keys; Q / E turn.

Motion:
- Walking speed 1.3 m/s; turning eased.
- The joystick moves relative to the view direction, with collision against the clearance map (slides along walls).
- Stair legs: interpolate along the polyline. Eye y = elev(from) + y + 1.55. At half the rise, call `setFloorView(toId, { instant: true, quiet: true })`.

Each tick:
- `camera.position` and `quaternion` follow the pose.
- `controls.target` = eye + 2.5 m forward.
- `engine.placeFill?.()` while moving.
- `doors.update()`.
- Set `engine.dirty`.

On room change:
- `engine.placeRoomLights({ x, z })`
- emit `'room'`

Furniture visibility: only the walker's floor shows its furniture (`F.furn.visible`), plus the adjacent floor while within 3 m of a stair or void.

Exposes `window.__genieWalk = controller` (for scripts).

## 4 · Enter / exit state (pixel-identical exit)

At enter, save: `{ pos, quat, target, vo, voTo, floorView, lastView, framed: isFramed(), W, H, insets: JSON }`.

Exit order:
1. `doors.dispose()`, restore slider glass and merged leaves.
2. `setCeilings(false)`, then `plasterEdges(engine, false)`: slab and wall edges back to the ink cap (§10, Plaster edges).
3. `setWalk(null)`.
4. `setFloorView(saved.floorView, { instant: true, quiet: true })`.
5. Restore camera position, quaternion and `controls.target` exactly; zero `controls._sphericalDelta` / `_panOffset` if present.
6. Restore `vo` / `voTo` if `W`, `H` and the insets are unchanged. Otherwise call `updateViewTarget(true)`, and if the view was framed, `frame(lastView, false)`.
7. `lastCut = null`, `highlightSlot(null)`, `onTick = null`, `dirty = true`.

Unmount and errors always do an **instant** exit.

## 5 · UI (U5a / U5b) — `src/studio/walk/*.jsx`, `walk.css`, `walk-tools.css`

`WalkMode.jsx` default export. Props: `{ engine, project, api, wish, staff, onExit }`.
- Imports `./words.js` first.
- Creates the controller on mount, calls `enter()` and `onExit()` after exit.

Layout:
- Top-left: 「回到全屋」 exit button.
- Top-right: `Minimap`.
  - SVG of the current floor's rooms, the walker dot and view cone, floor tabs.
  - Tap a point on the map → `walkTo`.
  - Collapsed to a ~120 px circle on phones; tap to expand.
- Bottom-left: `Joystick` (120 px pad).
- Bottom-centre / right: `ToolWheel`.
  - Tools: 走 / 刷颜色 / 地板 / 家具 / 灯光 / 量尺 / 拍照.
  - Opens the panel for the current tool.
- `TourBubble`: Pangie, a caption from `lineText(id)`, 下一站 / 跳过.

In Wish Mode the bottom-right ~288×60 belongs to the shell's capsule; keep it clear (`is-wish` class on the studio root).

Tools (U5b):

**`PaintTray.jsx`**
- Tap a surface → `slotOfHit` → `engine.highlightSlot(slot)`.
- The tray shows that slot's materials (same source as `MaterialDock`) by **name**, with a 我们做 tag where `offer.js` says so.
- Choosing one → `api.dropMaterial(slot, matId)`.

**`地板` (floor)** — opens the same tray for `floorSlotOf(room.type)` of the room the walker is in.

**`FurnishPanel.jsx`**
- Tap a piece of furniture → `itemAt` → select.
- Drag on the floor moves it (`groundAt`; snaps inside its room).
- Rotate 90° / remove.
- All changes go through `api.moveItem` / `rotateItem` / `removeItem`. After each one: `nav.rebuildFloor`, `shadowMap.needsUpdate`.

**`LightPanel.jsx`** — reuses `ui/SunArc.jsx` + day presets → `api.setTime(h)`; plus a night toggle.

**`MeasureLayer.jsx`**
- Two taps → the line and a label (`measureText`).
- Tap a wall → `wallDims`.
- Clear button.

**`PhotoPanel.jsx`**
- 「收藏这个角度」 → `controller.photo()` → `api.setMarks(addMark(...))`.
- List of marks: tap = `goto(mark)`; × removes.
- Staff only (`api.shoot` not null): 「下载这张」 → `api.shoot()`.

## 6 · StudioApp glue (U7)

- `const WalkMode = lazy(() => import('./walk/WalkMode.jsx'))`. Prefetch 4 s after `ready`, but not in showroom or demo.
- State: `walk` (bool); `is-walk` class on the root.
- `studio.css`: `.is-walk` hides `.mood-panel, .toolbar, .dock-wrap, .floor-switch, .callouts, .foot` and the compare overlay with `opacity: 0; visibility: hidden; pointer-events: none`. Layout is unchanged.
- Gold pill 「走进去」: `<button class="walk-pill" data-walk="enter">`. The exit button in WalkMode is `data-walk="exit"`; scripts click these.
  - Footprints icon (`kit.jsx` ICONS alias `walk`).
  - First child of `.dock-wrap`, centred above the material bar.
  - Hidden when not ready, in demo or showroom, or when the plan editor, compare or any modal is open.
  - On tap: `voice.unlock?.()`, `select(null)`, `setWalk(true)`.
- `api` object passed to WalkMode:
  - `dropMaterial(slot, matId)` → `applyMaterial`
  - `setTime`
  - `moveItem(id, {x, z})`, `rotateItem(id)`, `removeItem(id)` (through the existing furniture update + commit)
  - `undo`, `canUndo()` — false if the top history entry's plan ≠ the current plan
  - `flash(msg)`
  - `setMarks(list)` — `setProject` without a history entry
  - `shoot` — `WISH ? null : () => (existing snapshot download)`
- Guards while walking:
  - keyboard shortcuts → return
  - `scheduleThumbs` → defer until exit
  - an incoming `plan-file` message → exit walk first

## 7 · Voice (U4)

Add a `walk` group to `src/shared/i18n/voice-lines.js` with 8 Pangie lines in zh + en. Each line: at most 2 sentences, no emoji, no 您, no placeholders, `caption: 'bubble'`. Pangie names only 我们做 things.
- `walk.hello` — entrance: welcome, tap the floor to walk
- `walk.living` — living room
- `walk.tv` — TV wall we make
- `walk.kitchen` — kitchen cabinets and worktop we make
- `walk.wardrobe` — wardrobe we make
- `walk.stairs` — going upstairs
- `walk.paint` — tip: tap anything to change its colour
- `walk.bye` — end: tap 回到全屋 to fly back

Also update `test/voice.test.mjs`: count 45 → 53, and the group exists.

## 8 · Tests

All registered in `package.json` `test` with the `existsSync && import` pattern:
- `test/walk-nav.test.mjs`
- `test/walk-pure.test.mjs`
- `test/walk-doors.test.mjs`
- `test/walk-tour.test.mjs`
- `test/walk.test.mjs` (static guards)

What each one checks is in the approved plan (§ Tests).

Fixtures: `test/fixtures/walk/*.json`, frozen project snapshots made once from the templates by `scripts/walk-fixtures.mjs`.

## 9 · Scripts

**`scripts/chunk-size.mjs`**
- Gzips the `dist/assets` chunks at Vite's level.
- Prints the studio entry size, the walk chunk size, and the first-load total per entry.
- Compares against `scripts/chunk-baseline.json`.
- Exits 1 if the studio entry is over 397.5 kB.

**`scripts/walk-pixels.mjs`**
- Serves `dist` and drives `studio.html?staff=1` (plus `?mode=wish`) with Playwright.
- Seeds the fixture projects.
- Captures the canvas (DOM UI hidden) plus `insets` / `vo` JSON across a matrix of fixture × floorView × quality × viewport.
- Two modes:
  - `--save`: write the baseline.
  - `--check`: compare against the baseline. Mode **B** additionally compares before-enter with after-exit.

**`scripts/walk-e2e.mjs`** (I4; `npm run walk:e2e`)
- Drives the built app in the real browser with real mouse and keyboard input.
- Cases: condo3 staff, semid2 staff, condo3 `?mode=wish`.
- Covers:
  - enter and land;
  - the tour;
  - look-drag, tap-to-walk, minimap, joystick and keys into walls;
  - doors, stairs;
  - every tool, bookmarks;
  - exit, which must restore the camera within 1e-6;
  - re-entry.
- Writes `report.json` plus a screenshot per step.
- About 35 min on SwiftShader, so it is part of the release check, not `npm test`.

**`scripts/walk-shots.mjs`** (I5)
- Screenshots of every walk-in screen at 1180×820, 820×1180, 412×860 and 1440×900 in zh and en.
  - Staff screens use semid2; the Wish screens use condo3.
- `--sheets` rebuilds the contact sheets only.
- `report.json` lists layout problems: tap targets under 44 px, overlaps, things off screen, clipped text, and covering the toast spot or the Wish capsule.
- Mid-flight and mid-stairs shots freeze a scalable `requestAnimationFrame` clock (`window.__warp`).
- About 1 h with `--jobs 2`.

## 10 · As built in phase 1: read before phase 2

### Engine seam (U1)
- `setWalk(w)` does NOT call `setFloorView`. `flyIn` does that right after it, as `setFloorView(entryFloorId, {instant, quiet})`. Upper floors only un-hide, and `coverFrac` only becomes 1, after that call.
- While walking, `setFloorView` makes every floor's `F.furn` visible. Re-apply the "walker floor plus the neighbouring floor near stairs" furniture rule after each call. Then set `renderer.shadowMap.needsUpdate = true`. Do the same after ANY visibility change: furniture, doors, slider glass.
- The engine reads `walk.fov` and `walk.vo` only inside `applyView()`. After changing them, call `engine.applyView()`.
  - After changing `walk.pr`: `engine.applyPixelRatio() && engine.resize()`.
  - After changing `walk.ev`: `engine.renderer.toneMappingExposure = engine.day.exposure * walk.ev`.
- Four additions, each a no-op when `walk === null`:
  - `placeRoomLights()` with no argument reuses the last `near` while walking.
  - `setFloorView` skips its camera tween while walking.
  - Floors above the active one get the 'up' cutaway while walking.
  - The hover rAF returns early while walking.
- Studio entry is 396.95 kB gzip after phase 1. About 0.55 kB is left under the 397.5 kB limit. Do not add code to the entry chunk without asking the lead.

### Doors and flight (U3): how the controller uses them
1. `saved = saveOrbit(engine)` comes FIRST. `isFramed()` is always false once walking.
2. Build the pieces:
   - `nd = engine.navData()`
   - `nav = buildNav(nd, items)`
   - `plan = entryPlan(nd, nav)`
   - `doors = createDoors(engine, nd)`
3. `await flyIn(engine, plan, { walk: {ev, pr}, doors, tick })`.
   - `flyIn` calls `setWalk` and `setFloorView` itself.
   - It lands at `plan.P3` facing `plan.yaw`, or at `plan.fallback {fi, x, z, y, yaw}`.
   - It restores the previous `onTick` when done. Set your own `onTick` after the `await`.
4. Every tick: `if (doors.update(camera.position, remainingPathPointsOnThisFloor, dt)) shadowMap.needsUpdate = true`. `dt` is in seconds.
5. On resize: `walk.fov = walkFov(W, H); engine.applyView()`.
6. Exit with `await flyOut(engine, saved, { doors })`. For an instant exit (unmount, error), call `restoreOrbit(engine, saved, { doors })`. It also cancels any running flight and re-places the fill light.

Extras on `createDoors`: `open(opening, {fi, from, instant})`, `openAll(on)`, `leaves`.

Extra exports:
- `flight.js`: `EYE`, `WALK_FOV`, `frontDoor`, `clearHeight`, `cancelFlight`, `prefersReducedMotion`, `walkVo`, `fadeCanvas` (single in-flight canvas fade, restores a base opacity captured once).
- `doors.js`: `leafAngle`, `sideOf`, `doorDist`, `pathCrosses`, `levelOf`, `leafSeg`, `hingeTo`; `doorList` entries carry `dir` (1 = hinge at the a end as in bird's-eye, −1 = b end); `createDoors(...)` also has `clearOf(fi, x, z)`.

`entryPlan` also returns `approach` (descend outside the whole footprint first, to clear porch roofs) and `high`.

### App shell (U7)
- The WalkMode stub must be replaced by U5a. Keep three things:
  - `import './words.js'` as the FIRST import
  - a default export
  - a 「回到全屋」 button with `data-walk="exit"`
- Every selector in `src/studio/walk/*.css` must contain `walk`, for example `.walk-*`, `[data-walk]`, `.is-walk …` or `.is-wish .walk-…`. The chunk and its CSS are prefetched 4 s after ready, while the bird's-eye view is on screen.
- z-index:
  - The walk overlay root stays below 110.
  - `api.flash` toasts sit at the top centre: `safe-t + 60px`, or `+ 136px` on phones, at z 110. Keep that spot clear.
  - The confirm sheet and the lost-context overlay sit at 120.
- `api.dropMaterial(slot, matId)` goes through StudioApp's own drop path: fits check, confirm for a locked surface, deal-breaker warning. It returns a boolean.
- There is no `api.addItem`.
- `api.undo` / `api.canUndo()` and the furniture calls update the `project` prop. Watch `project.furniture`, then:
  - `nav.rebuildFloor`
  - re-apply the furniture visibility rule
  - `shadowMap.needsUpdate`
- StudioApp keeps calling `engine.setInsets` while walking: the bird's-eye UI stays mounted but hidden. `restoreOrbit` compares the engine's current insets and size at exit.

### Pixel harness
- The camera's `position`, `quaternion` and `target` are compared with a 1e-9 tolerance. An idle `OrbitControls.update()` flips them by 1 ULP every frame, and it did so before this work too.
- Images (hashes) must still match exactly.

### Controller (U6), as built
- `joystick(x, y)`: y > 0 = forward, x > 0 = right.
- `walkTo({fi, x, z, yaw?})` resolves `true` after arriving. If `yaw` is given, it resolves only after turning to it. It resolves `false` on interrupt or when there is no path.
- Extras:
  - `select(id|null)`, `clearMeasure()`, `resize()`
  - getters `tool`, `nav`, `wish`
  - exported helpers `slideMove`, `furnitureMask`, `floorAtY`, `changedFloors`, `angleDiff`, `TOOLS`, `SPEED`, `WALK_EV` (1.3 after I5), `walkEv(day)`
  - read-only getter `doors`: the `createDoors` result, or `null` when not walking (I4; used by walk-e2e)
- Events:

  | Event | Payload |
  |---|---|
  | `state` | `{phase}` |
  | `pose` | `pose()`, throttled to 100 ms |
  | `room` | `{room, id}` |
  | `floor` | `{fi, id}` |
  | `pick` | `{slot, matId, hit, room}` — `slot` is `null` for glass or fixed surfaces |
  | `item` | `{id}` |
  | `measure` | `{a, b, mm, text, wall}` — first tap: `b` is `null`, and `wall` holds dims if a wall was hit |
  | `tour` | `{stop, line}` |
  | `tourState` | `{…}` |
  | `error` | `{error}`, followed by an instant exit |
- Tour stops on: joystick, keys, walk taps, `goto`, `goFloor`, and a look-drag while walking. A look-drag while she is talking does not stop it.
- Furniture drag:
  - Only a drag that starts on the selected item moves it. Wall items don't move.
  - It snaps to 5 cm, clamps to its room, and makes one `api.moveItem` on release.
- `marks3d`: `createMarks(engine)` returns `{ target, path, progress, select, measure, clearMeasure, update, visible, dispose, group }`.

### WalkMode shell (U5a), as built
- Panels render in `.walk-panel-slot` above the tool wheel.
- `MeasureLayer` renders at the `.walk-ui` root (absolute, `pointer-events: none`). Its bar uses `bottom: var(--walk-panel-b)`.
- Every panel gets the same props: `{ctl, engine, project, api, wish, staff, room, fi, mode, onClose}`.
- The undo button lives in the shell, top-left. It shows only when `api.canUndo()`.
- Esc closes the open panel first, then exits.
- If a flight runs past 7 s, the exit button shows anyway.
- CSS hooks: `.walk-ui.is-live`, `.tool-<id>`, `.is-phone`, `--walk-panel-b`, `--walk-dock-h`.
- Studio entry is 397.04 kB after phase 2: the lazy chunk's CSS preload path and the export list for the walk stack. About 0.46 kB is left.

### Visual pass (I5) and follow-ups, as built
- **Exposure.** `walk.ev = walkEv(engine.day) = WALK_EV × (1 + 0.3 × night)`.
  - The controller re-applies it when the time changes, so night interiors read warm and lit rather than black.
  - Bird's-eye exposure is untouched.
- **Portrait framing.** `flight.walkVo(W, H)` shifts the principal point up by 10 % of the height in portrait; it is 0 in landscape.
  - `flyIn` lands on it and `fit()` re-applies it on resize.
  - Verticals stay vertical; the view shows more room and less ceiling.
- **Minimap.**
  - `MAP_SIZES` gains an `area` cap, so tall plans (semid2) grow taller instead of shrinking to a strip.
  - Floor tabs wrap (`text-wrap: balance`) instead of widening the map.
- **Layout.**
  - Portrait iPad (781–1023 px wide): panels and the measure bar keep clear of the joystick.
  - Phones: the joystick hides while a paint, floor, furnish, light or photo panel is open.
  - English chips are 80 px wide on phones.
  - The selected-item ring opacity is 0.5.
- **Tour bubble.** While walking to the first stop (`phase 'walking'`, no line yet) it shows 「跟我来…」 / "Follow me…", not an empty bubble.
- **Arrival facing.** `walkTo` without a `yaw` whose path changes floor ends by turning to face the centre of the arrival room (`faceRoom`), unless the walker is within 0.6 m of it.
  - Same-floor walks keep facing their walking direction.

### Review fixes (independent review, 15 confirmed findings), as built
- **Tour (owner rule).** See `tourStops(..., offer)` above: Pangie names only items tagged 'make'. The controller passes `{ materials, locked }` and marks the tour stale when either changes.
- **Joystick.** `joystick()` / key presses call `guest()` (tour stop + route halt) only when input goes from idle to active, so continuous stick movement no longer resets the speed.
- **Furniture drag.** Uses its own ray ∩ item-floor plane (`floorPoint`); a miss above the horizon or a hit > 15 m away keeps the last position; shadows update during the drag and on cancel.
- **Fades.** `goto` / `goFloor` share one in-flight fade (`fadeCanvas`); a second call joins it while fading out and is ignored while fading in, so the canvas can never stay at opacity 0.
- **Enter during a bird's-eye tween.** `saveOrbit` saves the tween's destination (`toP` / `toT`, quaternion via lookAt) and `framed` only if that destination is the framed pose; the no-tween path is unchanged (pixel checks).
- **Doors.** See Swing above (hinge end + side, re-hang, front door outward, leaves block the joystick).
- **StudioApp.**
  - The 走进去 pill is hidden and `enterWalk` refuses while a guest plan is being read; a read that finishes during a walk is parked in `afterWalk` and applied after exit (also the plan-file message).
  - A failed walk-chunk load is retryable (`WalkMode` is re-created with a fresh `lazy`), and the 「正在走进去…」 fallback has a 44 px 回到全屋 button.
- **WalkMode / layout.**
  - Enter failure shows 「走进去出了点问题，已回到全屋」 (`userExit` ref).
  - The phone map opens above the tour bubble and panels (`.walk-map.is-open { z-index: 1 }`, bubble hidden while open).
  - The minimap height is clamped to the space between its top and the tool wheel / viewport (`mapRoomH`).
  - Short landscape: panels left-aligned in the dock at 601–780 px, the tour bubble is capped below 回到全屋 and moves beside the joystick.
  - Wish mode at 561–600 × ≤ 420 uses the narrow-tablet arrangement.
  - `ensureWalkCss` re-adds the walk stylesheet when the `--walk-css` sentinel is missing (a failed CSS preload is never retried by Vite).
- **Known small leftover.** If the guest picks a new destination while standing inside an open leaf's swing area, the leaf sometimes cannot move without hitting them and the camera brushes through it. A random stress test hit this 1–3 times per 1,200 legs, about 10× fewer than before the fix. Follow-up idea: make path walking respect `doors.clearOf` like the joystick does.

### Route-following view (look-ahead), as built
- **Problem.** On auto-walks (tap-to-walk, minimap, tour) the yaw aimed at the next path vertex. At corners that vertex sits next to a wall or door jamb, so the screen was all wall for 0.5–1 s: the semid2 dog-leg stair landing, the upstairs master-bedroom door, and the wet kitchen.
- **Carrot.** `follow()` now aims at the point `AHEAD` = 1.5 m ahead along the remaining route (`aimAt`, horizontal x/z only).
  - The march goes from P through `leg.pts[R.pi…]`, then into the next legs from `pts[1]`, the same way `advance` does. After `R.cut` it stops at the end of the current stair leg.
  - On a stair leg the carrot is first taken `AHEAD_STAIR` = 2.0 m ahead within that leg only. Near the top of a U-stair's first flight she is already turning to the next flight. If less than 2 m of the stair leg is left, the normal 1.5 m carrot is used.
  - When less than 1.5 m of route is left, the carrot is the end point, so the final approach looks along the last segment.
  - In the last `END_EASE` = 0.4 m (the last half on routes shorter than 0.8 m), the turn gain fades to 0. Paths often end with a short kink (A* cell centre → the real goal), and following it would jerk the head right as she stops.
  - The arrival turn (`R.yaw` / `faceRoom`) is unchanged.
- **Line of sight.** On a walk leg, the carrot is clipped to what the eye can see.
  - `sees` checks that the straight eye→point line keeps at least `SEE` = 0.12 m from walls and furniture. It samples nav clearance every 10 cm. The first segment that fails is bisected 5 times.
  - Not checked: the segment underfoot, stair legs, and the next legs.
  - At most `SEE_MAX` = 160 samples per frame. Measured: mean 9, max 109. Over budget counts as hidden, so the carrot just moves nearer.
- **Lead limit.** The view leads the walking direction (toward the next vertex) by at most `LEAD` = 1.2 rad.
  - While the carrot is still on the current stair leg, the limit is `LEAD_STAIR` = 2.0 rad. On a U-stair landing she looks round to the next flight instead of staring at the landing wall.
  - Once the carrot has left the stair, the limit is back to `LEAD`. Without that, the head jerks back as she steps off the stair.
- **Speed.** `face` compares the yaw with the movement direction. She walks at full speed within `SIDE` = 0.45 rad, then slows along a cosine to ×0.25 at 90°, so she never crabs sideways fast.
  - On stairs she slows to no less than `FACE_STAIR` = ×0.65. At ×0.5, semid2 stair routes took 8 % longer.
- **Unchanged.** The positions walked, stair pitch, `R.free` (after a look-drag: no auto-yaw, no slowdown, no arrival turn), `halt()` / `R.cut`, `go()` queuing, the tour, the joystick and the keys.
- **Measured.** Scratch metric over all 5 templates: 975 routes (room-to-room, stair and tour legs), dt = 1/30. The centre ray is tested against `wallBlocks`, skipping the first 0.3 s and the arrival turn.
  - Wall stare under 0.8 m: 5,917 → 412 frames (1.84 % → 0.12 %).
  - Excluding each route's last metre: 5,414 → 0 frames; longest stretch 15 → 0.
  - What remains are final approaches to spots next to a wall (terrace2 corridor and foyer, condo3 balcony).
  - On stairs, frames where the median of 7 rays (±30°) hits a wall within 1.6 m: 17.6 % → 0.2 %.
  - Head swing in the last 0.3 m: max 1.26 → 0.39 rad.
  - Total route time +2.3 % (median +0.4 %, at most +7.5 %; semid2 stair routes +4.9 %).
  - Real app (semid2, 1180×820, living room → wet kitchen → upstairs master bedroom): mid-route frames within 1.2 m of a wall 17 → 0. On the U-stair landing the next flight comes into view about 0.7 s sooner.
- **Tests** (`walk-controller.test.mjs`):
  - On an L route the turn starts at least 0.6 m before the corner (measured 1.08 m), the path is unchanged, and there is no fast crabbing.
  - An explicit `yaw` ends exactly, on the same floor and via stairs.
  - A look-drag stops auto-yaw.

### Plaster edges inside (black wedge on the stair), as built
- **Problem.** Near the top of the semid2 stair the walker looked up through the stair hole and saw a black wedge. It was the exposed edge of the upper floor slab. `floors.js` `plateMesh()` gives every exposed slab edge `houseKit(lib).cap`, the dark ink "section cut" (`mixC(ink, plinth, 0.4)`) that makes the bird's-eye cutaway read like an architectural model. Confirmed in the real app by turning that one material magenta: the wedge, the slab band under the void rail and the slab edge seen from the porch all turned magenta.
- **Other cap faces seen from inside.** The merged wall bodies (`house.js` `wallBox`: top face and bottom face are cap; only window sills already use the wall material). From eye height that means a dark strip under every door head and window head, and the underside of the wall drops beside the stair hole. Wall tops are hidden under the ceilings. Nothing else in a floor uses it: porch roofs, rails, frames and stairs use other materials. The trees (plinth group) also use cap but are not part of the interior. `lib.fixed.cap` (furniture feature-wall backing) is a different, deliberate material.
- **Fix** (`walk/plaster.js`, walk only; the engine is untouched):
  - `plasterEdges(engine, true)` gives every mesh under `F.shell.group` and every `F.plate` a NEW material array with the cap slot replaced: slab → `lib.fixed.ceiling` (same as its underside), wall body (`userData.slot === 'walls'`) → `lib.slot('walls')` (same as the jambs, so painting the walls repaints the soffits too). The cap material and the original arrays are never mutated. The cap is recognised by its `userData.fixed === 'cap'` tag, excluding `lib.fixed.cap`. Furniture (`F.furn`) and the plinth are not traversed.
  - `plasterEdges(engine, false)` puts back the exact original `material` references (only on meshes still carrying the array we set).
  - When: `flyIn`'s `ceilings(true)` (the walker is already through the door, so from outside the model keeps its ink cut lines). Restored in `flyOut` right after `setCeilings(false)` and in `restoreOrbit` (§4 step 2), so every exit path (fly out, reduced motion, instant, error, unmount, cancelled fly-in) restores before the bird's-eye view is back. Mode B stays pixel-identical.
  - Reduced-motion race (found in review): `flyIn`'s fade path queues its swap (open door, unhide, `ceilings(true)`, land) behind the 125 ms fade-out. An instant exit in that window (WalkMode unmounting) used to run `restoreOrbit` first and then the swap, leaving ceilings, plaster and a moved camera in the bird's-eye view. Now the fade fly-in registers a token in `flight.js` (`pendingIn`); `cancelFlight` (called first by `restoreOrbit`, `flyOut` and every new flight) voids it, the swap returns early and `flyIn` resolves `'cancelled'`.
  - Rebuilds: the engine does not rebuild floor meshes while walking. Paint is `lib.apply` in place, floor switches are layers/visibility, `setFurniture` rebuilds only furniture, and `setScene` cannot run (undo of a plan change and guest-plan reads are deferred until exit). As a safety net the controller calls `plasterEdges(engine)` every frame: if `engine.floors` is a new array it restores the old records and plasters the new floors; otherwise it is one comparison.
- **Tests** (`walk-plaster.test.mjs`): fake meshes for apply / idempotent apply / exact restore / a mesh changed by someone else; the engine glue (furniture untouched, rebuild case, no-op on fake engines); a real `buildStack` for semid2 and terrace2 (no cap face left in any shell or slab, `K.cap` unchanged, every mesh's material `===` the original after restore); `flyIn` / `flyOut` / `restoreOrbit` wiring; the reduced-motion race above with both the UI fade hook and the real `fadeCanvas`.
