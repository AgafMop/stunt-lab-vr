// Chapter 5 — the graph and the discovery (spec §6 ch. 5).
//   1. the notebook's graph comes in front of the student; "what happens when we double?" — pick a pair of speeds
//      (a, 2a) from THEIR data: ×2 arrows on speed, ×≈4 on braking; then a second pair
//   2. their hypothesis next to the result: supported / not supported (never "right / wrong")
//   3. the energy zoom: glowing kinetic-energy cubes ride above the car — 1 at 40 km/h, 4 at 80 — and braking eats them
//      at the same rate per metre (friction turns them into heat: the brakes glow), so 4 cubes need 4× the metres
//   4. which explanation fits the graph? (3 cards)
import * as THREE from 'three';
import { board } from './kit.js';
import { mean, cleanRuns, makeRng, brakingDistance } from '../game/model.js';
import { stripRun, choose, num } from './stripKit.js';
import { createResultsBoard } from '../ui/resultsBoard.js';
import { PREDICTIONS } from './ch_plan.js';
import { doublingPairs } from '../game/chapterMath.js';

export async function run(ctx, scope) {
  const { game, loco, lab } = ctx;
  await loco.goTo('tower');
  const results = createResultsBoard(ctx); scope.add(() => results.dispose());
  results.focus(true);
  results.curve(false);
  await scope.say('graph_intro');

  // make sure the data hold at least one doubling pair (the crew adds the missing speed if the plan has none)
  const vals = () => game.validValues();
  let pairs = doublingPairs(Object.keys(vals()).map(Number));
  if (!pairs.length) {
    await scope.say('graph_addpair');
    const rng = makeRng(game.s.seed * 7 + 3);
    for (const r of cleanRuns(80, 'dry', rng, 3)) game.addTrial(80, { value: r.distance, kmh: r.kmh, by: 'crew' }, { free: true });
    if (!vals()[40]) for (const r of cleanRuns(40, 'dry', rng, 3)) game.addTrial(40, { value: r.distance, kmh: r.kmh, by: 'crew' }, { free: true });
    pairs = doublingPairs(Object.keys(vals()).map(Number));
  }

  // ---- 1. double it ----
  const ratios = [];
  for (let round = 0; round < Math.min(2, pairs.length); round++) {
    const g = board(ctx, scope, 'A_board', [0, -0.42, 0.35]);
    ctx.task?.set('graph_pair');
    if (round === 0) scope.say('graph_pair');
    const left = pairs.filter(p => !ratios.some(r => r.a === p[0]));
    const [a, b] = await choose(ctx, scope, g, left.map(p => [p, `${num(p[0])} ← ${num(p[1])} קמ״ש`]), left[0], { w: 0.3, h: 0.1 });
    g.visible = false;
    const da = mean(vals()[a]), db = mean(vals()[b]);
    results.pair(a, b, da, db);
    ratios.push({ a, b, ratio: db / da });
    await scope.say(round === 0 ? 'graph_x4' : 'graph_again');
  }
  game.s.flags.doublingRatios = ratios.map(r => Math.round(r.ratio * 10) / 10);

  // ---- 2. the hypothesis vs the result ----
  results.curve(true);
  const pred = game.s.hypothesis?.pred ?? 'x2';
  const supported = pred === 'x4';
  game.s.flags.hypothesisSupported = supported;
  if (supported) game.award('פי ארבע');
  ctx.task?.set('graph_hyp');
  const verdict = scope.add(ctx.ui.panel({ w: 0.9, h: 0.14, name: 'verdict', viewDist: 1.2, draw(c, W, H) {
    const { ui } = ctx;
    ui.rr(c, 4, 4, W - 8, H - 8, 20); c.fillStyle = supported ? '#1C4D36' : '#4a3a14'; c.fill();
    c.fillStyle = '#EEF2F8';
    ui.fitText(c, `ההשערה שלכם: "${PREDICTIONS[pred]}". התוצאה: גדל פי ⁦4⁩ בערך. ההשערה ${supported ? 'אוששה' : 'לא אוששה'}.`, { x: 16, y: 6, w: W - 32, h: H - 12, maxPx: H * 0.34, minPx: ui.minPx(900, 1.2), font: ui.FONT, weight: 600 });
  } }));
  const gv = board(ctx, scope, 'A_board', [0, -0.4, 0.35]); gv.add(verdict.mesh);
  await scope.say(supported ? 'graph_hyp_yes' : 'graph_hyp_no');
  await scope.wait(ctx.auto ? 50 : 1200);
  gv.visible = false;
  results.focus(false);

  // ---- 3. the energy zoom ----
  ctx.task?.set('graph_energy');
  await scope.say('graph_energy');
  for (const kmh of [40, 80]) {
    await energyRun(ctx, scope, kmh);
    await scope.say(kmh === 40 ? 'graph_energy40' : 'graph_energy80');
  }

  // ---- 4. which explanation fits the graph? ----
  ctx.task?.set('graph_explain');
  await scope.say('graph_explain');
  let tries = 0;
  for (;;) {
    tries++;
    const g = board(ctx, scope, 'A_board');
    const v = await choose(ctx, scope, g, [
      ['energy', 'מהירות כפולה = פי 4 אנרגיה, והחיכוך מוריד אותה באותו קצב לכל מטר'],
      ['twice', 'מהירות כפולה = פי 2 אנרגיה, ולכן פי 2 מרחק'],
      ['weak', 'במהירות גבוהה הבלמים נחלשים'],
    ], 'energy', { w: 0.62, h: 0.1, y: 0.0 });
    g.visible = false;
    if (v === 'energy') { ctx.audio.sfx('ok'); game.markDecision(tries === 1); break; }
    ctx.audio.sfx('no'); await scope.say(v === 'twice' ? 'graph_wrong_twice' : 'graph_wrong_weak');
  }
  ctx.task?.clear();
  await scope.say('graph_done');
  void lab;
}

/** A run with glowing energy cubes above the car; braking eats them evenly per metre and the brakes glow. */
async function energyRun(ctx, scope, kmh) {
  const n = Math.round((kmh / 40) ** 2);
  const brake = Math.round(brakingDistance(kmh, 'dry') * 2) / 2;
  const cubes = new THREE.Group(); cubes.name = 'energyCubes';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: 1.4, transparent: true, opacity: 0.95, toneMapped: false });
  for (let i = 0; i < n; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat.clone()); c.position.set(0, 2.4 + Math.floor(i / 2) * 1.0, (i % 2 - (n > 1 ? 0.5 : 0)) * 1.0); cubes.add(c); }
  const heat = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0, toneMapped: false }));
  heat.position.set(0, 0.4, 1.35);
  await stripRun(ctx, scope, {
    kmh, brake, zero: -40, slowMo: 0.45,
    onTick(t, plan, car) {
      if (!cubes.parent) { car.add(cubes); car.add(heat); }
      const done = Math.min(1, Math.max(0, (plan.frontAt(t) - plan.brakeAt) / brake));
      const left = n * (1 - done);
      cubes.children.forEach((c, i) => { const f = Math.min(1, Math.max(0, left - i)); c.scale.setScalar(Math.max(0.001, f)); c.material.opacity = 0.3 + 0.65 * f; });
      heat.material.opacity = done > 0 && done < 1 ? 0.55 : Math.max(0, heat.material.opacity - 0.02);
    },
  }).then(r => scope.wait(ctx.auto ? 50 : 900).then(() => ctx.lab.world.remove(r.car)));
}
