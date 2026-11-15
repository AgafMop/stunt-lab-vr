# פעלול אחרון — Milestone 1 (Spike) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable spike, published as a site: a placeholder desert with a braking strip, a director's tower, one brake test driven by the tested science model (with optional ride-along), and a short race with real steering in two views (in-car cockpit / tabletop RC). The user checks it in the headset for driving comfort before anything else is built.

**Architecture:** The vr-lab-builder template (three r170 + WebXR, ES modules, no build step), copied into the project. All physics that the student measures lives in pure, Node-tested modules (`model.js`, `carSim.js`, `track.js`, `wheel.js`). The browser layer (scene, drive input, views, chapters) only animates what the pure modules compute. Placeholder geometry keeps the node-name contract, so Blender art drops in later (milestone 5).

**Tech Stack:** three@0.170.0 (import map, jsDelivr), WebXR, node --test, Playwright (swiftshader), http-server.

**Spec:** `docs/specs/2026-11-15-stunt-lab-design.md` (§6 science notes, §9 build, §10.1). Template docs: `~/.claude/skills/vr-lab-builder/` (SKILL.md, references/architecture.md, testing.md, vr-rules.md, lessons.md). Read them before Task 1.

## Global Constraints

- three **0.170.0** exactly. The installed gamedev skills target r187: no `THREE.Timer` from core, no `Object3D.dispose()`, `RGBELoader` not `HDRLoader`, no EffectComposer in XR, no render-on-demand.
- Science: `g = 9.8`; μ = `{ dry: 0.75, wet: 0.45, sand: 0.35, oil: 0.15 }`; `d_r = v·t_r`; `d_b = v²/(2μg)`; distance noise ±3 % (sd 1.5 %, clipped); gate speed ±1–2 km/h of the target.
- Every number the student sees comes from `src/game/model.js` (never from the race physics).
- Comfort: the view never rolls or pitches with the car (yaw only); no camera shake or zoom punches; only student-driven turns in the cockpit; ride-along = straight line only; a fade on every view switch; no strobing.
- Budget per chapter: ≤ 150 draw calls, ≤ 400 K triangles (`window.__budget`); target 72 fps on Quest 3.
- Hebrew RTL UI, no typing anywhere, ≤ 15 words per narration line, subtitles for every line, numbers with units wrapped in `⁦…⁩`.
- `SAVE_KEY = 'stuntlab.v1'`; serve port **8081** (the oxygen lab uses 8080).
- Every chapter await goes through `scope`; every created object through `scope.add`/`board`; every choice has an `?auto` answer.
- URL flags added by this plan: `?ride=on|off` (force view mode for the class), `?fx=drive` (drive sandbox), `?fx=brake` (one brake run).

## Review Focus

1. **Trigger already held when the start lights go out** (left over from clicking the previous card) → must count as a false start, never as a 0 ms reaction. Test in Task 2.
2. **The student lets go of everything mid-lap** (no throttle, no brake, no steer) → the car coasts to a stop in a straight line, no spin, no drift. Test in Task 3.
3. **A frame hiccup on the Quest** (dt = 0.25 s) → the fixed-step sim gives the same result as 30 steps of 1/120 s, and the car never tunnels past a soft barrier. Test in Task 3.
4. **Driving far off into the desert** → after 3 s off the track (sand) the car fades back onto the nearest track point, facing along the track. Test in Task 4.
5. **No controllers in XR (hand tracking only) or a controller with no thumbstick** → drive input reads zeros instead of throwing, and the race shows "pick up the controllers". Test in Task 6.

---

### Task 1: Project from the template, boots green

