# פעלול אחרון — מעבדת VR (spike, milestone 1)

Virtual physics lab for 9th grade (stopping distance, friction, Newton's laws) as a stunt-studio story, for Meta Quest 3
(WebXR, seated) and desktop browsers. Spec: `docs/specs/2026-11-15-stunt-lab-design.md`.
Plan: `docs/superpowers/plans/2026-11-15-stunt-spike.md`. Opening-film prompts: `docs/prompts/opening-film-veo.md`.

## Run
```bash
npm install && npx playwright install chromium   # once
npm run serve                                    # http://localhost:8081
npm test                                         # science + physics unit tests
npx playwright test -g "boots"                   # browser tests: run in small groups
npx playwright test -g "intro:"
npx playwright test -g "world:"                  # the full world: budgets per view, no shadow on the strip
npx playwright test -g "look:"                   # art-review screenshots → .superpowers/look/
npx playwright test -g "drive sandbox"
npx playwright test -g "race:"
npx playwright test -g "strip:"
npx playwright test -g "full game"
```

## The experiment (chapters, `src/game/config.js` → CHAPTERS)
0. **intro** — the opening film. 1. **race** — view choice, 3 start-light drills (YOUR reaction time, explained: metres
"blind" at 50 km/h), one lap of the 1.9 km circuit against Bumper (chase camera on desktop, V = driver's seat; blended steering help only in the headset, `?assist=off|light`). 2. **belt** — the dummy with/without a belt (Newton 1,
ride next to Bumper), the tyre zoom with force arrows (Newton 2/3), "who stops the car? the road". 3. **plan** —
hypothesis sentence, matching graph, variable sorting. 4. **strip** — the main experiment: 3 repeats at 40, picked
speeds by the crew, the sprinkler outlier (disqualify). 5. **graph** — ×2 speed → ×4 braking from your data,
hypothesis supported or not, energy cubes. 6. **surfaces** — dry / wet / sand / oil at 70, ranking. 7. **stunt** —
reaction + braking place the red lamp; Roni drives; the cliff + parachute if wrong. 8. **road** — rain, phone, tyres,
self-driving. Then the summary in your own numbers.
`?only=<chapter>` plays one chapter with earlier results filled in; `?demo` "next stage" fills a skipped chapter.
`?quality=quest` turns off the PC showcase tier (bloom, film grade, 4096 shadows), which is on for desktop by default.

## The world (art)
- Desert canyon at golden hour, one sun for everything (`src/world/layout.js`). Terrain: `src/world/terrainFn.js`
  (tested: flat under the game) → `node tools/world/gen-terrain.mjs` bakes sun shadow + sky AO → `assets/world/terrain.bin`.
- Sky, haze, scatter, dust: `src/world/*.js`. Set (tower, lights, crane, camp): `blender/build_set.py`
  (`node tools/world/export-layout.mjs` first; Blender 5.1 headless) → `node tools/optimize.mjs blender/cache/set_raw.glb assets/set.glb`.
- Textures: Poly Haven, CC0 (`node tools/world/fetch-textures.mjs`).
- `?world=lite` flat ground + sky (a fallback if a headset struggles; `?test` uses it by default — software GL is too
  slow for the terrain shader) · `?world=full` forces the real world.

## Clarity
- "The task now" (`TASKS` in `src/game/script.js`, shown by `src/ui/guide.js`): a banner on desktop; in the headset a
  card ≈30° left / ≈10° above the eyes on the tower, and on the dash face (below the sight line) while driving.
- `ctx.attention(obj)` glows softly around what to click; `scope.waitSelect` does it automatically.
- Every line is voiced (`node tools/voices.mjs`; voices: Laura = Dana, Lily = Roni, Liam = Bumper).

## Controls
| | Headset | Desktop |
|---|---|---|
| gas / brake | right / left trigger | W ↑ / S ↓ |
| steer | grab the wheel with grip (one or two hands), or left thumbstick | A D ← → |
| switch view (in car ↔ table) | X | V |
| recenter | right thumbstick press | — |
| choose / click | trigger on a card | click |

## URL flags
`?ride=off` tabletop moving-map view only (no riding, for the whole class) · `?ride=on` start in the car · `?ride=chase` chase camera · `?fx=drive` free
driving sandbox · `?demo` teacher "next stage" (M / B / Y) · `?fresh` ignore the save · `?only=race|strip` one chapter ·
`?seed=N` fixed data · `?quality=pc&pcstay` PC tier without stepping down (art reviews: `npx playwright test -c playwright.gpu.config.js`) · `?test&auto` self-play (tests; skips the film unless `&film`).

## Science model
`src/game/model.js`: stopping distance = v·t_r + v²/(2μg), g = 9.8, μ dry 0.75 / wet 0.45 / sand 0.35 / oil 0.15.
Every number the student reads comes from here; the race car (`src/game/carSim.js`) brakes with the same μ.
