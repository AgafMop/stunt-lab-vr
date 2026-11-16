// Chapter "strip" — one brake test (spike version of spec §6 ch. 4):
//   pick a speed → optional ride-along with Bumper → clapper "Action!" → the car accelerates, the FRONT WHEEL crosses the
//   laser gate and it brakes fully → it stops exactly where model.js says → the student reads the radar and the ruler.
// The run's numbers come only from sampleRun (the science model); the motion follows brakeProfile, so what the student
// sees and what is recorded are the same thing.
import * as THREE from 'three';
import { board, row } from './kit.js';
import { sampleRun, makeRng, kmhToMs, G } from '../game/model.js';
import { brakeProfile } from '../game/carSim.js';
import { STRIP } from '../lab/stuntScene.js';

const SPEEDS = [40, 60, 80];
const RUNUP_ACCEL = 4;          // m/s² while accelerating to the target speed
const CRUISE = 6;               // m driven at constant speed before the gate
const FRONT = 1.35;             // front axle ahead of the car's origin (makeCar)
const num = s => `⁦${s}⁩`;

export async function run(ctx, scope) {
  const { ui, game, engine, lab, params, loco } = ctx;
  await loco.goTo('tower');
  const speedK = ctx.auto ? ctx.animSpeed : 1;
  const stripRun = ctx.stripRun = { frontX: null, read: null, rigTravel: 0, maxTilt: 0 };

  // ---- 1. speed ----
  const g = board(ctx, scope, 'A_board');
  ctx.task?.set('strip_pick');
  scope.say('strip_pick');
  const target = await choose(ctx, scope, g, SPEEDS.map(v => [v, `${num(v)} קמ״ש`]), 60);

  // ---- 2. ride along? ----
  const ride = params.get('ride');
  let rideAlong = ride === 'on';
  if (!ride) {
    ctx.task?.set('strip_ride');
    scope.say('strip_ride');
    rideAlong = await choose(ctx, scope, g, [[true, 'כן, אני נוסע/ת'], [false, 'אני נשאר/ת במגדל']], false);
  }
  game.s.flags.rodeAlong = rideAlong;
  g.visible = false;

  // ---- 3. Action! ----
  const clap = scope.add(clapper());
  lab.anchors.A_clapper.add(clap);
  ctx.task?.set('strip_action');
  await scope.say('strip_action');
  await scope.waitSelect(clap);
  clap.visible = false;
  ctx.task?.set('strip_watch');

  const { kmh, distance } = sampleRun(target, 'dry', makeRng(game.s.seed * 31 + 8));
  // the run's own friction (μ ± the noise) so the car stops exactly at the recorded distance
  const v = kmhToMs(kmh), prof = brakeProfile(v, v * v / (2 * G * distance));
  const runup = v * v / (2 * RUNUP_ACCEL);
  const gateX = STRIP.gateX, startFront = gateX - runup - CRUISE;
  const car = lab.makeCar(0xf07a1a);
  car.rotation.y = Math.PI / 2;                                    // heading +x along the strip
  const setFront = x => { car.position.set(x - FRONT, 0, STRIP.z); };
  setFront(startFront);
  lab.world.add(car); scope.add(car);
  ctx.track?.(car, 'stripCar');

  const seatP = car.getObjectByName('seatP'), eye = new THREE.Vector3();
  if (rideAlong) {
    await engine.fade(1, 200);
    loco.lock(true); loco.setPitch(-0.08);
    loco.follow(() => ({ pos: seatP.getWorldPosition(eye), yaw: car.rotation.y + Math.PI }));
    // an abort (teacher skip / game over) mid-ride must never leave the student riding a removed car
    scope.add(() => { if (loco.following) { loco.follow(null); loco.goTo('tower', { fade: false }); } loco.lock(false); });
    await engine.fade(0, 250);
  }
  const rigStart = engine.rig.position.clone();

  // the run: accelerate → cruise → gate → full brake (exact profile) → stop
  const tAcc = v / RUNUP_ACCEL, tCruise = CRUISE / v;
  await scope.guard(new Promise(res => {
    let t = 0;
    const off = engine.onFrame(dt => {
      t += dt * speedK;
      let front;
      if (t < tAcc) front = startFront + 0.5 * RUNUP_ACCEL * t * t;
      else if (t < tAcc + tCruise) front = startFront + runup + v * (t - tAcc);
      else front = gateX + prof.at(t - tAcc - tCruise).x;
      setFront(front);
      loco.applyFollow();
      if (rideAlong) {
        stripRun.rigTravel = Math.max(stripRun.rigTravel, engine.rig.position.distanceTo(rigStart));
        stripRun.maxTilt = Math.max(stripRun.maxTilt, Math.abs(engine.rig.rotation.x), Math.abs(engine.rig.rotation.z));
      }
      if (t >= tAcc + tCruise + prof.stopTime) { off(); res(); }
    });
    scope.add(off);
  }));
  ctx.audio.sfx('ok');
  stripRun.frontX = car.getObjectByName('frontWheel').getWorldPosition(eye).x - lab.strip.rulerZero.x;
  await scope.wait(900);

  if (rideAlong) {
    await engine.fade(1, 200);
    loco.follow(null);
    await loco.goTo('tower', { fade: false });
    await engine.fade(0, 250);
  }
  loco.lock(false);

  // ---- 4. read the radar and the ruler ----
  const radar = scope.add(ui.panel({ w: 0.34, h: 0.16, name: 'radar', viewDist: 1.2, draw(c, W, H) {
    ui.rr(c, 4, 4, W - 8, H - 8, 24); c.fillStyle = '#10141c'; c.fill();
    c.fillStyle = '#7CFF9B';
    ui.fitText(c, `${num(kmh)} קמ״ש`, { x: 16, y: 10, w: W - 32, h: H - 20, maxPx: H * 0.6, minPx: ui.minPx(900, 1.2), font: ui.FONT });
  } }));
  lab.anchors.A_radar.add(radar.mesh);

  const g2 = board(ctx, scope, 'A_board');
  const zoom = scope.add(ui.panel({ w: 0.9, h: 0.3, name: 'droneZoom', viewDist: 1.2, draw: (c, W, H) => drawZoom(ui, c, W, H, distance) }));
  zoom.mesh.position.set(0, 0.16, 0); g2.add(zoom.mesh);
  ctx.task?.set('strip_read');
  scope.say('strip_read');
  const base = Math.round(distance * 2) / 2;
  const options = [1, 0.5, 0, -0.5, -1].map(k => base + k).filter(x => x >= 0);   // row() is RTL: list high→low so the chips grow left→right like the ruler
  for (;;) {
    const read = await choose(ctx, scope, g2, options.map(x => [x, `${num(x.toFixed(1))} מ׳`]), distance, { y: -0.12, w: 0.16, h: 0.1 });
    if (read === distance) { stripRun.read = read; break; }
    ctx.audio.sfx('no');
    await scope.say('strip_wrong');
  }
  game.addTrial(kmh, { value: distance, kmh, target, by: 'student' });
  ctx.task?.clear();
  ctx.audio.sfx('ok');
  await scope.say('strip_done');
}

