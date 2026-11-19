// Shared pieces of every strip chapter (main experiment, surfaces, the stunt):
//   stripRun()    one scripted run (stripPlan.js): accelerate → gate (signal) → reaction metres → brake → stop exactly at
//                 the model's distance; surfaces dry / wet / sand / oil, the sprinkler accident, a driver in the seat,
//                 optional ride-along, and the cliff (over the edge → parachute → down into the canyon)
//   choose()      picture-less choice cards on a board (glow until picked; ?auto picks autoValue)
//   readDistance() the drone's zoom of the ruler + the 5 reading chips (repeat until right)
//   clapper()     the film clapper prop
import * as THREE from 'three';
import { planStripRun } from '../game/stripPlan.js';
import { createCliffDrive, CLIFF } from '../game/cliffDrive.js';
import { STRIP, RIM_X } from '../world/layout.js';
import { row, board } from './kit.js';
import { createBumper } from '../world/bumper.js';

export const FRONT = 1.35;                     // front axle ahead of the car's origin (makeCar)
export const num = s => `⁦${s}⁩`;
export const EDGE_M = RIM_X - 0.3 - STRIP.gateX;  // the cliff edge in ruler metres (front axle over the lip)

// ---------- surfaces ----------
function blotchTexture(colorA, colorB, n = 40) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = colorA; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 10 + Math.random() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, colorB); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const OFF = { polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 };
/** A layer over the strip from the gate to the end: what the car brakes on. */
export function surfaceLayer(surface) {
  if (surface === 'dry') return null;
  const len = STRIP.endX - STRIP.gateX + 6, w = STRIP.width - 0.3;
  let mat;
  if (surface === 'wet') mat = new THREE.MeshStandardMaterial({ color: 0x5a6f88, roughness: 0.06, metalness: 0.7, transparent: true, opacity: 0.5, ...OFF });
  if (surface === 'sand') { const t = blotchTexture('#c98a52', 'rgba(236,180,120,0.9)'); t.repeat.set(len / 6, 1); mat = new THREE.MeshStandardMaterial({ map: t, roughness: 1, transparent: true, opacity: 0.92, ...OFF }); }
  if (surface === 'oil') { const t = blotchTexture('rgba(20,16,12,0.0)', 'rgba(12,10,8,0.95)', 70); t.repeat.set(len / 8, 1); mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.05, metalness: 0.8, transparent: true, ...OFF }); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(STRIP.gateX - 3 + len / 2, 0.02, STRIP.z); m.name = `surface_${surface}`; m.receiveShadow = true;
  return m;
}

/** The set's sprinkler beside the strip: a head on a pipe; spray(on) makes it spray over the strip. */
export function sprinkler(ctx) {
  const g = new THREE.Group(); g.name = 'sprinkler';
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.8, roughness: 0.35 });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10), metal); pipe.position.y = 0.6; g.add(pipe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), metal); head.position.y = 1.22; g.add(head);
  g.position.set(STRIP.gateX + 18, 0, STRIP.z - STRIP.width / 2 - 0.8);
  const N = 500, pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) vel.push(new THREE.Vector3());
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false }));
  drops.visible = false; drops.frustumCulled = false; g.add(drops);
  let on = false;
  const reset = (i) => { pos[i * 3] = 0; pos[i * 3 + 1] = 1.25; pos[i * 3 + 2] = 0; const a = (Math.random() - 0.5) * 1.6, s = 5 + Math.random() * 3; vel[i].set(Math.sin(a) * s * 0.6, 2 + Math.random() * 2, Math.cos(a) * s); };
  for (let i = 0; i < N; i++) { reset(i); pos[i * 3 + 1] = -10; }
  const off = ctx.engine.onFrame(dt => {
    if (!on && !drops.visible) return;
    for (let i = 0; i < N; i++) {
      vel[i].y -= 9.8 * dt;
      pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt;
      if (pos[i * 3 + 1] < 0) { if (on) reset(i); else pos[i * 3 + 1] = -10; }
    }
    geo.attributes.position.needsUpdate = true;
  });
  g.userData = { spray(v) { on = v; if (v) drops.visible = true; }, dispose: off };
  return g;
}

