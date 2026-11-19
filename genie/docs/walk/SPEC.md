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

`tourStops(plan, items, nav)` returns `[{ id, fi, x, z, yaw, line }]`. Order:
1. entrance (just inside the main door)
2. living (+ TV wall, if a `tvWall` item exists in that room)
3. kitchen (if a `kitchenRun` exists)
4. master bedroom (+ wardrobe, if a `wardrobe` exists)
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
- Swing to 90° **away from the walker's side**.
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
2. `setCeilings(false)`.
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
