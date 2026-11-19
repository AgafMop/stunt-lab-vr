// Chapter 7 — the big shot (spec §6 ch. 7): everything comes together, and this time the STUDENT drives it.
//   Rain machine on: a wet road at 70 km/h. The student brakes when the red lamp lights; their reaction time is the one
//   measured at the start lights in the race. They place the lamp: reaction distance (3 cards, from THEIR reaction
//   time) + braking distance on wet (from THEIR surface data, 3 cards) = where the lamp goes before the line.
//   Then they drive it (stripKit.driveToLine: the speed is held, they only brake), Roni in the passenger seat — the
//   film's "without physics I'm not getting in the car" pays off. Within ±2 m of the line: "Cut! Perfect!".
//   A miss tells apart a wrong lamp (the calculation) from a press that came early/late (this take's reaction time is
//   shown next to the race's). Only a wrong lamp costs daylight; the take is repeated until it works.
//   (Before 2026-11-19 Roni drove and the student only watched — "the film promises stopping on the cliff edge, and
//   then nothing in the lab asks for it".)
import * as THREE from 'three';
import { board } from './kit.js';
import { mean, reactionDistance, brakingDistance } from '../game/model.js';
import { choose, num, driveToLine, LINE_X } from './stripKit.js';
import { STRIP } from '../world/layout.js';
import { STUNT, stuntOutcome } from '../game/chapterMath.js';
import { lineVerdict } from '../game/cliffDrive.js';
export { STUNT, stuntOutcome, LINE_X };

export async function run(ctx, scope) {
  const { game, loco, lab, ui } = ctx;
  await loco.goTo('tower');
  const v = STUNT.kmh;
  const tr = game.s.reaction?.mean ?? 0.3;                     // the student's own, from the race's start lights
  const dr = reactionDistance(v, tr);
  const vms = v / 3.6;
  const wetData = (game.s.surfaceTrials?.wet || []).filter(t => t.valid).map(t => t.value);
  const dbData = wetData.length ? mean(wetData) : brakingDistance(v, 'wet');
  const dryData = (game.s.surfaceTrials?.dry || []).filter(t => t.valid).map(t => t.value);
  const dbDry = dryData.length ? mean(dryData) : brakingDistance(v, 'dry');
  const rain = rainFx(ctx); lab.world.add(rain); scope.add(rain); scope.add(() => rain.userData.dispose());
  await scope.say('stunt_intro');
  await scope.say('stunt_roni');

  const g = board(ctx, scope, 'A_board');
  const f2 = n => n.toFixed(2), f1 = n => n.toFixed(1);
  // 1. the reaction distance, from their own reaction time
  ctx.task?.set('stunt_react');
  await scope.say('stunt_react');
  let hints = 0;
  for (;;) {
    const c = await choose(ctx, scope, g, [
      ['ok', `⁦${f1(vms)}⁩ מ׳/ש׳ × ⁦${f2(tr)}⁩ ש׳ ≈ ⁦${f1(dr)}⁩ מ׳`], ['kmh', `⁦70⁩ × ⁦${f2(tr)}⁩ = ⁦${f1(70 * tr)}⁩ מ׳`], ['one', `⁦${f1(vms)}⁩ מ׳ (שנייה שלמה)`],
    ], 'ok', { w: 0.34, h: 0.11 });
    if (c === 'ok') { ctx.audio.sfx('ok'); break; }
    hints++; ctx.audio.sfx('no'); await scope.say(c === 'kmh' ? 'stunt_react_units' : 'stunt_react_time');
  }
  // 2. the braking distance on wet, from their own data
  ctx.task?.set('stunt_brake');
  await scope.say('stunt_brake');
  for (;;) {
    const c = await choose(ctx, scope, g, [
      ['wet', `⁦${f1(dbData)}⁩ מ׳ (רטוב, מהנתונים שלכם)`], ['dry', `⁦${f1(dbDry)}⁩ מ׳ (יבש)`], ['half', `⁦${f1(dbData / 2)}⁩ מ׳`],
    ], 'wet', { w: 0.34, h: 0.11 });
    if (c === 'wet') { ctx.audio.sfx('ok'); break; }
    hints++; ctx.audio.sfx('no'); await scope.say(c === 'dry' ? 'stunt_brake_dry' : 'stunt_brake_half');
  }
  game.s.flags.stuntHints = hints;

  // 3. place the lamp; drive it; until the shot works
  const base = Math.round(dr + dbData);
  const lamps = [base + 8, base + 4, base, base - Math.max(3, Math.round(dr)), base - 13]       // −dr: "forgot the reaction distance"
    .filter((x, i, a) => x > 0 && a.indexOf(x) === i).sort((a, b) => b - a);
  let attempts = 0, last = null;
  for (;;) {
    attempts++;
    ctx.task?.set('stunt_lamp');
    scope.say(attempts === 1 ? 'stunt_lamp' : 'stunt_again');
    if (last) showTake(ctx, scope, g, last, tr);
    const lamp = await choose(ctx, scope, g, lamps.map(x => [x, `⁦${x}⁩ מ׳ לפני הקו`]), base, { w: 0.2, h: 0.11 });
    g.visible = false;
    await action(ctx, scope);
    ctx.task?.set('stunt_drive');
    // the road brakes exactly as their wet data says (no extra noise): a correct lamp + a race-like press = on the line,
    // so a miss with the right lamp really was the press
    const res = await driveToLine(ctx, scope, {
      kmh: v, brake: dbData, surface: 'wet', lamp, passenger: 'roni', color: 0xf07a1a,
      autoPressAt: ctx.params.get('stuntpress') === 'late' && attempts === 1 ? -lamp + dr + 6 : -lamp + dr,   // ?auto (+?stuntpress=late: take 1 presses late)
      ready: () => scope.say('stunt_go'),
    });
    const verdict = lineVerdict(res.stop, res.fell);
    const lampOk = stuntOutcome(lamp, dr, dbData).kind === 'ok';   // the calculation, with their own numbers
    last = { lamp, verdict, stop: res.stop, reaction: res.reaction, early: res.early, lampOk };
    game.s.flags.stuntLast = { lamp, kind: verdict, miss: Math.round(res.stop * 10) / 10, reaction: res.reaction == null ? null : +res.reaction.toFixed(2) };
    if (verdict === 'ok') {
      ctx.audio.sfx('win');
      if (attempts === 1) game.award('צוק אחד');
      game.s.flags.stuntDone = true; game.s.flags.stuntAttempts = attempts;
      await scope.say('stunt_cut');
      await scope.say('stunt_roni_physics');
      break;
    }
    ctx.audio.sfx('no');
    let line;
    if (res.early) line = 'stunt_early';
    else if (lampOk) line = (res.reaction ?? Infinity) > tr ? 'stunt_late' : 'stunt_fast';   // the lamp was right: it was the press
    else { game.spend(verdict === 'cliff' ? 30 : 10); line = verdict === 'cliff' ? 'stunt_cliff' : verdict === 'over' ? 'stunt_over' : 'stunt_short'; }
    await scope.say(line);
    g.visible = true;
  }
  ctx.task?.clear();
}