// ---------- drivers in the seat ----------
export function makeDriver(ctx, kind) {
  if (kind === 'bumper') {
    // seated in the driver's seat: pelvis on the cushion (y 0.50), back against the seat back, hands at ten to two on
    // the wheel (CAR_steer, hub (0.38, 0.80, 0.10)), head under the headliner (y ≈ 1.27); the pose and this transform
    // are solved together in blender/build_bumper.py (GLB model: pos (0.38, 0.232, -0.47), scale 0.92)
    const b = createBumper(ctx.engine, ctx.audio);
    const { pos, scale } = b.userData.seat;
    b.scale.setScalar(scale); b.position.fromArray(pos);
    b.userData.sit(true);
    return b;
  }
  // Roni: deep-red racing suit, red helmet with a dark mirrored visor (her face is never shown)
  const g = new THREE.Group(); g.name = 'roni';
  const suit = new THREE.MeshStandardMaterial({ color: 0x7a1414, roughness: 0.6 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0x8e1a1a, roughness: 0.25, metalness: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.05, metalness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), suit); torso.position.y = 0.74; g.add(torso);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.32, 3, 8), suit); arm.position.set(s * 0.2, 0.78, 0.15); arm.rotation.x = 1.0; g.add(arm); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), helmet); head.position.y = 1.1; g.add(head);   // under the new car's roof (headliner y 1.27)
  const v = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 10, -0.9, 1.8, 1.1, 0.75), visor); v.position.y = 1.1; v.rotation.y = 0; g.add(v);
  g.position.set(0.38, 0, -0.45);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A big bright-orange parachute (the film's) that opens out of the car's roof. */
function parachute() {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, side: THREE.DoubleSide }));
  canopy.position.y = 4.2; g.add(canopy);
  const lines = []; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; lines.push(new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(Math.cos(a) * 2.3, 4.6, Math.sin(a) * 2.3)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0xffffff })));
  g.scale.setScalar(0.05);
  return g;
}

/** One frame of a car falling off the lip: a short free fall, the chute opens, it drifts down. True when done. */
function stepFall(fall, dt, car, chute) {
  fall.t += dt;
  const open = fall.t > 0.7;
  fall.vy -= (open ? 2.0 : 9.8) * dt; if (open) { fall.vy = Math.max(fall.vy, -3.2); fall.vx *= Math.exp(-1.2 * dt); }
  fall.x += fall.vx * dt; fall.y += fall.vy * dt;
  car.position.set(fall.x, fall.y, STRIP.z); car.rotation.z = open ? Math.sin(fall.t * 1.3) * 0.08 : -Math.min(0.5, fall.t * 0.9);
  if (open) chute.scale.setScalar(Math.min(1, chute.scale.x + dt * 1.8));
  return fall.t > 4.5;
}

/**
 * One scripted run. kmh: gate speed; brake: braking metres; react: metres at full speed after the gate (signal) before
 * braking; surface: what the layer shows ('sprinkler' = the accident: the sprinkler sprays as the car arrives);
 * driver: 'bumper' | 'roni' | null; rideAlong: the student rides in the passenger seat; cliff: the run may go over
 * the edge (stunt). Resolves { car, stop (ruler m of the front axle), fell }.
 */
