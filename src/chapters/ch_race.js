// Chapter 1 — the qualifying race (spec §6 ch. 1, spike version):
//   1. view choice: in the car (cockpit) or remote control from the tower (tabletop model); ?ride=off forces the table
//   2. start-light drill × START_DRILLS: the student's real simple reaction time; a press before lights-out, or a
//      trigger already held at lights-out, is a false start and does not count
//   3. one lap against Bumper and four more drivers — all real cars, solid against each other (raceField.js); rushing the
//      wet corner ends in the sand (inertia + friction teaser)
import * as THREE from 'three';
import { boardAtStation, row } from './kit.js';
import { createDriveSession } from '../core/driveSession.js';
import { assistInput } from '../game/assist.js';
import { classifyStart, makeRng } from '../game/model.js';
import { START_DRILLS, LIGHTS, GHOST, WET_RUSH } from '../game/config.js';
import { speedProfile } from '../game/track.js';
import { reactionDistance } from '../game/model.js';
import { createField, gridSlot, PLAYER_SLOT } from '../game/raceField.js';

const AUTO_REACTION_MS = 250;

export async function run(ctx, scope) {
  const { ui, game, params, engine } = ctx;
  await ctx.loco.goTo('tower');
  const ride = params.get('ride');
  const drive = createDriveSession(ctx, {
    forced: ride === 'off',
    timeScale: ctx.auto ? ctx.animSpeed : 1, maxSub: ctx.auto ? 400 : 30,
  });
  ctx.drive = drive;
  scope.add(() => {                                   // also on abort: back to the tower, nothing left following/locked
    const wasRiding = ctx.loco.following;
    drive.dispose(); ctx.drive = null;
    if (wasRiding) ctx.loco.goTo('tower', { fade: false });
    ctx.loco.lock(false);
  });

  // ---- 1. view choice ----
  // desktop: straight into the racing-game chase view (V switches to the driver's seat); headset: the student chooses
  let view = ride === 'off' ? 'table' : ride === 'on' ? 'cockpit' : ride === 'chase' ? 'chase' : engine.isXR() ? null : 'chase';
  if (!view) {
    const g = boardAtStation(ctx, scope, 'tower', { dist: 1.0, height: 1.3 }); g.name = 'viewChoice';
    let pick; const chosen = new Promise(res => { pick = res; });
    const cards = [['cockpit', 'בתוך הרכב', ICON_CAR], ['table', 'שלט רחוק מהמגדל', ICON_TABLE]].map(([id, label, icon]) => scope.add(ui.card({
      w: 0.32, h: 0.36, label, icon, name: 'view', viewDist: 1.0,
      onSelect: c => { ctx.audio.sfx('click'); for (const x of cards) x.setState(x === c ? 'sel' : 'off'); pick(id); },
    })));
    row(g, cards);
    const glowOffs = cards.map(c => ctx.attention?.(c.mesh) ?? (() => {}));
    scope.add(() => glowOffs.forEach(f => f()));
    ctx.task?.set('race_choose');
    scope.say('race_choose');
    if (ctx.auto) setTimeout(() => ctx.input.select(cards[0].mesh), 300);
    view = await scope.guard(chosen);
    glowOffs.forEach(f => f());
    g.visible = false;
  }
  game.s.flags.view = view;
  const slot = gridSlot(PLAYER_SLOT);
  drive.placeAt(slot.s, slot.u);                      // 4th on the grid: slower cars ahead to pass, faster ones behind
  drive.freeze(true);
  // ---- the field: five rival drivers on the grid, real cars (same physics, barriers, and solid against the student) ----
  const field = createField(drive.track, drive.walls, { ghostPace: GHOST });
  const rivals = field.field.map(r => {
    // headset: always the light car (6 draw calls, 2.7 K triangles — Quest budget); desktop: the full car up close
    const car3d = scope.add(ctx.lab.makeCar(r.color, engine.isXR() ? { lo: true } : { lod: true })); car3d.name = `rival_${r.id}`;
    car3d.traverse(o => { if (o.isMesh) o.castShadow = false; });     // the cockpit lap stays inside the triangle budget
    ctx.lab.world.add(car3d);
    const mini = scope.add(ctx.lab.makeCar(r.color, { lo: true })); mini.scale.setScalar(ctx.lab.TABLE.carScale); mini.userData.follow = false;
    ctx.lab.mini.add(mini);
    return { r, car3d, mini };
  });
  const placeRivals = () => { for (const { r, car3d, mini } of rivals) {
    car3d.position.set(ctx.lab.track3d.position.x + r.car.x, 0, ctx.lab.track3d.position.z + r.car.z); car3d.rotation.y = r.car.heading - (r.car.slip || 0);
    ctx.lab.placeMini(mini, r.car, false);
  } };
  placeRivals();
  scope.add(engine.onFrame(placeRivals));
  scope.add(drive.onStep((car, h) => { for (const hit of field.step(h, car)) drive.bump(hit.v); }));
  ctx.field = field;
  await scope.guard(drive.view.setMode(view));
  drive.start();

  // ---- 2. start-light drill ----
  const lights = scope.add(gantry());
  // desktop: the lights + the reaction times also as a big overlay at the top of the screen (readable in any view);
  // in the chase camera the 3D lights are hidden (too far away to read)
  const hudL = engine.isXR() ? null : ctx.raceHud?.lights;
  let drillOn = true;
  if (hudL) {
    const setLit0 = lights.userData.setLit, setAll0 = lights.userData.setAll;
    lights.userData.setLit = n => { setLit0(n); hudL.lit(n); };
    lights.userData.setAll = v => { setAll0(v); hudL.lit(v ? 5 : 0); };
    hudL.lit(0); hudL.times([], START_DRILLS); hudL.show(true);
    scope.add(() => hudL.show(false));
  }
  const placeLights = () => {
    if (drive.view.mode === 'cockpit') { drive.car3d.add(lights); lights.position.set(0, 1.75, 4.5); lights.rotation.set(0, Math.PI, 0); lights.scale.setScalar(1.6); }
    else if (drive.view.mode === 'chase') { drive.car3d.add(lights); lights.position.set(0, 4.2, 18); lights.rotation.set(0, Math.PI, 0); lights.scale.setScalar(3.2); }   // a start gantry over the road
    else { ctx.lab.anchors.A_table.add(lights); lights.position.set(0, 0.62, -1.5); lights.rotation.set(0, 0, 0); lights.scale.setScalar(1.5); }   // far edge of the table, just under eye level
  };
  placeLights();
  const lightsVis = () => { lights.visible = drillOn && !(hudL && drive.view.mode === 'chase'); };
  lightsVis();
  let placedFor = drive.view.mode;
  const offPlace = engine.onFrame(() => { if (drive.view.mode !== placedFor) { placedFor = drive.view.mode; placeLights(); lightsVis(); } });
  scope.add(offPlace);
  let timesList = [];
  const times = scope.add(ui.panel({ w: 1.0, h: 0.16, name: 'reactionTimes', viewDist: 2, draw: (c, W, H) => drawTimes(ui, c, W, H, timesList) }));
  lights.add(times.mesh); times.mesh.position.set(0, -0.24, 0);
  const showTimes = list => { timesList = [...list]; times.redraw(); hudL?.times(timesList, START_DRILLS); };
  game.s.reaction = { simple: [], falseStarts: 0 };
  const rng = makeRng(game.s.seed * 13 + 5);
  let forceFalse = params.has('forcefalse');
  // driving needs controllers: in the headset with hand tracking only, ask for them and wait (?nocontrollers simulates it)
  const noControllers = () => params.has('nocontrollers') || (engine.isXR() && !drive.input.hasControllers());
  const ensureControllers = async () => {
    if (!noControllers()) return;
    ctx.task?.set('race_controllers');
    await scope.say('race_controllers');
    while (noControllers()) { await scope.wait(500); if (noControllers()) await scope.say('race_controllers'); }
    ctx.task?.set('race_drill');
  };
  await ensureControllers();
  ctx.task?.set('race_drill');
  await scope.say('race_lights');
  while (game.s.reaction.simple.length < START_DRILLS) {
    await ensureControllers();
    const res = await scope.guard(startDrill(ctx, scope, drive, lights, rng, forceFalse));
    forceFalse = false;
    if (res.kind === 'ok') {
      game.s.reaction.simple.push(res.reaction);
      ctx.audio.sfx('ok');
      showTimes(game.s.reaction.simple);
    } else if (res.kind === 'none') {
      await scope.say('race_lights');
    } else {
      game.s.reaction.falseStarts++;
      ctx.audio.sfx('no');
      for (let k = 0; k < 2; k++) { lights.userData.setAll(true); await scope.wait(250); lights.userData.setAll(false); await scope.wait(250); }  // 2 slow pulses (< 3/s)
      await scope.say('race_falsestart');
    }
    await scope.wait(700);
  }
  drillOn = false; lights.visible = false;
  if (hudL) setTimeout(() => hudL.show(false), 1800);                     // the three times stay a moment, then the card explains them

  // ---- 2b. what the reaction time MEANS (spec §6: d_r = v · t_r) — it is used again on the strip and in the stunt ----
  const tr = game.s.reaction.mean = game.s.reaction.simple.reduce((a, b) => a + b, 0) / game.s.reaction.simple.length;
  const blind = reactionDistance(50, tr);
  game.s.flags.reactionExplained = blind;
  {
    const g = boardAtStation(ctx, scope, 'tower', { dist: 1.05, height: 1.3 }); g.name = 'reactionCard';
    const f1 = n => n.toFixed(2), f0 = n => n.toFixed(1);
    const card = scope.add(ui.panel({ w: 0.82, h: 0.44, name: 'reactionCard', viewDist: 1.05, draw(c, W, H) {
      ui.rr(c, 6, 6, W - 12, H - 12, 30); c.fillStyle = ui.C.bg; c.fill(); c.lineWidth = 6; c.strokeStyle = '#FFB347'; c.stroke();
      const mp = ui.minPx(900, 1.05), F = ui.FONT;
      c.fillStyle = '#FFB347'; ui.fitText(c, 'זמן התגובה שלך', { x: 30, y: 16, w: W - 60, h: H * 0.13, maxPx: H * 0.1, minPx: mp, font: F });
      c.fillStyle = ui.C.ink; ui.fitText(c, `⁦${f1(tr)}⁩ שניות`, { x: 30, y: H * 0.17, w: W - 60, h: H * 0.2, maxPx: H * 0.17, minPx: mp, font: F, weight: 800 });
      ui.fitText(c, `ב-⁦50⁩ קמ״ש הרכב נוסע עוד ⁦${f0(blind)}⁩ מטר לפני שהרגל בכלל לוחצת על הבלם.`, { x: 30, y: H * 0.42, w: W - 60, h: H * 0.2, maxPx: H * 0.08, minPx: mp, font: F, weight: 600 });
      c.fillStyle = '#9FB0C8'; ui.fitText(c, 'זה "מרחק התגובה". בכביש אמיתי, כשלא יודעים מתי משהו יקרה, זמן התגובה ארוך פי 3–4.', { x: 30, y: H * 0.64, w: W - 60, h: H * 0.18, maxPx: H * 0.065, minPx: mp, font: F, weight: 500 });
    } }));
    g.add(card.mesh);
    const ok = scope.add(ui.button3d('הבנתי! להקפה', () => {}, { w: 0.34, h: 0.09, viewDist: 1.05 }));
    ok.mesh.position.set(0, -0.29, 0.01); g.add(ok.mesh);
    ctx.task?.set('race_reaction');
    await scope.say('race_reaction1');
    await scope.say('race_reaction2');
    await scope.waitSelect(ok.mesh);
    g.visible = false;
  }

  // ---- 3. one lap against Bumper and the others (the field was on the grid all along) ----
  const track = drive.track;
  const bumper = field.field.find(r => r.id === 'bumper');
  let done = false, progress = 0, lastS = drive.car.near?.s ?? 0, armed = false, raceT = 0;
  let racing = false;
  const offHud = engine.onFrame(dt => {
    if (!racing || done) return;
    raceT += dt * (ctx.auto ? ctx.animSpeed : 1);
    const from = field.player.startS;                                    // the HUD measures from the start line
    ctx.raceHud?.update({ t: raceT, progress: progress + from, ghost: bumper.progress + bumper.startS, length: track.length,
      speed: drive.car.speed, car: drive.car, place: field.place(progress), of: field.field.length + 1,
      rivals: field.field.map(r => ({ x: r.car.x, z: r.car.z, heading: r.car.heading, color: r.color })) });
  });
  scope.add(offHud);
  const offStep = drive.onStep(car => {
    const { s } = car.near;
    let ds = s - lastS; if (ds < -track.length / 2) ds += track.length; if (ds > track.length / 2) ds -= track.length;
    if (Math.abs(ds) < 20) progress += ds;                       // respawns jump; ignore those
    lastS = s;
    if (car.surface === 'wet' && car.speed > WET_RUSH) armed = true;
    if (armed && car.surface === 'sand' && !game.s.flags.wetCornerExit) {
      game.s.flags.wetCornerExit = true;
      scope.say('race_wetcorner').catch(() => {});
    }
    if (car.surface === 'dry') armed = false;
    if (progress >= field.playerFinish - 3) done = true;
  });
  scope.add(offStep);
  // steering help (assist.js): the student always steers; 'light' blends in a share of the racing line (headset
  // default — thumbstick / wheel), 'off' on desktop. ?assist=off|light overrides. It never brakes for the student.
  const assist = params.get('assist') ?? (engine.isXR() ? 'light' : 'off');
  game.s.flags.assist = assist;
  const autoPace = speedProfile(track, { margin: 0.7 });
  const autoMe = { car: drive.car, lane: slot.u, paceFn: autoPace };     // ?auto: drives like a rival (passes, never rams)
  if (ctx.auto) drive.setDriver(() => field.steerFor(autoMe));
  else if (assist !== 'off') drive.setDriver((car, cur, near) => assistInput(car, track, cur, assist, near));
  drive.freeze(false);
  field.start();
  racing = true;
  ctx.raceHud?.show(track, drive.car);
  if (engine.isXR() && drive.view.mode === 'cockpit') ctx.raceHud?.attachXR(ui, drive.car3d);
  scope.add(() => ctx.raceHud?.hide());
  ctx.task?.set('race_lap');
  await scope.say('race_go');
  await scope.guard(new Promise(res => { const off = engine.onFrame(() => { if (done) { off(); res(); } }); scope.add(off); }));
  game.s.flags.lapDone = true;
  const place = field.place(progress), of = field.field.length + 1;
  const ghostT = bumper.finishT ?? raceT + (field.playerFinish - bumper.progress) / 15;
  game.s.race = { time: raceT, ghostTime: ghostT, won: bumper.finishT == null || raceT < bumper.finishT, place, of };
  ctx.raceHud?.finish(game.s.race);
  ctx.task?.clear();
  drive.freeze(true);
  drive.setDriver(null);
  await scope.say('race_done');
  await engine.fade(1, 250);
  drive.stop();
  drive.view.dispose?.();
  await ctx.loco.goTo('tower', { fade: false });
  ctx.loco.lock(false);
  await engine.fade(0, 300);
}

