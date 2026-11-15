// EXAMPLE chapter: hands-on bench. Shows the three patterns every bench chapter needs:
//   1. a teaching failure (touch the reagent without goggles → splash, meter cost, one funny line that explains why)
//   2. click-to-do on a tool (a plain trigger/click does the step; physical grab is optional on top — see handling.js)
//   3. repeats feeding a live table (3 repeats per condition; the science model makes the numbers)
import { board } from './kit.js';
import { sampleTrial, makeRng, mean } from '../game/model.js';
import { REPEATS } from '../game/config.js';

export async function run(ctx, scope) {
  const { ui, game, lab, input, audio, engine } = ctx;
  const P = lab.props;
  await ctx.loco.goTo('bench');

  // 1. safety first — the failure is allowed to happen, and it teaches
  if (!game.s.flags.goggles) {
    scope.say('bench_goggles');
    for (;;) {
      const hit = await Promise.race([scope.waitSelect(P.P_goggles), scope.waitSelect(P.P_beaker, { auto: false })]);
      input.unregister(P.P_goggles); input.unregister(P.P_beaker);
      if (hit === P.P_goggles) { game.s.flags.goggles = true; P.P_goggles.visible = false; audio.sfx('ok'); break; }
      game.penalize('noGoggles'); audio.sfx('no');
      await engine.fade(0.6, 120); await engine.fade(0, 500);     // splash: a red-ish blur would be nicer; keep it short
      await scope.say('fail_noGoggles');
    }
  }

  // 2 + 3. measure REPEATS times at one condition; the table fills as you go
  const x = 37, rng = makeRng(game.s.seed * 7 + 1);
  const g = board(ctx, scope, 'A_board');
  // numbers with units inside Hebrew text: isolate them LTR (U+2066 … U+2069) or "37°" renders as "°37"
  const num = v => `\u2066${v}\u2069`;
  const VIEW = 1.3;                      // metres from the seated eye to A_board: the readability audit uses it
  const table = scope.add(ui.panel({ w: 0.7, h: 0.42, name: 'table', viewDist: VIEW, draw(c, W, H, vals = []) {
    ui.rr(c, 6, 6, W - 12, H - 12, 24); c.fillStyle = ui.C.bg; c.fill();
    const min = ui.minPx(900, VIEW), box = (y, h) => ({ x: 30, y, w: W - 60, h, font: ui.FONT, minPx: min });
    c.fillStyle = ui.C.ink; ui.fitText(c, `תוצאות ב-${num(x + '°')}`, { ...box(14, H * 0.2), maxPx: H * 0.15 });
    for (let i = 0; i < REPEATS; i++) {
      c.fillStyle = vals[i] != null ? ui.C.ink : ui.C.muted;
      ui.fitText(c, `חזרה ${i + 1}: ${vals[i] != null ? num(vals[i]) : '—'}`, { ...box(H * (0.24 + i * 0.17), H * 0.16), maxPx: H * 0.12, weight: 500 });
    }
    if (vals.length === REPEATS) { c.fillStyle = ui.C.oxy; ui.fitText(c, `ממוצע: ${num(mean(vals).toFixed(1))}`, { ...box(H * 0.76, H * 0.18), maxPx: H * 0.13 }); }
  } }));
  g.add(table.mesh);

  for (let i = 0; i < REPEATS; i++) {
    scope.say('bench_measure');
    await scope.waitSelect(P.P_beaker);
    const value = sampleTrial(x, rng);
    game.addTrial(x, { value, by: 'student' });
    table.redraw(game.s.trials[x].filter(t => t.valid).map(t => t.value));
    await scope.say('bench_done');
  }
}