export async function stripRun(ctx, scope, { kmh, brake, react = 0, surface = 'dry', driver = 'bumper', rideAlong = false, cliff = false, color = 0xf07a1a, slowMo = 1, speed = 1, zero = STRIP.gateX, onTick = null }) {
  const { engine, lab, loco } = ctx;
  const speedK = (ctx.auto ? ctx.animSpeed : 1) * speed;              // speed > 1: the crew's time-lapse runs
  const plan = planStripRun({ kmh, brake, react, edge: cliff ? RIM_X - 0.3 - zero : null });   // the lip, in metres from `zero`
  const car = scope.add(lab.makeCar(color));
  car.rotation.y = Math.PI / 2;                                    // heading +x along the strip
  const setFront = m => car.position.set(zero + m - FRONT, 0, STRIP.z);           // zero: where the brake point (gate) is
  setFront(plan.start);
  lab.world.add(car);
  ctx.track?.(car, 'stripCar');
  let driverObj = null;
  if (driver) { driverObj = makeDriver(ctx, driver); car.add(driverObj); scope.add(() => driverObj.userData.dispose?.()); }
  const layer = surface !== 'dry' && surface !== 'sprinkler' ? surfaceLayer(surface) : null;
  if (layer) { lab.world.add(layer); scope.add(layer); }
  let spr = null, wetLater = null;
  if (surface === 'sprinkler') {
    spr = sprinkler(ctx); lab.world.add(spr); scope.add(spr); scope.add(() => spr.userData.dispose());
    wetLater = surfaceLayer('wet'); wetLater.material.opacity = 0; lab.world.add(wetLater); scope.add(wetLater);
  }

  const seatP = car.getObjectByName('seatP'), eye = new THREE.Vector3();
  if (rideAlong) {
    await engine.fade(1, 200);
    loco.lock(true); loco.setPitch(-0.08);
    loco.follow(() => ({ pos: seatP.getWorldPosition(eye), yaw: car.rotation.y + Math.PI }));
    ctx.rideCar = car; ctx.rideSeat = 'seatP';                       // the guide docks the subtitles on its windshield
    scope.add(() => { ctx.rideCar = null; if (loco.following) { loco.follow(null); loco.goTo('tower', { fade: false }); } loco.lock(false); });
    await engine.fade(0, 250);
  }
  let fell = false;
  const rigStart = engine.rig.position.clone();
  await scope.guard(new Promise(res => {
    let t = 0, fall = null;
    const chute = cliff ? parachute() : null;
    const off = engine.onFrame(dt => {
      const brakingNow = t > 0 && plan.frontAt(t) > plan.brakeAt;
      t += dt * speedK * (brakingNow ? slowMo : 1);
      if (spr) {                                                   // the sprinkler wakes as the car approaches the gate
        const f = plan.frontAt(t);
        if (f > -25 && !spr.userData.on) { spr.userData.on = true; spr.userData.spray(true); }
        wetLater.material.opacity = Math.min(0.5, wetLater.material.opacity + dt * 0.6);
      }
      if (plan.over && t >= plan.over.t) {                         // over the edge: fly, chute, drift down
        if (!fall) { fall = { t: 0, x: car.position.x, y: 0, vx: plan.over.speed, vy: 0 }; fell = true; car.add(chute); ctx.audio.sfx?.('whoosh'); }
        const ended = stepFall(fall, dt * speedK, car, chute);
        loco.applyFollow();
        if (ended) { off(); res(); }
        return;
      }
      setFront(plan.frontAt(t));
      onTick?.(t, plan, car, driverObj);
      loco.applyFollow();
      if (rideAlong && ctx.stripRun) {                             // comfort audit: the rig moves level with the car
        ctx.stripRun.rigTravel = Math.max(ctx.stripRun.rigTravel, engine.rig.position.distanceTo(rigStart));
        ctx.stripRun.maxTilt = Math.max(ctx.stripRun.maxTilt, Math.abs(engine.rig.rotation.x), Math.abs(engine.rig.rotation.z));
      }
      if (t >= plan.duration) { off(); res(); }
    });
    scope.add(off);
  }));
  if (spr) spr.userData.spray(false);
  ctx.audio.sfx('ok');
  if (rideAlong) {
    await scope.wait(700);
    await engine.fade(1, 200);
    loco.follow(null);
    await loco.goTo('tower', { fade: false });
    await engine.fade(0, 250);
  }
  loco.lock(false);
  return { car, stop: fell ? null : plan.stop, fell, plan };
}

// ---------- the student drives to the line (cliffDrive.js) ----------
export const LINE_X = STRIP.endX - 3;                      // the painted stop line before the cliff (world x)