/** One start: lights on one by one, a random hold, all out. Resolves { kind, reaction }. */
function startDrill(ctx, scope, drive, lights, rng, forceFalse) {
  const { engine } = ctx;
  return new Promise(res => {
    const speed = ctx.auto ? ctx.animSpeed : 1;
    const hold = LIGHTS.holdMinMs + rng() * (LIGHTS.holdMaxMs - LIGHTS.holdMinMs);
    const t0 = performance.now();
    const lightsOut = t0 + (LIGHTS.count * LIGHTS.stepMs + hold) / speed;
    lights.userData.setAll(false);
    let lit = 0, finished = false;
    const off = engine.onFrame(() => {
      if (finished) return;
      const now = performance.now();
      const want = Math.min(LIGHTS.count, Math.floor((now - t0) * speed / LIGHTS.stepMs) + 1);
      if (now < lightsOut && want !== lit) { lit = want; lights.userData.setLit(lit); ctx.audio.sfx('click'); }
      // the student's press (in ?auto: synthetic, deterministic; forceFalse = trigger held through lights-out)
      let held = drive.input.gasHeld();
      if (ctx.auto) held = forceFalse ? now > lightsOut - 300 / speed : false;
      if (now < lightsOut) {
        if (held) { finish(classifyStart(now, lightsOut, false)); }
        return;
      }
      if (lit) { lit = 0; lights.userData.setAll(false); }
      if (held && !lightsOutSeen.done) { lightsOutSeen.done = true; finish(classifyStart(null, lightsOut, true)); return; }
      lightsOutSeen.done = true;
      if (ctx.auto) { finish(classifyStart(lightsOut + AUTO_REACTION_MS, lightsOut, false)); return; }
      if (held) finish(classifyStart(lightsOut + (now - lightsOut) * speed, lightsOut, false));
      else if (now - lightsOut > 3000) finish({ kind: 'none', reaction: null });    // no press: not a false start, just try again
    });
    const lightsOutSeen = { done: false };
    function finish(r) { finished = true; off(); res(r); }
    scope.add(off);
  });
}

