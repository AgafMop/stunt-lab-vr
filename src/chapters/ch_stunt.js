// Chapter 7 — the big shot (spec §6 ch. 7): everything comes together.
//   Rain machine on: a wet road at 70 km/h. Roni brakes when she sees the red lamp; her reaction time (from the crew's
//   drills) is 0.7 s. The student places the lamp: reaction distance (3 cards) + braking distance on wet (from THEIR
//   surface data, 3 cards) = where the lamp goes before the stop line (5 positions).
//   Roni drives (optional: ride next to her). Within ±2 m of the line: "Cut! Perfect!". Too close to the cliff: over
//   the edge, the parachute, down into the canyon — and Bumper: "the reaction distance — did we forget it?". Too far
//   from the line: "this isn't a film, it's parking". Wrong placements cost daylight and try again.
import * as THREE from 'three';
import { board } from './kit.js';
import { mean, reactionDistance, brakingDistance, sampleRun, makeRng } from '../game/model.js';
import { stripRun, choose, num } from './stripKit.js';
import { STRIP } from '../world/layout.js';
import { STUNT, stuntOutcome } from '../game/chapterMath.js';
export { STUNT, stuntOutcome };

export const LINE_X = STRIP.endX - 3;                      // the painted stop line (x) — the target

export async function run(ctx, scope) {
  const { game, loco, lab, engine, params } = ctx;
  await loco.goTo('tower');
  const v = STUNT.kmh, tr = STUNT.tr;
  const dr = reactionDistance(v, tr);
  const wetData = (game.s.surfaceTrials?.wet || []).filter(t => t.valid).map(t => t.value);
  const dbData = wetData.length ? mean(wetData) : brakingDistance(v, 'wet');
  const dryData = (game.s.surfaceTrials?.dry || []).filter(t => t.valid).map(t => t.value);
  const dbDry = dryData.length ? mean(dryData) : brakingDistance(v, 'dry');
  const rain = rainFx(ctx); lab.world.add(rain); scope.add(rain); scope.add(() => rain.userData.dispose());
  await scope.say('stunt_intro');
  await scope.say('stunt_roni');

  const g = board(ctx, scope, 'A_board');
  // 1. the reaction distance
  ctx.task?.set('stunt_react');
  await scope.say('stunt_react');
  let hints = 0;
  for (;;) {
    const c = await choose(ctx, scope, g, [
      ['ok', `⁦19.4⁩ מ׳/ש׳ × ⁦0.7⁩ ש׳ ≈ ⁦${dr.toFixed(1)}⁩ מ׳`], ['kmh', `⁦70⁩ × ⁦0.7⁩ = ⁦49⁩ מ׳`], ['one', `⁦19.4⁩ מ׳ (שנייה שלמה)`],
    ], 'ok', { w: 0.32, h: 0.11 });
    if (c === 'ok') { ctx.audio.sfx('ok'); break; }
    hints++; ctx.audio.sfx('no'); await scope.say(c === 'kmh' ? 'stunt_react_units' : 'stunt_react_time');
  }
  // 2. the braking distance on wet, from their own data
  ctx.task?.set('stunt_brake');
  await scope.say('stunt_brake');
  for (;;) {
    const c = await choose(ctx, scope, g, [
      ['wet', `⁦${dbData.toFixed(1)}⁩ מ׳ (רטוב, מהנתונים שלכם)`], ['dry', `⁦${dbDry.toFixed(1)}⁩ מ׳ (יבש)`], ['half', `⁦${(dbData / 2).toFixed(1)}⁩ מ׳`],
    ], 'wet', { w: 0.34, h: 0.11 });
    if (c === 'wet') { ctx.audio.sfx('ok'); break; }
    hints++; ctx.audio.sfx('no'); await scope.say(c === 'dry' ? 'stunt_brake_dry' : 'stunt_brake_half');
  }
  game.s.flags.stuntHints = hints;

  // 3. place the lamp; Roni drives; until the shot works
  const total = dr + dbData;
  const base = Math.round(total);
  const lamps = [base + 8, base + 4, base, base - 4, base - 13].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => b - a);
  let attempts = 0;
  for (;;) {
    attempts++;
    ctx.task?.set('stunt_lamp');
    scope.say(attempts === 1 ? 'stunt_lamp' : 'stunt_again');
    const lamp = await choose(ctx, scope, g, lamps.map(x => [x, `⁦${x}⁩ מ׳ לפני הקו`]), base, { w: 0.2, h: 0.11 });
    g.visible = false;
    let ride = params.get('ride') === 'on';
    if (attempts === 1 && !params.get('ride')) {
      const g2 = board(ctx, scope, 'A_board');
      ctx.task?.set('stunt_ride');
      scope.say('stunt_ride');
      ride = await choose(ctx, scope, g2, [[true, 'לשבת ליד רוני'], [false, 'לצפות מהמגדל']], false, { w: 0.3, h: 0.12 });
      g2.visible = false;
    }
    const lampObj = redLamp(); lampObj.position.set(LINE_X - lamp, 0, STRIP.z + STRIP.width / 2 + 0.9); lab.world.add(lampObj); scope.add(lampObj);
    await action(ctx, scope);
    ctx.task?.set('strip_watch');
    const rng = makeRng(game.s.seed * 101 + attempts);
    const brake = sampleRun(v, 'wet', rng).distance;
    const out = stuntOutcome(lamp, dr, brake);
    let lit = false;
    const res = await stripRun(ctx, scope, {
      kmh: v, brake, react: dr, surface: 'wet', driver: 'roni', rideAlong: ride, cliff: true, zero: LINE_X - lamp,
      onTick(t, plan) { if (!lit && plan.frontAt(t) >= 0) { lit = true; lampObj.userData.on(true); } },
    });
    lab.world.remove(res.car);
    lampObj.removeFromParent();
    game.s.flags.stuntLast = { lamp, kind: out.kind, miss: Math.round(out.miss * 10) / 10 };
    if (out.kind === 'ok') {
      ctx.audio.sfx('win');
      if (attempts === 1) game.award('צוק אחד');
      game.s.flags.stuntDone = true; game.s.flags.stuntAttempts = attempts;
      await scope.say('stunt_cut');
      await scope.say('stunt_roni_physics');
      break;
    }
    game.spend(out.kind === 'cliff' ? 30 : 10);
    ctx.audio.sfx('no');
    await scope.say(out.kind === 'cliff' ? 'stunt_cliff' : out.kind === 'over' ? 'stunt_over' : 'stunt_short');
    g.visible = true;
  }
  ctx.task?.clear();
  void engine; void THREE;
}

async function action(ctx, scope) {
  const { action: act } = await import('./stripKit.js');
  return act(ctx, scope, 'stunt_action');
}

/** The red signal lamp on a post beside the strip; on(true) lights it. */
function redLamp() {
  const g = new THREE.Group(); g.name = 'redLamp';
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x222222 })); post.position.y = 0.8; g.add(post);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111 })); housing.position.y = 1.8; g.add(housing);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x401010, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), bulbMat); bulb.position.set(0, 1.8, -0.16); bulb.rotation.y = Math.PI; g.add(bulb);
  const bulb2 = bulb.clone(); bulb2.position.z = 0.16; bulb2.rotation.y = 0; g.add(bulb2);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, toneMapped: false, depthWrite: false })); glow.position.y = 1.8; g.add(glow);
  g.userData.on = v => { bulbMat.color.setHex(v ? 0xff2a2a : 0x401010); glow.material.opacity = v ? 0.35 : 0; };
  return g;
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
