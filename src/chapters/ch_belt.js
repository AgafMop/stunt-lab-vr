// Chapter 2 — why a seatbelt? + the tyre zoom (spec §6 ch. 2): Newton's laws, felt before they are measured.
//   1. the crash test right below the tower (crashTest.js): Bumper drives at 40 into a wall of crash barrels; the
//      student decides belt / no belt. No belt: in slow motion he keeps going into the airbag ("nobody threw me — the
//      car stopped and I kept going") → the first law. Belt: the belt is the force that stops him with the car. Then
//      the other case. Desktop: a high-speed camera beside the car. Headset: the passenger seat or the tower.
//   2. the tyre zoom: the car's own wheel, enlarged, on a slab of road in front of the tower, with force arrows, in three
//      quick beats: accelerating (tyre pushes road back, road pushes tyre forward — third law), braking (the ROAD pushes
//      the car back: net force backward → it slows — second law), ice (locked wheel, the road can hardly push: it slides)
//   3. "who stops the car?" brakes / engine / road → the road.
import * as THREE from 'three';
import { board } from './kit.js';
import { choose } from './stripKit.js';
import { crashRun } from './crashTest.js';

export async function run(ctx, scope) {
  const { game, engine, lab, loco } = ctx;
  await loco.goTo('tower');
  await scope.say('belt_intro');

  // ---- 1. the dummy test, both ways ----
  const g = board(ctx, scope, 'A_board');
  ctx.task?.set('belt_choose');
  scope.say('belt_choose');
  const first = await choose(ctx, scope, g, [['belt', 'לחגור את באמפר'], ['none', 'בלי חגורה']], 'none', { w: 0.3, h: 0.12 });
  g.visible = false;
  if (first === 'belt') game.award('חגורה קודם');
  game.s.flags.beltFirst = first;
  // headset: the best seat for this is the passenger seat, right next to Bumper; desktop: the high-speed camera
  const rideP = ctx.params.get('ride');
  let ride = rideP === 'off' ? false : rideP === 'seat' ? true : null;
  if (ride == null && engine.isXR()) {
    const g1 = board(ctx, scope, 'A_board');
    ctx.task?.set('belt_where');
    scope.say('belt_where');
    ride = await choose(ctx, scope, g1, [[true, 'לשבת ליד באמפר'], [false, 'לצפות מהמגדל']], false, { w: 0.3, h: 0.12 });
    g1.visible = false;
  }
  game.s.flags.beltRide = !!ride;
  for (const mode of [first, first === 'belt' ? 'none' : 'belt']) {
    ctx.task?.set(mode === 'belt' ? 'belt_watch_belt' : 'belt_watch_none');
    await crashRun(ctx, scope, { belted: mode === 'belt', ride: !!ride });
    if (mode === 'none') { await scope.say('belt_none'); await scope.say('belt_law1'); }
    else await scope.say('belt_yes');
  }

  // ---- 2. the tyre zoom ----
  ctx.task?.set('tyre_watch');
  await engine.fade(1, 300);
  const zoom = tyreZoom(ctx); scope.add(zoom); lab.root.add(zoom);
  scope.add(() => zoom.userData.dispose());
  await engine.fade(0, 400);
  // short on purpose (the user found the four-phase version long): three beats, no pauses between them
  for (const phase of ['accel', 'brake', 'ice']) {
    zoom.userData.phase(phase);
    ctx.task?.set(`tyre_${phase}`);
    await scope.say(`tyre_${phase}`);
    await scope.wait(ctx.auto ? 100 : 500);
  }
  zoom.userData.aside();                                          // the answer cards take the centre

  // ---- 3. who stops the car? ----
  ctx.task?.set('tyre_q');
  await scope.say('tyre_q');
  let tries = 0;
  for (;;) {
    tries++;
    const g2 = board(ctx, scope, 'A_board');
    const a = await choose(ctx, scope, g2, [['brakes', 'הבלמים'], ['engine', 'המנוע'], ['road', 'הכביש']], 'road', { w: 0.24, h: 0.12 });
    g2.visible = false;
    if (a === 'road') { ctx.audio.sfx('ok'); game.markDecision(tries === 1); await scope.say('tyre_right'); break; }
    ctx.audio.sfx('no');
    await scope.say(a === 'brakes' ? 'tyre_wrong_brakes' : 'tyre_wrong_engine');
  }
  game.s.flags.tyreTries = tries;
  ctx.task?.clear();
}