/** Brake pressed now: any trigger in the headset; S / ↓ / Space or the mouse on the desktop. */
function brakeInput(ctx) {
  const keys = new Set(); let mouse = false;
  const kd = e => keys.add(e.code), ku = e => keys.delete(e.code);
  const md = () => { mouse = true; }, mu = () => { mouse = false; };
  const el = ctx.engine.renderer.domElement;
  addEventListener('keydown', kd); addEventListener('keyup', ku); el.addEventListener('pointerdown', md); addEventListener('pointerup', mu);
  return {
    down() {
      if (ctx.engine.renderer.xr.getSession?.()) return ctx.input.pointers.some(p => (p.source?.gamepad?.buttons?.[0]?.value ?? 0) > 0.5);
      return mouse || keys.has('KeyS') || keys.has('ArrowDown') || keys.has('Space');
    },
    dispose() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); el.removeEventListener('pointerdown', md); removeEventListener('pointerup', mu); },
  };
}

/**
 * The student in the driver's seat of the strip car: it speeds up to `kmh` by itself and holds it; one press of the
 * brake stops it with the road's deceleration (`brake` m from `kmh`). lamp: metres before the line where the red lamp
 * lights as the front passes it (the big shot); passenger: 'roni' beside the student. Over the lip: a fade, and the
 * fall (chute) is watched from the tower. ?auto presses at the front position `autoPressAt`. ready(): awaited once
 * seated, before the car moves.
 * Resolves { stop (m past the line), fell, brakeX, reaction (s from the lamp to the press), early }.
 */
export async function driveToLine(ctx, scope, { kmh = 70, brake, surface = 'dry', lamp = null, passenger = null, autoPressAt = null, color = 0x2a7de1, ready = null }) {
  const { engine, lab, loco } = ctx;
  const k = ctx.auto ? ctx.animSpeed : 1;
  const runup = (kmh / 3.6) ** 2 / (2 * CLIFF.accel);
  const d = createCliffDrive({ kmh, brake, start: -runup - (lamp != null ? Math.max(60, lamp + 18) : 60) });
  const s = d.state;
  const take = [];                                              // this take's objects: gone when it ends (retries start clean)
  const own = o => { scope.add(o); take.push(o); return o; };
  const car = own(lab.makeCar(color));
  car.rotation.y = Math.PI / 2;                                    // heading +x along the strip, toward the cliff
  const setFront = m => car.position.set(LINE_X + m - FRONT, 0, STRIP.z);
  setFront(s.x); lab.world.add(car);
  ctx.track?.(car, 'stripCar');
  if (passenger) { const p = makeDriver(ctx, passenger); p.position.x = -0.38; car.add(p); scope.add(() => p.userData.dispose?.()); }
  const layer = surfaceLayer(surface); if (layer) { lab.world.add(layer); own(layer); }
  // the line, readable from the driver's seat (a 0.45 m stripe is a hair at 40 m): a signal gantry standing ON it, posts
  // at both road edges; its big red light is the signal in the big shot — straight ahead, where the driver looks.
  // The roadside post at `lamp` m only marks where the signal fires (when the front passes it; the old lamp lit there,
  // ≈ 70° to the side of the driver = outside the headset's view).
  const gantry = own(lineGantry()); lab.world.add(gantry);
  let lampObj = null, lampT = null;
  if (lamp != null) { lampObj = own(redLamp()); lampObj.position.set(LINE_X - lamp, 0, STRIP.z + STRIP.width / 2 + 0.9); lab.world.add(lampObj); }
  const signal = on => { gantry.userData.on(on); lampObj?.userData.on(on); };
  const brk = brakeInput(ctx); scope.add(() => brk.dispose());
  ctx.cliffState = s;                                           // tests read the live run

  // into the driver's seat
  const seat = car.getObjectByName('seat'), eye = new THREE.Vector3();
  await engine.fade(1, 200);
  loco.lock(true); loco.setPitch(-0.05);
  loco.follow(() => ({ pos: seat.getWorldPosition(eye), yaw: car.rotation.y + Math.PI }));
  ctx.rideCar = car; ctx.rideSeat = 'seat';                    // the guide: task card on its dash, subtitles on its glass
  scope.add(() => { ctx.rideCar = null; if (loco.following) { loco.follow(null); loco.goTo('tower', { fade: false }); } loco.lock(false); });
  const leave = async () => {
    await engine.fade(1, 220);
    loco.follow(null); ctx.rideCar = null;
    await loco.goTo('tower', { fade: false });
    loco.lock(false);
    await engine.fade(0, 300);
  };
  loco.applyFollow();
  await engine.fade(0, 250);
  await scope.wait(500);
  if (ready) await ready();                                      // seated: the last instruction before the car moves

  // drive: the first press after the start (a trigger already held must be let go first) latches full braking
  let released = !brk.down(), stopT = null;
  await scope.guard(new Promise(res => {
    const off = engine.onFrame(dt => {
      const now = brk.down();
      if (!now) released = true;
      let left = Math.min(dt, 0.1) * k;
      while (left > 1e-6 && s.phase !== 'stopped' && s.phase !== 'over') {
        const h = Math.min(left, 1 / 120); left -= h;
        const press = ctx.auto ? autoPressAt != null && s.x >= autoPressAt : now && released;
        d.step(h, press);
        if (lampObj && lampT == null && s.x >= -lamp) { lampT = s.t; signal(true); ctx.cliffLit = true; }
      }
      setFront(s.x);
      loco.applyFollow();
      if (s.phase === 'over') { off(); res(); }
      if (s.phase === 'stopped') { stopT ??= performance.now(); if (performance.now() - stopT > 900 / k) { off(); res(); } }
    });
    scope.add(off);
  }));
  const fell = s.phase === 'over';
  const out = { stop: s.x, fell, brakeX: s.brakeX, reaction: lampT != null && s.brakeT != null && s.brakeT >= lampT ? (s.brakeT - lampT) : null,           // sim seconds (= real ones unless ?auto)
    early: lamp != null && s.brakeT != null && (lampT == null || s.brakeT < lampT) };
  if (fell) {
    // first-person over the edge is no fun in a headset: cut to the tower at the lip and watch the car go
    const lipX = car.position.x, v = s.overSpeed;
    await leave();
    const chute = parachute(); car.add(chute);
    ctx.audio.sfx?.('whoosh');
    const fall = { t: 0, x: lipX, y: 0, vx: v, vy: 0 };
    await scope.guard(new Promise(res => {
      const off = engine.onFrame(dt => { if (stepFall(fall, Math.min(dt, 0.1) * k, car, chute)) { off(); res(); } });
      scope.add(off);
    }));
  } else {
    ctx.audio.sfx('ok');
    await leave();
  }
  signal(false);
  for (const o of take) o.removeFromParent();
  ctx.cliffState = null; ctx.cliffLit = false;
  return out;
}