/** Picture-less choice cards on a board; resolves the chosen value. ?auto picks `autoValue`. */
async function choose(ctx, scope, g, items, autoValue, { y = 0, w = 0.26, h = 0.14 } = {}) {
  const { ui } = ctx;
  for (const ch of [...g.children]) if (ch.userData.choice) g.remove(ch);
  let pick; const chosen = new Promise(res => { pick = res; });
  const cards = items.map(([value, label]) => {
    const c = scope.add(ui.card({ w, h, label, name: 'choice', viewDist: 1.2, onSelect: cc => { ctx.audio.sfx('click'); for (const x of cards) x.setState(x === cc ? 'sel' : 'off'); pick(value); } }));
    c.mesh.userData.choice = true;
    return c;
  });
  row(g, cards, { y });
  const glowOffs = cards.map(c => ctx.attention?.(c.mesh) ?? (() => {}));
  scope.add(() => glowOffs.forEach(f => f()));
  const i = items.findIndex(([v]) => v === autoValue);
  if (ctx.auto) setTimeout(() => ctx.input.select(cards[Math.max(0, i)].mesh), 300);
  const value = await scope.guard(chosen);
  glowOffs.forEach(f => f());
  await scope.wait(250);
  for (const c of cards) g.remove(c.mesh);
  return value;
}

/** The drone's view of the ruler around the stopped car: ticks every 0.5 m, numbers every metre, the front wheel. */
function drawZoom(ui, c, W, H, d) {
  ui.rr(c, 4, 4, W - 8, H - 8, 24); c.fillStyle = '#3a3a40'; c.fill();
  const from = Math.floor(d) - 3, to = from + 7, X = m => 80 + (m - from) / (to - from) * (W - 160);
  c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff';
  const fs = ui.minPx(900, 1.2) + 4;
  c.font = `700 ${fs}px Heebo`; c.textAlign = 'center'; c.textBaseline = 'top';
  for (let m = from; m <= to + 1e-9; m += 0.5) {
    const major = Math.abs(m - Math.round(m)) < 1e-9;
    c.lineWidth = major ? 6 : 3;
    c.beginPath(); c.moveTo(X(m), H * 0.12); c.lineTo(X(m), H * (major ? 0.5 : 0.35)); c.stroke();
    if (major) c.fillText(`${m}`, X(m), H * 0.56);
  }
  // the car (from the left) and its front wheel exactly at d
  c.fillStyle = '#f07a1a'; c.fillRect(X(d - 3.45), H * 0.14, X(d + 0.75) - X(d - 3.45), H * 0.2);   // body: rear 3.45 m behind, nose 0.75 m ahead of the front axle
  c.fillStyle = '#111'; c.beginPath(); c.arc(X(d), H * 0.33, H * 0.07, 0, 7); c.fill();
  c.strokeStyle = '#7CFF9B'; c.lineWidth = 3; c.setLineDash([8, 6]);
  c.beginPath(); c.moveTo(X(d), H * 0.1); c.lineTo(X(d), H * 0.52); c.stroke(); c.setLineDash([]);
}

/** A clapperboard prop (click = "Action!"). */
function clapper() {
  const g = new THREE.Group(); g.name = 'clapper';
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  board.position.y = 0.09; g.add(board);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.022), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
  stick.position.set(0, 0.19, 0); stick.rotation.z = 0.25; g.add(stick);
  g.rotation.x = -0.3;
  return g;
}