/** The last take, in numbers, above the lamp cards: where it stopped and this take's reaction vs the race's. */
function showTake(ctx, scope, g, t, tr) {
  const { ui } = ctx;
  g.getObjectByName('stuntTake')?.removeFromParent();
  const f = n => `⁦${Math.abs(n).toFixed(1)}⁩`;
  const where = t.verdict === 'cliff' ? 'הטייק הקודם: לקניון' : t.stop > 0 ? `הטייק הקודם: ${f(t.stop)} מ׳ אחרי הקו` : `הטייק הקודם: ${f(t.stop)} מ׳ לפני הקו`;
  const react = t.early ? 'בלמתם לפני שהפנס נדלק' : t.reaction == null ? 'לא בלמתם' : `זמן התגובה בטייק: ⁦${t.reaction.toFixed(2)}⁩ ש׳ (במרוץ: ⁦${tr.toFixed(2)}⁩ ש׳)`;
  const p = scope.add(ui.panel({ w: 0.8, h: 0.17, name: 'stuntTake', viewDist: 1.2, draw(c, W, H) {
    ui.rr(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = ui.C.bg; c.fill(); c.lineWidth = 4; c.strokeStyle = '#FFB347'; c.stroke();
    const mp = ui.minPx(900, 1.2);              // A_board is 1.2 m from the chair
    c.fillStyle = ui.C.ink; ui.fitText(c, where, { x: 24, y: 8, w: W - 48, h: H * 0.46, maxPx: H * 0.36, minPx: mp, font: ui.FONT, weight: 800 });
    c.fillStyle = '#9FB0C8'; ui.fitText(c, react, { x: 24, y: H * 0.52, w: W - 48, h: H * 0.4, maxPx: H * 0.28, minPx: mp, font: ui.FONT, weight: 600 });
  } }));
  p.mesh.name = 'stuntTake'; p.mesh.position.set(0, 0.17, 0); g.add(p.mesh);
}

async function action(ctx, scope) {
  const { action: act } = await import('./stripKit.js');
  return act(ctx, scope, 'stunt_action');
}

/** Rain from the rain machine over the strip (thin streaks around it). */
function rainFx(ctx) {
  const N = 1400, pos = new Float32Array(N * 6);
  const area = { x0: STRIP.gateX - 10, x1: STRIP.endX + 2, z0: STRIP.z - 9, z1: STRIP.z + 9 };
  const seed = () => [area.x0 + Math.random() * (area.x1 - area.x0), Math.random() * 14, area.z0 + Math.random() * (area.z1 - area.z0)];
  for (let i = 0; i < N; i++) { const [x, y, z] = seed(); pos.set([x, y, z, x - 0.05, y - 0.45, z], i * 6); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbcd4f0, transparent: true, opacity: 0.45, depthWrite: false }));
  lines.name = 'rain'; lines.frustumCulled = false;
  const off = ctx.engine.onFrame(dt => {
    for (let i = 0; i < N; i++) {
      const k = i * 6; let y = pos[k + 1] - 16 * dt;
      if (y < 0) { const [x, yy, z] = seed(); pos[k] = x; pos[k + 2] = z; pos[k + 3] = x - 0.05; pos[k + 5] = z; y = 12 + yy * 0.1; }
      pos[k + 1] = y; pos[k + 4] = y - 0.45;
    }
    geo.attributes.position.needsUpdate = true;
  });
  lines.userData.dispose = off;
  return lines;
}

export const _num = num;