/** A giant wheel on a slab of road, floating in front of the tower (a "zoom"), with force arrows per phase. */
function tyreZoom(ctx) {
  const { engine, ui } = ctx;
  const g = new THREE.Group(); g.name = 'tyreZoom';
  g.position.set(0, 6 + 0.95, -3.3);                            // in front of the seated student, below eye level
  const R = 0.42;
  // road slab with a scrolling asphalt texture
  const tex = new THREE.TextureLoader().load('assets/world/tex/asphalt_02_diff.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 0.6);
  const road = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  road.position.y = -R - 0.03; g.add(road);
  const ice = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.01, 0.7), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.7 }));
  ice.position.y = -R + 0.006; ice.visible = false; g.add(ice);
  // the wheel: tyre, rim with spokes, brake disc + caliper
  const wheel = new THREE.Group(); g.add(wheel);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 });
  const real = ctx.lab.makeCar?.().getObjectByName('CAR_wheel_FL');            // the car's own wheel (Blender model)
  if (real) {
    const w = real.clone(true); w.position.set(0, 0, 0); w.rotation.set(0, 0, 0); w.scale.setScalar(R / 0.368);
    const axle = new THREE.Group(); axle.rotation.y = -Math.PI / 2; axle.add(w); wheel.add(axle);   // the axle points at the student
    wheel.userData.spinNode = w;
  } else {
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.09, 0.09, 14, 40), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 }));
    wheel.add(tyre);
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, R - 0.12, 0.03), rimMat); s.position.y = (R - 0.12) / 2; const p = new THREE.Group(); p.rotation.z = k * Math.PI * 2 / 5; p.add(s); wheel.add(p); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), rimMat); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  }
  const discMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4, emissive: 0x000000 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), discMat); disc.rotation.x = Math.PI / 2; disc.position.z = -0.05; g.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0xc0392b })); caliper.position.set(0.16, 0.08, -0.05); g.add(caliper);
  // arrows (force vectors) with labels
  const arrow = (color) => { const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.5, color, 0.12, 0.08); a.line.material.linewidth = 3; a.visible = false; g.add(a); return a; };
  const onTyre = arrow(0x7cff9b), onRoad = arrow(0xffb347), drag = arrow(0x9fb0c8), net = arrow(0xff5050);
  const caption = ui.panel({ w: 0.6, h: 0.14, ppm: 900, viewDist: 2.2, name: 'tyreCaption', draw(c, W, H, text = '') {
    if (!text) return;                                             // a short title; the task card + subtitles carry the words
    ui.rr(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = 'rgba(10,14,22,0.92)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#FFB347'; c.stroke();
    c.fillStyle = '#FFB347'; ui.fitText(c, text, { x: 20, y: 8, w: W - 40, h: H - 16, maxPx: H * 0.55, minPx: ui.minPx(900, 2.2), font: ui.FONT, weight: 800 });
  } });
  caption.mesh.position.set(0, -R - 0.37, 0.36); g.add(caption.mesh);   // under the legend: the sky above the wheel is the subtitles' band
  const legend = ui.panel({ w: 1.7, h: 0.13, ppm: 900, viewDist: 2.2, name: 'tyreLegend', draw(c, W, H, items = []) {
    c.font = `600 ${Math.round(H * 0.42)}px ${ui.FONT}`; c.textBaseline = 'middle'; c.textAlign = 'right';
    let x = W - 10;
    for (const [col, label] of items) { c.fillStyle = col; c.fillRect(x - 24, H / 2 - 8, 24, 16); x -= 32; c.fillStyle = '#EEF2F8'; c.fillText(label, x, H / 2); x -= c.measureText(label).width + 30; }
  } });
  legend.mesh.position.set(0, -R - 0.2, 0.36); g.add(legend.mesh);
  const set = (a, from, dir, len) => { a.visible = true; a.position.copy(from); a.setDirection(dir.clone().normalize()); a.setLength(len, 0.12, 0.08); };
  const X = new THREE.Vector3(1, 0, 0), NX = new THREE.Vector3(-1, 0, 0);
  let phase = 'cruise', spin = 2.2, scroll = 0.6, time = 0;
  const contact = new THREE.Vector3(0, -R, 0.12);
  function show(p) {
    phase = p;
    for (const a of [onTyre, onRoad, drag, net]) a.visible = false;
    ice.visible = p === 'ice'; discMat.emissive.setHex(p === 'brake' ? 0x661100 : 0x000000);
    const T = { cruise: 'מהירות קבועה', accel: 'האצה', brake: 'בלימה', ice: 'בלימה על קרח' }[p];
    caption.redraw(T);
    if (p === 'cruise') { spin = 2.2; scroll = 0.6; set(onTyre, contact.clone().add(new THREE.Vector3(0, 0.02, 0)), X, 0.35); set(drag, new THREE.Vector3(-0.1, 0.25, 0.12), NX, 0.35); legend.redraw([['#7cff9b', 'הכביש דוחף קדימה'], ['#9fb0c8', 'התנגדות האוויר']]); }
    if (p === 'accel') { spin = 4.5; scroll = 1.2; set(onTyre, contact.clone().add(new THREE.Vector3(0, 0.02, 0)), X, 0.7); set(onRoad, contact.clone().add(new THREE.Vector3(0, -0.04, 0)), NX, 0.7); set(net, new THREE.Vector3(0, R + 0.25, 0), X, 0.35); legend.redraw([['#7cff9b', 'הכביש דוחף את הצמיג'], ['#ffb347', 'הצמיג דוחף את הכביש'], ['#ff5050', 'כוח שקול']]); }
    if (p === 'brake') { spin = 0.7; scroll = 0.25; set(onTyre, contact.clone().add(new THREE.Vector3(0, 0.02, 0)), NX, 0.85); set(net, new THREE.Vector3(0, R + 0.25, 0), NX, 0.6); legend.redraw([['#7cff9b', 'הכביש דוחף אחורה (חיכוך)'], ['#ff5050', 'כוח שקול: מאט']]); }
    if (p === 'ice') { spin = 0; scroll = 0.5; set(onTyre, contact.clone().add(new THREE.Vector3(0, 0.02, 0)), NX, 0.12); legend.redraw([['#7cff9b', 'חיכוך קטן מאוד']]); }
  }
  show('accel');
  const off = engine.onFrame(dt => {
    time += dt;
    if (wheel.userData.spinNode) wheel.userData.spinNode.rotation.x -= spin * dt; else wheel.rotation.z -= spin * dt;
    tex.offset.x += scroll * dt;
  });
  g.lookAt(0, 6 + 1.17, -1.4); g.rotation.x = 0; g.rotation.z = 0;
  let asideT = 0;
  const offAside = engine.onFrame(dt => { if (asideT > 0 && asideT < 1) { asideT = Math.min(1, asideT + dt * 2.5); const e = asideT * asideT * (3 - 2 * asideT); g.position.x = 1.15 * e; g.scale.setScalar(1 - 0.3 * e); } });   // aside to the RIGHT: the task card lives up-left
  g.userData = { phase: show, aside() { asideT = 0.001; }, dispose() { off(); offAside(); caption.dispose(); legend.dispose(); } };
  return g;
}
