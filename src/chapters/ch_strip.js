// Chapter 4 — the main experiment: speed vs braking distance (spec §6 ch. 4).
//   1. three repeats at 40 km/h run by the student: clapper → Bumper drives (optional ride-along on the first) → he brakes
//      exactly at the laser gate (so only the BRAKING distance is measured) → read the radar and the ruler (front wheel)
//   2. the production notebook (results board) appears after the first good measurement
//   3. the student picks 3–5 more speeds (spread out — Bumper complains if they are bunched)
//   4. the crew runs them (fast), the student reads every second run; one run is the sprinkler accident
//   5. the outlier: disqualify (with the reason) or keep — keeping it bends the graph
// Every number comes from model.js (sampleRun); the motion follows stripPlan.js, so seen = recorded.
import { board } from './kit.js';
import { sampleRun, makeRng } from '../game/model.js';
import { stripRun, choose, readDistance, action, num } from './stripKit.js';
import { createResultsBoard } from '../ui/resultsBoard.js';

export const STUDENT_KMH = 40;
const OPTIONS = [30, 50, 60, 70, 80, 90, 100, 110, 120];
const AUTO_PICK = [30, 60, 80, 110];

export async function run(ctx, scope) {
  const { ui, game, lab, params, loco } = ctx;
  await loco.goTo('tower');
  const stripRunStats = ctx.stripRun = { frontX: null, read: null, rigTravel: 0, maxTilt: 0 };
  const rng = makeRng(game.s.seed * 31 + 8);
  const results = createResultsBoard(ctx); scope.add(() => results.dispose());
  results.mesh.visible = Object.keys(game.s.trials).length > 0;
  ctx.results = results;

  // the radar reads the gate speed after each run
  let radarKmh = null;
  const radar = scope.add(ui.panel({ w: 0.34, h: 0.16, name: 'radar', viewDist: 1.2, draw(c, W, H) {
    ui.rr(c, 4, 4, W - 8, H - 8, 24); c.fillStyle = '#10141c'; c.fill();
    c.fillStyle = '#7CFF9B';
    ui.fitText(c, radarKmh == null ? '— קמ״ש' : `${num(radarKmh)} קמ״ש`, { x: 16, y: 10, w: W - 32, h: H - 20, maxPx: H * 0.6, minPx: ui.minPx(900, 1.2), font: ui.FONT });
  } }));
  lab.anchors.A_radar.add(radar.mesh);
  const showRadar = k => { radarKmh = k; radar.redraw(); };

  await scope.say('main_intro');
  await scope.say('main_gate');

  // ---- 1. three repeats at 40, by the student ----
  const have = (game.s.trials[STUDENT_KMH] || []).length;
  for (let k = have; k < 3; k++) {
    let rideAlong = params.get('ride') === 'on';
    if (k === 0 && !params.get('ride')) {
      const g = board(ctx, scope, 'A_board');
      ctx.task?.set('strip_ride');
      scope.say('strip_ride');
      rideAlong = await choose(ctx, scope, g, [[true, 'כן, אני נוסע/ת'], [false, 'אני נשאר/ת במגדל']], false);
      g.visible = false;
    }
    if (k === 0) game.s.flags.rodeAlong = rideAlong;
    await action(ctx, scope);
    ctx.task?.set('strip_watch');
    const r = sampleRun(STUDENT_KMH, 'dry', rng);
    const res = await stripRun(ctx, scope, { kmh: r.kmh, brake: r.distance, rideAlong: rideAlong && k === 0 });
    if (k === 0) stripRunStats.frontX = res.car.getObjectByName('frontWheel').getWorldPosition(res.car.position.clone()).x - lab.strip.rulerZero.x;
    showRadar(r.kmh);
    await readDistance(ctx, scope, r.distance, { say: k === 0 });
    if (k === 0) stripRunStats.read = r.distance;
    lab.world.remove(res.car);
    game.addTrial(STUDENT_KMH, { value: r.distance, kmh: r.kmh, by: 'student' });
    ctx.audio.sfx('ok');
    if (k === 0) { results.mesh.visible = true; scope.add(ctx.attention?.(results.mesh) ?? (() => {})); await scope.say('main_notebook'); }
    if (k === 1) await scope.say('main_repeat');
  }

  // ---- 2. the student picks the other speeds ----
  let speeds = Object.keys(game.s.trials).map(Number).filter(k => k !== STUDENT_KMH);
  if (!speeds.length) speeds = await pickSpeeds(ctx, scope);
  game.s.plan = [STUDENT_KMH, ...speeds].sort((a, b) => a - b);

  // ---- 3. the crew runs them; the student reads every second run; one run is the sprinkler accident ----
  ctx.task?.set('main_crew');
  await scope.say('main_crew');
  const sprinklerAt = { kmh: speeds[Math.min(1, speeds.length - 1)], index: 1 };
  let n = 0;
  for (const v of speeds) {
    for (let i = (game.s.trials[v] || []).length; i < 3; i++) {
      const accident = v === sprinklerAt.kmh && i === sprinklerAt.index && !game.s.flags.sprinkler;
      const r = sampleRun(v, 'dry', rng, { sprinkler: accident });
      if (accident) { game.s.flags.sprinkler = true; ctx.task?.set('strip_watch'); }
      const res = await stripRun(ctx, scope, { kmh: r.kmh, brake: r.distance, surface: accident ? 'sprinkler' : 'dry', speed: accident ? 1 : 4 });
      showRadar(r.kmh);
      if (accident) await scope.say('main_sprinkler');
      if (n++ % 2 === 0 || accident) await readDistance(ctx, scope, r.distance, { say: false });
      lab.world.remove(res.car);
      game.addTrial(v, { value: r.distance, kmh: r.kmh, by: 'crew', ...(accident ? { sprinkler: true } : {}) }, { free: true });
      ctx.task?.set('main_crew');
    }
  }

  // ---- 4. the outlier: disqualify with the reason, or keep it (and see the graph bend) ----
  const list = game.s.trials[sprinklerAt.kmh] || [];
  const bad = list.findIndex(t => t.sprinkler);
  if (bad >= 0 && list[bad].valid) {
    results.highlight(sprinklerAt.kmh);
    ctx.task?.set('main_decide');
    await scope.say('main_decide');
    let first = true;
    for (;;) {
      const g = board(ctx, scope, 'A_board');
      const pick = await choose(ctx, scope, g, [['disq', 'לפסול: הממטרה הרטיבה את הכביש'], ['keep', 'להשאיר את המדידה']], 'disq', { w: 0.42, h: 0.12 });
      g.visible = false;
      if (pick === 'disq') {
        game.disqualify(sprinklerAt.kmh, bad, 'ממטרה הרטיבה את הכביש');
        game.markDecision(first);
        if (first) game.award('שופט/ת הוגן/ת');
        await scope.say('main_disq');
        break;
      }
      first = false;
      game.markDecision(false);
      results.redraw();
      await scope.say('main_keep');
    }
    results.highlight(null);
  }
  ctx.task?.clear();
  await scope.say('main_done');
}