/** A gantry standing on the stop line: red-and-white posts at both road edges, a beam, a big red signal facing the
 *  driver (on(true) lights it). */
function lineGantry() {
  const g = new THREE.Group(); g.name = 'lineGantry';
  const red = new THREE.MeshStandardMaterial({ color: 0xd22a1e, roughness: 0.6 }), white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.7 });
  const H = 4.6, half = STRIP.width / 2 + 0.5;
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, H / 6, 10), i % 2 ? white : red);
    seg.position.set(0, H / 12 + i * H / 6, side * half); g.add(seg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 2 * half), dark); beam.position.y = H; g.add(beam);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.9), dark); box.position.y = H - 0.55; g.add(box);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x3a0e0e, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), bulbMat); bulb.position.set(-0.18, H - 0.55, 0); bulb.rotation.y = -Math.PI / 2; g.add(bulb);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  glow.position.set(-0.3, H - 0.55, 0); g.add(glow);
  g.position.set(LINE_X, 0, STRIP.z);
  g.userData.on = v => { bulbMat.color.setHex(v ? 0xff2a2a : 0x3a0e0e); glow.material.opacity = v ? 0.4 : 0; };
  return g;
}

/** The red signal lamp on a post beside the strip; on(true) lights it. */
export function redLamp() {
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

// ---------- choosing and reading ----------
/** Picture-less choice cards on a board; resolves the chosen value. ?auto picks `autoValue`. */
export async function choose(ctx, scope, g, items, autoValue, { y = 0, w = 0.26, h = 0.14, viewDist = 1.2 } = {}) {
  const { ui } = ctx;
  for (const ch of [...g.children]) if (ch.userData.choice) g.remove(ch);
  let pick; const chosen = new Promise(res => { pick = res; });
  const cards = items.map(([value, label]) => {
    const c = scope.add(ui.card({ w, h, label, name: 'choice', viewDist, onSelect: cc => { ctx.audio.sfx('click'); for (const x of cards) x.setState(x === cc ? 'sel' : 'off'); pick(value); } }));
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

/** The drone's zoom of the ruler at `distance` and 5 reading chips; repeats until the right one. Resolves tries. */
export async function readDistance(ctx, scope, distance, { say = true } = {}) {
  const { ui } = ctx;
  const g2 = board(ctx, scope, 'A_board');
  const zoom = scope.add(ui.panel({ w: 0.9, h: 0.3, name: 'droneZoom', viewDist: 1.2, draw: (c, W, H) => drawZoom(ui, c, W, H, distance) }));
  zoom.mesh.position.set(0, 0.16, 0); g2.add(zoom.mesh);
  ctx.task?.set('strip_read');
  if (say) scope.say('strip_read');
  const base = Math.round(distance * 2) / 2;
  const options = [1, 0.5, 0, -0.5, -1].map(k => base + k).filter(x => x >= 0);
  let tries = 0;
  for (;;) {
    tries++;
    const read = await choose(ctx, scope, g2, options.map(x => [x, `${num(x.toFixed(1))} מ׳`]), distance, { y: -0.12, w: 0.16, h: 0.1 });
    if (read === distance) break;
    ctx.audio.sfx('no');
    await scope.say('strip_wrong');
  }
  g2.visible = false;
  return tries;
}

/** The drone's view of the ruler around the stopped car: ticks every 0.5 m, numbers every metre, the front wheel. */
export function drawZoom(ui, c, W, H, d) {
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
  c.fillStyle = '#f07a1a'; c.fillRect(X(d - 3.45), H * 0.14, X(d + 0.75) - X(d - 3.45), H * 0.2);
  c.fillStyle = '#111'; c.beginPath(); c.arc(X(d), H * 0.33, H * 0.07, 0, 7); c.fill();
  c.strokeStyle = '#7CFF9B'; c.lineWidth = 3; c.setLineDash([8, 6]);
  c.beginPath(); c.moveTo(X(d), H * 0.1); c.lineTo(X(d), H * 0.52); c.stroke(); c.setLineDash([]);
}

/** A real film clapper (click = "Action!"). */
export function clapper() {
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const stripes = tex(256, 40, (g, w, h) => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#141414'; for (let x = -40; x < w; x += 52) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 26, h); g.lineTo(x + 52, 0); g.lineTo(x + 26, 0); g.fill(); } });
  const slate = tex(256, 190, (g, w, h) => { g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(240,240,235,0.85)'; g.lineWidth = 4; for (const y of [60, 110, 160]) { g.beginPath(); g.moveTo(14, y); g.lineTo(w - 14, y); g.stroke(); } for (const x of [w / 3, 2 * w / 3]) { g.beginPath(); g.moveTo(x, 60); g.lineTo(x, 110); g.stroke(); } });
  const g = new THREE.Group(); g.name = 'clapper';
  const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
  const board_ = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.02), [dark, dark, dark, dark, new THREE.MeshStandardMaterial({ map: slate, roughness: 0.8 }), dark]);
  board_.position.y = 0.09; g.add(board_);
  const stickMat = [dark, dark, new THREE.MeshStandardMaterial({ map: stripes }), dark, new THREE.MeshStandardMaterial({ map: stripes }), dark];
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.022), stickMat); base.position.y = 0.185; g.add(base);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.022), stickMat);
  stick.geometry.translate(0.11, 0, 0); stick.position.set(-0.11, 0.205, 0); stick.rotation.z = 0.32; g.add(stick);
  g.rotation.x = -0.3;
  return g;
}

/** Click the clapper on the desk ("Action!"). */
export async function action(ctx, scope, line = 'strip_action') {
  const clap = scope.add(clapper());
  ctx.lab.anchors.A_clapper.add(clap);
  ctx.task?.set('strip_action');
  await scope.say(line);
  await scope.waitSelect(clap);
  clap.visible = false;
  ctx.audio.sfx('click');
}