/** Five red lights on a black bar. userData.setLit(n), setAll(on). */
function gantry() {
  const g = new THREE.Group(); g.name = 'startLights';
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 0.06), new THREE.MeshStandardMaterial({ color: 0x121212 }));
  g.add(bar);
  const on = new THREE.Color(0xff2a2a), offC = new THREE.Color(0x3a0b0b);
  const bulbs = [];
  for (let i = 0; i < LIGHTS.count; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshBasicMaterial({ color: offC.clone() }));
    m.position.set((i - 2) * 0.18, 0, 0.032); g.add(m); bulbs.push(m);
  }
  g.userData.setLit = n => bulbs.forEach((b, i) => b.material.color.copy(i < n ? on : offC));
  g.userData.setAll = v => bulbs.forEach(b => b.material.color.copy(v ? on : offC));
  return g;
}

function drawTimes(ui, c, W, H, list) {
  ui.rr(c, 4, 4, W - 8, H - 8, H / 3); c.fillStyle = ui.C.bg; c.fill();
  c.fillStyle = ui.C.ink;
  if (!list.length) return;
  const txt = list.map(t => `⁦${Math.round(t * 1000)} ms⁩`).join('  ·  ');
  ui.fitText(c, txt, { x: 20, y: 8, w: W - 40, h: H - 16, maxPx: H * 0.55, minPx: ui.minPx(900, 2), font: ui.FONT });
}

const ICON_CAR = (g, x, y, w, h) => {
  const cx = x + w / 2, cy = y + h * 0.55, r = Math.min(w, h) * 0.36;
  g.strokeStyle = '#EEF2F8'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy); g.lineTo(cx, cy + r); g.stroke();
};
const ICON_TABLE = (g, x, y, w, h) => {
  g.strokeStyle = '#3CC4BC'; g.lineWidth = 12;
  g.beginPath(); g.ellipse(x + w / 2, y + h * 0.5, w * 0.34, h * 0.22, 0, 0, 7); g.stroke();
  g.fillStyle = '#E8643A'; g.fillRect(x + w * 0.62, y + h * 0.3, w * 0.1, h * 0.07);
  g.strokeStyle = '#EEF2F8'; g.lineWidth = 8; g.beginPath(); g.moveTo(x + w * 0.15, y + h * 0.85); g.lineTo(x + w * 0.85, y + h * 0.85); g.stroke();
};