/** Toggle 3–5 speed tokens, spread out; the "done" button wakes when the choice is good. */
async function pickSpeeds(ctx, scope) {
  const { ui } = ctx;
  const g = board(ctx, scope, 'A_board');
  ctx.task?.set('main_pick');
  scope.say('main_pick');
  const chosen = new Set();
  let done = null;
  const cards = OPTIONS.map(v => scope.add(ui.card({ w: 0.15, h: 0.1, label: `${num(v)}`, name: 'speed', viewDist: 1.2, onSelect: cc => {
    ctx.audio.sfx('click');
    if (chosen.has(v)) { chosen.delete(v); cc.setState('idle'); } else if (chosen.size < 5) { chosen.add(v); cc.setState('sel'); }
    done?.setEnabled(chosen.size >= 3);
  } })));
  cards.forEach((c, i) => { const r = i < 5 ? 0 : 1, col = i < 5 ? i : i - 5; c.mesh.position.set(0.34 - col * 0.17, 0.08 - r * 0.12, 0.01); g.add(c.mesh); });
  const caption = scope.add(ui.panel({ w: 0.86, h: 0.07, name: 'speedCaption', viewDist: 1.2, draw(c, W, H) {
    c.fillStyle = '#EEF2F8'; ui.fitText(c, 'בחרו עוד 3–5 מהירויות (קמ״ש)', { x: 10, y: 4, w: W - 20, h: H - 8, maxPx: H * 0.6, minPx: ui.minPx(900, 1.2), font: ui.FONT });
  } }));
  caption.mesh.position.set(0, 0.18, 0.01); g.add(caption.mesh);
  let pressed = null;
  done = scope.add(ui.button3d('זהו, לנסיעות!', () => pressed?.(), { w: 0.3, h: 0.08, viewDist: 1.2 }));
  done.mesh.position.set(0, -0.17, 0.01); g.add(done.mesh); done.setEnabled(false);
  for (;;) {
    const wait = new Promise(res => { pressed = res; });
    if (ctx.auto) { for (const v of AUTO_PICK) chosen.add(v); done.setEnabled(true); setTimeout(() => pressed?.(), 200); }
    const glow = ctx.attention?.(done.mesh) ?? (() => {});
    await scope.guard(wait);
    glow();
    const s = [...chosen].sort((a, b) => a - b);
    if (s.length >= 3 && s[s.length - 1] - s[0] >= 50) break;
    await scope.say('main_crowded');
  }
  g.visible = false;
  return [...chosen].sort((a, b) => a - b);
}