**Files:**
- Create: everything from `~/.claude/skills/vr-lab-builder/assets/template/` into the project root
- Modify: `index.html` (`{{TITLE}}` = `פעלול אחרון`, `{{ONE_LINE_STORY}}` = `יועץ/ת הפיזיקה של אולפן פעלולים: הרכב חייב לעצור בדיוק על שפת הצוק.`, `{{PAGES_URL}}` left as placeholder until Task 9), `src/game/config.js` (`SAVE_KEY`, `METER`), `package.json` (`serve` → `-p 8081`), `playwright.config.js` (baseURL/webServer port 8081)

- [ ] **Step 1:** Copy the template, `git init`, add `.gitignore` from the template, keep the existing `docs/` and `.claude/` folders.
- [ ] **Step 2:** Set `METER = { label: '☀️', start: 180, low: 30 }` (game-minutes until sunset), `SAVE_KEY = 'stuntlab.v1'`, port 8081.
- [ ] **Step 3:** Run `npm install && npx playwright install chromium`, then `npm test` and `npx playwright test -g "boots"`. Expected: all pass, no console errors.
- [ ] **Step 4:** Commit `chore: project from vr-lab-builder template`.

### Task 2: Science model (stopping distance + reaction)

**Files:**
- Modify: `src/game/model.js` (replace `trueResponse`, `sampleTrial`, `cleanValues`, `bestX`; keep `makeRng`, `gauss`, `mean`, `findOutliers`)
- Test: `tests/model.test.js` (replace the template's model tests inside `tests/game.test.js` with this file; keep the state tests)

**Interfaces — Produces:**
- `G = 9.8`, `MU = { dry, wet, sand, oil }`
- `kmhToMs(kmh: number): number`
- `reactionDistance(kmh: number, tr: number): number`
- `brakingDistance(kmh: number, surface = 'dry'): number`
- `stoppingDistance(kmh: number, tr: number, surface = 'dry'): number`
- `sampleRun(targetKmh: number, surface: string, rng, { sprinkler = false } = {}): { kmh: number, distance: number }`: gate speed = target + gauss·0.7, clipped to ±2, rounded to 1 km/h; distance from the **gate speed**, noise sd 1.5 % clipped to ±3 %, rounded to 0.5 m. `sprinkler: true` brakes this run on `'wet'`.
- `cleanRuns(targetKmh, surface, rng, n = 3): {kmh, distance}[]`: no outlier per `findOutliers` on distances.
- `classifyStart(pressMs: number | null, lightsOutMs: number, heldAtLightsOut: boolean): { kind: 'ok' | 'false' | 'none', reaction: number | null }`: `'false'` if held at lights out or pressed < lightsOut + 100 ms; reaction in seconds.

- [ ] **Step 1: Write the failing tests** in `tests/model.test.js`:
  - `brakingDistance(50) ≈ 13.1` and `brakingDistance(100) ≈ 52.5` (±0.1)
  - `brakingDistance(2*v) / brakingDistance(v) === 4` for v in [30, 40, 60] (±1e-9)
  - order: dry < wet < sand < oil at 70 km/h
  - spec §7 final stunt: `stoppingDistance(70, 0.7, 'wet') ≈ 56.5` (±0.3), `reactionDistance(70, 0.7) ≈ 13.6` (±0.1)
  - `sampleRun` 500× at 60 dry: every distance within ±3 % of `brakingDistance(kmh)` (+ rounding 0.25), every `|kmh − 60| ≤ 2`
  - `cleanRuns` never flagged by `findOutliers`; a set of 2 clean + 1 `sprinkler` run at every target in [20…120 step 10] **is** flagged at the sprinkler index
  - same seed → identical `cleanRuns` output
  - `classifyStart(null, 1000, true).kind === 'false'`; `classifyStart(1050, 1000, false).kind === 'false'`; `classifyStart(1250, 1000, false)` → `{ kind: 'ok', reaction: 0.25 }`; `classifyStart(null, 1000, false).kind === 'none'`
- [ ] **Step 2:** `npm test` → the new tests FAIL.
- [ ] **Step 3:** Implement the interfaces above in `src/game/model.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(model): stopping distance, surfaces, sprinkler, start classification`.

### Task 3: Car simulation (pure)

**Files:**
- Create: `src/game/carSim.js`
- Test: `tests/carSim.test.js`

**Interfaces — Consumes:** `MU`, `G`, `kmhToMs` (Task 2). **Produces:**
- `brakeProfile(v0: number /* m/s */, mu: number): { stopTime: number, stopDist: number, at(t: number): { x: number, v: number } }`: constant deceleration μg from the gate (used by scripted runs; `stopDist` must equal `brakingDistance` for the same speed).
- `CAR = { maxSpeed: 25, accel: 6, coast: 0.8, wheelbase: 2.6, maxSteer: 0.5 }`
- `createCar({ x = 0, z = 0, heading = 0 } = {}): Car` with `Car = { x, z, heading, speed, steer, offTrack: 0 }` (heading 0 = +z forward in three coordinates; document the convention at the top of the file).
- `stepCar(car: Car, input: { throttle: 0..1, brake: 0..1, steer: -1..1 }, h: number, surface: string): Car` (mutates and returns): with throttle 0 the deceleration is `max(brake·MU[surface]·G, coast)` (full brake = exactly μg, so the race brakes like the model); curvature from the bicycle model `tan(steer·maxSteer)/wheelbase`, **clamped so v²·|κ| ≤ MU[surface]·G** (understeer: the car goes straighter than asked); speed never negative.
- `createStepper(step: (h) => void, h = 1/120, maxSub = 30): (dt: number) => void`: accumulator, at most `maxSub` substeps per call.

- [ ] **Step 1: Write the failing tests:**
  - `brakeProfile(kmhToMs(80), MU.dry).stopDist` equals `brakingDistance(80)` (±1e-6); `at(stopTime).v === 0`; `at(t)` beyond `stopTime` stays at `stopDist`
  - full brake from 80 km/h on dry with `stepCar` at h = 1/120 stops within 1 % of `brakingDistance(80)`
  - **Review Focus 2:** from 60 km/h, zero input → speed reaches 0, `|heading change| < 1e-6`, path straight
  - understeer: at 25 m/s with full steer on `'wet'` the turning radius ≥ v²/(MU.wet·G); at 8 m/s on `'dry'` the radius equals the bicycle radius (±2 %)
  - **Review Focus 3:** one `stepper(0.25)` call produces the same car state as 30 calls of `stepCar(…, 1/120, …)` (±1e-9)
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/game/carSim.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(sim): brake profile, bicycle car with friction limit, fixed stepper`.

### Task 4: Race track (pure)

**Files:**
- Create: `src/game/track.js`
- Test: `tests/track.test.js`

**Interfaces — Produces:**
- `TRACK_DEF = { points: [[x, z], …] /* closed loop, ≈ 450 m, a straight + 3 corners; the 2nd corner is the wet one */, width: 10, wet: [s0, s1] /* arc-length range covering corner 2 */, start: { s: 0 } }`
- `buildTrack(def): Track` where `Track = { length, sample(s) → { x, z, tx, tz }, nearest(x, z) → { s, dist } }` (Catmull-Rom through the points, arc-length table)
- `surfaceAt(track, x, z): 'dry' | 'wet' | 'sand'`: `'sand'` when `dist > width/2`; `'wet'` when `s` is inside `wet`
- `respawn(track, x, z): { x, z, heading }`: the nearest centreline point, heading along the tangent
- `OFFTRACK_RESPAWN_S = 3`

- [ ] **Step 1: Write the failing tests:** the loop closes (`sample(0)` ≈ `sample(length)`); `length` within 400–500 m; a point on the centreline gives `dist < 0.05`; a point 7 m sideways gives `'sand'`; the midpoint of `wet` gives `'wet'`; **Review Focus 4:** `respawn` of a point 40 m off the track lands on the centreline (`dist < 0.05`) with a heading within 0.01 rad of the tangent; a full lap at 15 m/s driven by a pure-pursuit helper in the test with `stepCar` stays `!== 'sand'` everywhere (proves the track is drivable at a calm speed), while 25 m/s into the wet corner with the same helper ends in `'sand'` (proves the teaching failure happens).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/game/track.js` (choose the points so both lap tests hold; tune the wet-corner radius, ≈ 35–45 m).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(track): loop track, surfaces, respawn`.

### Task 5: Placeholder desert set + steering-wheel math

**Files:**
- Create: `src/lab/stuntScene.js` (replaces the use of `labScene.js` in `main.js`; keep `labScene.js`'s `BUILT`/`TUNE` pattern and env handling)
- Create: `src/game/wheel.js`; Test: `tests/wheel.test.js`
- Modify: `src/main.js` (load `loadStuntSet`, register stations `tower`, `pit`)

**Interfaces — Produces:**
- `loadStuntSet(engine): Promise<{ root, anchors, stationNodes, env, strip: { gate: Object3D, rulerZero: Vector3, dir: Vector3, markAt(m) → Object3D }, track3d: Object3D, makeCar(color) → Object3D /* with child 'seat' empty and 'wheel' mesh */, table: Object3D /* tabletop anchor for the RC view */ }>`
- Node names: `ST_tower` (yaw facing the strip), `ST_pit`, `A_board`, `A_radar`, `A_clapper`, `A_table`, `STRIP_gate`, `STRIP_ruler`.
- Placeholder look: sand-coloured ground (one large plane), `scene.fog` for distance, a 120 m asphalt strip with ruler ticks every 0.5 m, numbered every 5 m (canvas texture, numbers readable at the tower distance per `ui.minPx`), the gate as two posts with a red line, a 6 m tower with a chair, the track as a ribbon mesh from `track.js` (wet section darker), a cliff edge block at the end of the strip, sky gradient. Total < 150 draw calls (merge the ruler ticks into one mesh).
- `wheelAngle(left: [x, y, z] | null, right: [x, y, z] | null, prevAngle: number, center: [x, y, z], normal: [x, y, z]): number`: steering angle in radians from the hand positions projected on the wheel plane; one hand = rotation of that hand around the centre relative to its grab point (keep the grab offset in a small state object `createWheelGrip()` → `{ grab(side, pos), release(side), angle(left, right) }`); clamped to ±2.5 rad (≈ ±140°); steer input = angle / 2.5.

- [ ] **Step 1: Write the failing wheel tests:** two hands at 9 and 3 o'clock rotated by +30° → `+0.524` (±0.01); one hand grabbed at 12 o'clock moved to 1 o'clock → `−0.524` or `+0.524` per the documented sign (steer right = positive); both released → angle eases back toward 0 by ≥ 50 % within 0.5 s of `angle()` calls at 1/72 s; clamp at ±2.5.
- [ ] **Step 2:** `npm test` → FAIL; implement `src/game/wheel.js`; `npm test` → PASS.
- [ ] **Step 3:** Build `stuntScene.js`; wire it into `main.js`; adapt the template's "boots" e2e test to teleport `tower` ↔ `pit`.
- [ ] **Step 4:** Run `npx playwright test -g "boots"` → PASS, no console errors; save screenshots `tower.png`, `pit.png` and **look at them** (ruler numbers readable from the tower, nothing floating).
- [ ] **Step 5:** Commit `feat(set): placeholder desert set, strip, track ribbon, wheel math`.

### Task 6: Drive input + the two views + comfort vignette

**Files:**
- Create: `src/core/driveInput.js`, `src/core/driveView.js`, `src/fx/vignette.js`
- Modify: `src/main.js` (`?fx=drive` route: put the student in a car on the track and let them drive, no chapter)
- Test: `tests/e2e/drive.spec.js`

**Interfaces — Consumes:** `createCar`, `stepCar`, `createStepper` (Task 3), `buildTrack`, `surfaceAt`, `respawn` (Task 4), `makeCar`, `table`, `track3d` (Task 5), `createWheelGrip` (Task 5). **Produces:**
- `createDriveInput(engine, input, { wheelMesh }): { read(): { throttle, brake, steer, controllers: boolean }, anyTriggerHeld(): boolean, dispose() }`
  - XR: right trigger (`buttons[0]`) = throttle, left trigger = brake, steering = wheel grip when either grip (`buttons[1]`) is held on the wheel, else left thumbstick x (`axes[2]`, fallback `axes[0]`), deadzone 0.12.
  - Desktop: W/↑ throttle, S/↓ brake, A/D/←/→ steer (eased 0→1 in 0.15 s).
  - **Review Focus 5:** no input sources, or a gamepad without axes → `{ throttle: 0, brake: 0, steer: 0, controllers: false }`, never throws.
- `createDriveView(ctx, { car3d, track3d, table }): { mode: 'cockpit' | 'table', setMode(mode): Promise<void> /* fade 180 ms */, update(car: Car, dt: number), dispose() }`
  - `cockpit`: the rig follows the car's `seat` empty: position + **yaw only**; a static cockpit frame (dashboard bar, A-pillars, the wheel) parented to the car; the student's own head moves freely inside.
  - `table`: `track3d` + a copy of the car shown at scale 1:40 on `A_table` in front of the tower chair; the rig stays at `ST_tower`; the full-size world is hidden while in this mode.
- `createVignette(engine): { set(level: 0..1) }`: a camera-attached ring, opacity eased; driven from yaw rate (`level = clamp((|yawRate| − 0.4) / 1.2, 0, 0.6)`) and |longitudinal accel| > 4 m/s² in cockpit mode only.
- Mode rules: initial mode from `?ride=on` → cockpit, `?ride=off` → table, else the student's choice (Task 7). Toggle at any time with key **V** / controller **X** button (`buttons[4]` left), unless `?ride=off` forces table.

- [ ] **Step 1: Write the failing e2e test** `drive sandbox: both views, toggle, no errors`: boot `?fx=drive&ride=on`, hold W for 3 s via `page.keyboard.down('KeyW')`, assert `__ctx.drive.car.speed > 5`; the rig's world position is within 1 m of the car seat; the rig's world quaternion has zero roll and pitch (|x|,|z| Euler < 1e-6); press V → `__ctx.drive.view.mode === 'table'` and the head is at the tower station (< 0.3 m); `__ctx.drive.input.read()` with no XR returns `controllers: false`; `window.__budget` ≤ 150 draw calls; no console errors. Screenshots `cockpit.png`, `table.png`.
- [ ] **Step 2:** `npx playwright test -g "drive sandbox"` → FAIL.
- [ ] **Step 3:** Implement the three modules and the `?fx=drive` route (expose `ctx.drive = { car, view, input }` under `?test`). The car sim runs through `createStepper` inside `engine.onFrame`; the respawn after `OFFTRACK_RESPAWN_S` fades out/in.
- [ ] **Step 4:** Run the test → PASS. **Look at both screenshots**: horizon level, cockpit frame visible, tabletop track readable and inside reach (~0.6 m).
- [ ] **Step 5:** Commit `feat(drive): drive input, cockpit and tabletop views, comfort vignette`.

### Task 7: Race chapter — view choice, start drill, one lap

**Files:**
- Create: `src/chapters/ch_race.js`
- Modify: `src/game/config.js` (`CHAPTERS = ['race', 'strip', 'end']`, `START_DRILLS = 3`, `LIGHTS = { count: 5, stepMs: 700, holdMinMs: 800, holdMaxMs: 2500 }`), `src/main.js` (`CH`, `CH_NAMES`, `seedFor`, `skipFill`), `src/game/script.js` (lines below)
- Test: `tests/e2e/race.spec.js`

**Interfaces — Consumes:** Tasks 2–6. `classifyStart` (Task 2). **Produces (state for later chapters):** `game.s.flags.view` (`'cockpit' | 'table'`), `game.s.reaction = { simple: number[] /* seconds, valid starts only */, falseStarts: number }`, `game.s.flags.wetCornerExit` (boolean).

Flow (spec §6 chapter 1, spike version):
1. Unless `?ride` forces it, two picture cards: "בתוך הרכב" / "שלט רחוק" (`?auto` picks cockpit). Store `flags.view`.
2. Start drill × `START_DRILLS`: five red lights on a gantry in view (in cockpit: above the dashboard; table: above the tabletop), one per `stepMs`, then hold a random `holdMinMs…holdMaxMs` from the seeded rng, then all out. Record via `classifyStart` (held trigger at lights-out → false start, **Review Focus 1**). A false start: lights flash slowly red (≤ 3 dips/s via `fx/flicker.js`), say `race_falsestart`, the drill repeats (does not count). Show each valid time in ms on a small board. `?auto`: press 250 ms after lights-out.
3. One lap against a ghost car "Bumper" (a coloured box following the centreline at 14 m/s). When the student's car enters the wet section above 18 m/s and then becomes `'sand'` → say `race_wetcorner` once, set `flags.wetCornerExit = true`; respawn as in Task 6. `?auto`: drive with the pure-pursuit helper from the Task 4 test at 15 m/s (move it to `src/game/autopilot.js` and export `autopilot(car, track, targetSpeed): input`).
4. Finish line → say `race_done`; fade to the tower.

Script lines (≤ 15 words each, speakers `dana`, `bumper`):
- `race_choose` (bumper): "איך נוהגים היום? מתוך הרכב, או בשלט מהמגדל?"
- `race_lights` (bumper): "חמישה אורות אדומים. כשכולם כבים — גז!"
- `race_falsestart` (bumper): "זינוק מוקדם! תגובה לפני האות היא ניחוש, לא זמן תגובה."
- `race_go` (dana): "מבחן קבלה. הקפה אחת. תראו לי מה אתם שווים."
- `race_wetcorner` (bumper): "הרכב לא נזרק. הוא המשיך ישר — לכביש הרטוב לא היה כוח לסובב אותו."
- `race_done` (dana): "מהירים. אבל לא יודעים איפה לבלום. בואו נלמד."

- [ ] **Step 1: Write the failing e2e test** `race: choice, three valid starts, lap completes`: boot `?only=race&auto&fresh&seed=42`, wait for chapter end; assert `flags.view === 'cockpit'`, `reaction.simple.length === 3`, each in 0.2–0.4 s, `falseStarts === 0`; a second test with `&forcefalse` (a test-only flag that makes auto hold the trigger before lights-out once) asserts `falseStarts === 1` and still 3 valid starts. No console errors, `textAudit` empty, `motionAudit` empty.
- [ ] **Step 2:** Run `npx playwright test -g "race"` → FAIL.
- [ ] **Step 3:** Implement `ch_race.js`, `autopilot.js`, config, script lines, and the main.js wiring (`seedFor('race')` = nothing; `skipFill('race')` = 3 simple reactions of 0.28 s and `view: 'table'`).
- [ ] **Step 4:** Run → PASS. Screenshot the lights gantry in both views and **look at it**.
- [ ] **Step 5:** Commit `feat(race): view choice, start-light reaction drill, lap with wet corner`.

### Task 8: Strip chapter — one brake test, ride-along option

**Files:**
- Create: `src/chapters/ch_strip.js`
- Modify: `src/main.js` (`?fx=brake` route = this chapter with fixed 60 km/h), `src/game/script.js`, `src/game/config.js` (`RUN_COST = 5`)
- Test: `tests/e2e/strip.spec.js`

**Interfaces — Consumes:** `sampleRun`, `brakeProfile`, `kmhToMs` (Tasks 2–3), `strip`, `makeCar` (Task 5), `createDriveView` cockpit mode for ride-along (Task 6). **Produces:** `game.addTrial(kmh, distance)` per run; `game.s.flags.rodeAlong`.

Flow (spike version of spec §6 chapter 4, one speed, one repeat):
1. At `ST_tower`: three speed cards 40 / 60 / 80 km/h (`?auto` → 60), then a "ride along with Bumper?" yes/no card (`?auto` → no; `?ride=off` hides it).
2. Clapper click → `game.spend(RUN_COST)`; `sampleRun(target, 'dry', rng)` decides `{ kmh, distance }`; the car accelerates (eased) to `kmh` before the gate, crosses the gate, and follows `brakeProfile(kmhToMs(kmh), MU.dry).at(t)` exactly, so it stops at `rulerZero + dir·distance`.
3. Ride-along: cockpit view on the passenger seat during the run, straight line only, fade back to the tower after the stop.
4. The radar board shows `kmh`; the student clicks the ruler number nearest the front wheel; the board shows the reading. `?auto` reads correctly.
5. `game.addTrial(kmh, distance)`; say `strip_done`.

Script lines: `strip_pick` (dana): "בחרו מהירות לנסיעת המבחן." · `strip_ride` (bumper): "רוצים לשבת לידי? אני מבטיח לבלום. כמעט בטוח." · `strip_read` (bumper): "איפה עצר הגלגל הקדמי? לחצו על המספר בסרגל." · `strip_done` (dana): "זה מספר אמיתי. עכשיו אפשר לעבוד איתו."

- [ ] **Step 1: Write the failing e2e test** `strip: brake run stops where the model says`: boot `?only=strip&auto&fresh&seed=42`; after the chapter, the car's front wheel world position along `dir` minus `rulerZero` equals the recorded `distance` (±0.05 m); the recorded trial equals `sampleRun(60, 'dry', makeRng(game.s.seed * 31 + 8))` computed in the page (the chapter uses exactly this rng); meter dropped by `RUN_COST`; with `&ride=on` the rig moved with the car during the run and the rig's roll/pitch stayed 0; no console errors, audits empty.
- [ ] **Step 2:** Run `npx playwright test -g "strip"` → FAIL.
- [ ] **Step 3:** Implement `ch_strip.js`, the `?fx=brake` route, config and script lines.
- [ ] **Step 4:** Run → PASS. Screenshots `radar.png`, `ruler-read.png`; **look at them** (numbers readable, `⁦` isolates correct).
- [ ] **Step 5:** Commit `feat(strip): scripted brake run from the model, ride-along, ruler reading`.

### Task 9: Full spike self-play, publish, headset checklist

**Files:**
- Modify: `tests/e2e/play.spec.js` (`full game` = race → strip → end), `index.html` (`{{PAGES_URL}}`), `README.md` (create: run, flags, keys)

- [ ] **Step 1:** Update the template's `full game` test for the new chapters; run `npm test`, then `npx playwright test -g "full game"` and the groups `boots`, `drive`, `race`, `strip` one at a time. Expected: all pass; `__budget` ≤ 150 draw calls / 400 K tris per chapter.
- [ ] **Step 2:** **Ask the user** before creating the GitHub repo and before pushing to Pages (outward-facing). With approval: create the repo, enable Pages, set `{{PAGES_URL}}`, push.
- [ ] **Step 3:** Hand the user the link and the headset checklist: (1) 72 fps in the race in both views; (2) comfort in the cockpit for one full lap — any nausea? (3) the wheel: two hands, one hand, thumbstick — which feels right? (4) ride-along on the strip; (5) start lights readable, reaction times plausible; (6) ruler numbers readable from the tower chair. Record that fps and comfort are **unverified** until they report.
- [ ] **Step 4:** Commit `chore: spike self-play, README, publish`.
