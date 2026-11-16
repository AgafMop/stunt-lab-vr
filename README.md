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
npx playwright test -g "drive sandbox"
npx playwright test -g "race:"
npx playwright test -g "strip:"
npx playwright test -g "full game"
```

## What is in the spike
- **Opening film** (chapter `intro`, ~74 s): nine AI-generated shots on a big screen, Hebrew subtitles (voices later).
  Rebuild after changing a shot or a cut: `node tools/build-intro.mjs` (needs ffmpeg and the raw clips in
  `assets/film/raw/`, which are not in git). Timeline and cues: `src/game/introVideo.js`. Skippable after 3 s.
- **Race** (chapter `race`): choose the view (in the car / remote control from the tower), 3 start-light drills that
  measure the student's real reaction time (false starts don't count), one lap against Bumper with a wet corner.
- **Strip** (chapter `strip`): one brake test — pick a speed, optionally ride along, clapper "Action!", the car stops
  exactly where the science model says; read the radar and the ruler (drone zoom).

## Controls
| | Headset | Desktop |
|---|---|---|
| gas / brake | right / left trigger | W ↑ / S ↓ |
| steer | grab the wheel with grip (one or two hands), or left thumbstick | A D ← → |
| switch view (in car ↔ table) | X | V |
| recenter | right thumbstick press | — |
| choose / click | trigger on a card | click |

## URL flags
`?ride=off` tabletop view only (no riding, for the whole class) · `?ride=on` start in the car · `?fx=drive` free
driving sandbox · `?demo` teacher "next stage" (M / B / Y) · `?fresh` ignore the save · `?only=race|strip` one chapter ·
`?seed=N` fixed data · `?test&auto` self-play (tests; skips the film unless `&film`).

## Science model
`src/game/model.js`: stopping distance = v·t_r + v²/(2μg), g = 9.8, μ dry 0.75 / wet 0.45 / sand 0.35 / oil 0.15.
Every number the student reads comes from here; the race car (`src/game/carSim.js`) brakes with the same μ.
