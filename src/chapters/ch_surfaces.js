// Chapter 6 — the surfaces (spec §6 ch. 6): the stunt's speed (70 km/h) on dry / wet / sand / oil.
//   the student picks two surfaces to run and read; the crew completes 3 runs on each; the notebook shows bars;
//   then ranking: click the surfaces from the shortest stop to the longest; the rule for chapter 8 is born:
//   "on a wet road, at the same speed, you stop much further".
import { board } from './kit.js';
import { sampleRun, cleanRuns, makeRng } from '../game/model.js';
import { stripRun, choose, readDistance } from './stripKit.js';
import { createResultsBoard } from '../ui/resultsBoard.js';

export const SURF_KMH = 70;
export const NAMES = { dry: 'יבש', wet: 'רטוב', sand: 'חול', oil: 'שמן' };
export const ORDER = ['dry', 'wet', 'sand', 'oil'];          // shortest → longest (μ 0.75, 0.45, 0.35, 0.15)

export async function run(ctx, scope) {
  const { game, loco, lab } = ctx;
  await loco.goTo('tower');
  game.s.surfaceTrials ??= {};
  const st = game.s.surfaceTrials;
  const results = createResultsBoard(ctx); scope.add(() => results.dispose());
  results.setMode('surface');
  const rng = makeRng(game.s.seed * 17 + 11);
  await scope.say('surf_intro');

  // ---- the student's two surfaces ----
  const g = board(ctx, scope, 'A_board');
  ctx.task?.set('surf_pick');
  scope.say('surf_pick');
  const picks = [];
  for (let k = 0; k < 2; k++) {
    const left = ORDER.filter(s => !picks.includes(s));
    picks.push(await choose(ctx, scope, g, left.map(s => [s, NAMES[s]]), k === 0 ? 'wet' : 'oil', { w: 0.2, h: 0.11 }));
  }
  g.visible = false;
  game.s.flags.surfacePicks = picks;
  for (const sf of picks) {
    ctx.task?.set('strip_watch');
    const r = sampleRun(SURF_KMH, sf, rng);
    const res = await stripRun(ctx, scope, { kmh: r.kmh, brake: r.distance, surface: sf });
    await readDistance(ctx, scope, r.distance, { say: false });
    lab.world.remove(res.car);
    (st[sf] ||= []).push({ value: r.distance, kmh: r.kmh, valid: true, by: 'student' });
    game.spend(5);
    results.redraw();
    await scope.say(`surf_${sf}`);
  }
  // ---- the crew completes 3 on every surface (time-lapse) ----
  ctx.task?.set('surf_crew');
  await scope.say('surf_crew');
  for (const sf of ORDER) {
    const runs = cleanRuns(SURF_KMH, sf, rng, 3);
    for (const r of runs.slice((st[sf] || []).length)) {
      const res = await stripRun(ctx, scope, { kmh: r.kmh, brake: r.distance, surface: sf, speed: 5 });
      lab.world.remove(res.car);
      (st[sf] ||= []).push({ value: r.distance, kmh: r.kmh, valid: true, by: 'crew' });
      results.redraw();
    }
  }

  // ---- ranking: shortest stop → longest ----
  ctx.task?.set('surf_rank');
  await scope.say('surf_rank');
  const g2 = board(ctx, scope, 'A_board');
  const order = [];
  let wrongs = 0;
  while (order.length < 4) {
    const left = ORDER.filter(s => !order.includes(s));
    const want = ORDER[order.length];
    const v = await choose(ctx, scope, g2, left.map(s => [s, `${order.length + 1}. ${NAMES[s]}`]), want, { w: 0.2, h: 0.11 });
    if (v === want) { order.push(v); ctx.audio.sfx('ok'); }
    else { wrongs++; ctx.audio.sfx('no'); await scope.say('surf_rank_wrong'); }
  }
  g2.visible = false;
  game.s.flags.surfaceRankWrongs = wrongs;
  game.markDecision(wrongs === 0);
  game.s.flags.wetRule = true;
  ctx.task?.clear();
  await scope.say('surf_rule');
}
