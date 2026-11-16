# Full experiment (milestone 2–4 in one go) — plan + ledger

Spec: `docs/specs/2026-11-15-stunt-lab-design.md` §6 (chapters 2–8), §7 game layer. Brief: memory `stunt-lab-overnight-brief`
(user asleep: "do everything in one go"; Quest is the target, PC must impress; build art from scratch, no model packs).

## Rulings (scope for one session; each costs little if wrong)
- R1 Reaction time is explained right after the drill (Bumper + a card: "at 50 km/h your t = X m blind") and USED:
  strip runs say "Bumper brakes exactly at the gate: we measure braking only"; ch7 adds Roni's 0.7 s reaction distance.
- R2 Steering assist ON by default in the race (the car holds the line; the student drives gas/brake). The wet-corner
  lesson still happens (friction limit → understeer). Toggle: card at the start; ?assist=off.
- R3 Tyre zoom = a big tyre diorama beside the tower (no shrinking the student: seated comfort).
- R4 Bumper is a 3D character (from-scratch three.js: white rounded body, accordion arms, screen face). Roni appears
  as a helmeted driver in ch7. Dana stays a voice (film character) in this round.
- R5 Variable sorting / ranking by click-then-click (spec "click first"), no dragging.
- R6 Results board (table + live graph) on the tower = the spec's notebook for this round (fixed home, right side).
- R7 Ch8 phone-distraction measurement → explained with numbers (no extra drill).
- R8 New lines voiced in one batch at the end (ElevenLabs key #2, free tier; subtitles if it runs out).

## Tasks (each: chapter module + ?auto path + e2e/unit test + screenshot read)
1. Race: reaction-time meaning (lines + card), steering assist, easier handling.
2. Bumper character (src/world/bumper.js) on the tower deck; used by later chapters.
3. Ch "belt" (2): dummy test with/without belt + tyre zoom (4 phases) + "who stops the car?".
4. Ch "plan" (3): research question, hypothesis sentence, graph choice, variable sorting.
5. Shared strip-run module (car run, surfaces, sprinkler, reading chips) + results board.
6. Ch "main" (4): choose speeds, 3 student repeats at 40, crew completes ×6, sprinkler outlier decision.
7. Ch "graph" (5): ×2 → ×4 pairs, hypothesis vs result, energy-cubes zoom.
8. Ch "surfaces" (6): 4 surfaces at 70, student runs 2, ranking.
9. Ch "stunt" (7): lamp placement (reaction + braking), Roni drives; success / cliff + parachute / too far.
10. Ch "road" (8) + end summary (hypothesis vs result, stars, badges).
11. Voices for all new lines.
12. PC quality tier (post-processing, denser scatter, better car), Quest budget re-check.
13. Full-suite run, push (approved by "do everything"), report.

## Ledger
