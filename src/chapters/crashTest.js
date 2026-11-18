// The seatbelt crash test (chapter 2): Bumper drives the stunt car at 40 km/h into a wall of crash barrels right in
// front of the tower. The car stops in ~0.6 m (≈ 10 g); Bumper doesn't — he keeps going (Newton's first law):
//   belt    — a real 3-point belt (webbing from the B-pillar over his shoulder to the buckle + a lap belt) stretches,
//             he nods and is held with the car;
//   no belt — he slides and pitches into the airbag, bounces back and slumps, dizzy.
// Staging:
//   desktop — a "high-speed camera" tracks the car from the driver's side; at the impact time slows ×10 (REC tag).
//   headset — the passenger seat (turned toward Bumper) when the student chose to ride, else the tower (the driver's
//             side faces the tower). Never a camera that moves on its own in the headset; the rig is yaw-only.
// Bumper's body is driven by a small spring model in the car's frame (crashModel.js, Node-tested).
import * as THREE from 'three';
import { STRIP } from '../world/layout.js';
import { makeDriver } from './stripKit.js';
import { CRASH, carAt, dummyStep } from './crashModel.js';

export { CRASH };

export async function crashRun(ctx, scope, { belted, ride }) {
  const { engine, lab, loco } = ctx;
  const xr = engine.isXR(), desk = !xr;
  const k = ctx.auto ? ctx.animSpeed : 1;
  const dir = -1;                                                         // drives toward −x: the driver's side faces the tower
  const hitX = CRASH.impactX;                                             // world x of the car's nose at contact
  // everything this run puts in the world goes when the run ends (the second run starts clean)
  const bin = [];
  const own = fn => { bin.push(fn); scope.add(fn); };
  const clean = () => { for (const fn of bin.splice(0)) { try { fn(); } catch { /* gone */ } } };
  const car = lab.makeCar(0xf07a1a);
  car.rotation.y = -Math.PI / 2;
  lab.world.add(car); own(() => lab.world.remove(car));
  ctx.track?.(car, 'crashCar');
  const model = car.children[0];                                          // the body dips on the impact (pitch about the front axle)
  const driver = makeDriver(ctx, 'bumper'); car.add(driver); own(() => driver.userData.dispose?.());
  const parts = driver.userData.parts || null;
  const base = { pos: driver.position.clone(), body: parts?.body?.rotation.x ?? 0, head: parts?.head?.rotation.x ?? 0,
    arms: parts?.arms?.map(a => a.rotation.x) ?? [] };
  driver.userData.setMood?.('normal');
  car.userData.setInterior?.(true);                                       // no tinted glass between the camera and Bumper

  const props = crashSet(ctx, hitX, dir); own(() => props.dispose());
  const belt = seatBelt(car, driver, belted); own(() => belt.dispose());
  const bag = airbag(car); own(() => bag.dispose());

  const place = x => car.position.set(hitX - dir * CRASH.nose + dir * x, 0, STRIP.z);   // x = metres travelled past contact
  // camera
  const eye = new THREE.Vector3(), seatP = car.getObjectByName('seatP');
  let camX = null;
  const cab = new THREE.Vector3();
  let t = -CRASH.runIn / (CRASH.kmh / 3.6);                              // sim time, 0 = the hit
  if (ride) {
    await engine.fade(1, 200);
    loco.lock(true); loco.setPitch(-0.12);
    loco.follow(() => ({ pos: seatP.getWorldPosition(eye), yaw: car.rotation.y + Math.PI + 0.75 }));   // turned toward Bumper
    await engine.fade(0, 250);
  } else if (desk) {
    await engine.fade(1, 200);
    loco.lock(true);
    // two cameras on the driver's side, cut like a crash-test film: wide (the car + the barrels) on the approach and at
    // the end; a close-up through the side window on Bumper for the slow-motion impact. They ride along with the car
    // until the hit, then hold still.
    loco.follow(() => {
      const cx = camX ?? car.position.x, close = t > -0.12 && t < 0.75;
      if (close) { eye.set(cx + 0.45 + dir * 0.75, 1.72, STRIP.z + 1.85); cab.set(cx + 0.45 + dir * 0.2, 0.95, STRIP.z + 0.38); }
      else { eye.set(cx + dir * 3.6, 1.5, STRIP.z + 4.9); cab.set(cx + dir * 1.1, 0.8, STRIP.z); }
      const dx = cab.x - eye.x, dy = cab.y - eye.y, dz = cab.z - eye.z;
      loco.setPitch(Math.atan2(dy, Math.hypot(dx, dz)));
      return { pos: eye, yaw: Math.atan2(-dx, -dz) };
    });
    await engine.fade(0, 250);
  }
  scope.add(() => { if (loco.following) { loco.follow(null); loco.goTo('tower', { fade: false }); } loco.lock(false); });
  const rec = desk && !ride ? recTag() : null; own(() => rec?.remove());

  const s = { u: 0, du: 0, th: 0, dth: 0, ph: 0, dph: 0 };
  let hit = false, done = 0;
  await scope.guard(new Promise(res => {
    const off = engine.onFrame(dt => {
      // time: normal on the approach, ×20 slower from just before the hit (the high-speed camera)
      const S = CRASH.slow, ramp = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
      const slow = t < 0.4 ? 1 - (1 - S) * ramp(-0.45, -0.15, t) : S + (1 - S) * ramp(0.4, 0.7, t);
      if (rec) rec.slow(slow < 0.5);
      let left = Math.min(dt, 0.05) * k * slow;
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 600); left -= h; t += h;
        const c = carAt(t);
        if (t >= 0) dummyStep(s, c.A, h, belted);
        if (t >= 0 && !hit) { hit = true; props.hit(); bag.fire(); crashSound(ctx.audio); }
      }
      const c = carAt(t);
      place(c.x);
      if (camX == null || t < 0) camX = car.position.x;                    // tracks the car until the hit, then holds
      model.rotation.x = t > 0 ? -0.07 * Math.sin(Math.min(1, t / 0.35) * Math.PI) : 0;   // nose dives, settles
      // Bumper
      driver.position.copy(base.pos); driver.position.z += s.u;
      if (parts?.body) parts.body.rotation.x = base.body + s.th; else driver.rotation.x = s.th * 0.6;
      if (parts?.head) parts.head.rotation.x = base.head + s.ph;
      parts?.arms?.forEach((a, i) => { a.rotation.x = base.arms[i] - Math.min(1.1, s.th * 1.4 + Math.max(0, s.ph) * 0.4); });
      belt.update(s);
      bag.update(t);
      props.update(dt * k * slow);
      loco.applyFollow();
      if (t > 0.5 && !done) { done = performance.now(); driver.userData.setMood?.(belted ? 'happy' : 'dizzy'); }
      if (done && performance.now() - done > (ctx.auto ? 200 : 1800)) { off(); res(); }
    });
    scope.add(off);
  }));
  rec?.remove();
  await engine.fade(1, 250);
  clean();
  if (ride || desk) { loco.follow(null); await loco.goTo('tower', { fade: false }); }
  await engine.fade(0, 300);
  loco.lock(false);
}

// ---------- the set: a wall of crash barrels in front of a concrete block, dust, flying barrels ----------
function crashSet(ctx, hitX, dir) {
  const { lab } = ctx;
  const g = new THREE.Group(); g.name = 'crashSet'; lab.world.add(g);
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2b61b, roughness: 0.55 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.6 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.95 });
  const R = 0.42, H = 0.95;
  const barrelGeo = new THREE.CylinderGeometry(R, R * 0.96, H, 20);
  const capGeo = new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.06, 20);
  const bandGeo = new THREE.CylinderGeometry(R * 1.005, R * 1.005, 0.12, 20, 1, true);
  const barrels = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(barrelGeo, yellow));
    const cap = new THREE.Mesh(capGeo, black); cap.position.y = H / 2 + 0.03; b.add(cap);
    for (const y of [-0.18, 0.18]) { const band = new THREE.Mesh(bandGeo, black); band.position.y = y; b.add(band); }
    b.position.set(hitX + dir * (R + row * 0.86), H / 2, STRIP.z + (i - 1) * 0.86 + (row ? 0.43 : 0) * 0);
    b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(b);
    barrels.push({ obj: b, home: b.position.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), row, i, flying: false });
  }
  const block = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 4.2), concrete);
  block.position.set(hitX + dir * (2 * R + 0.86 + 0.75), 0.65, STRIP.z); block.castShadow = block.receiveShadow = true; g.add(block);
  { // black/yellow chevrons on the block's face toward the car
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d');
    x.fillStyle = '#f2b61b'; x.fillRect(0, 0, 512, 160); x.fillStyle = '#151515';
    for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 56, 160); x.lineTo(i * 56 + 28, 160); x.lineTo(i * 56 + 88, 0); x.lineTo(i * 56 + 60, 0); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    face.rotation.y = dir < 0 ? Math.PI / 2 : -Math.PI / 2; face.position.set(block.position.x - dir * 0.551, 0.65, STRIP.z); g.add(face);
  }
  // dust: soft sprites thrown up at the hit
  const N = 70, pos = new Float32Array(N * 3), vel = [];
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 64; { const x = dc.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(214,170,128,0.9)'); gr.addColorStop(1, 'rgba(214,170,128,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
  const dustMat = new THREE.PointsMaterial({ size: 1.1, map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false, opacity: 0 });
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.visible = false; g.add(dust);
  let dustT = -1;
  return {
    hit() {
      for (const b of barrels) {                                            // the front row flies, the back row is shoved
        const side = b.i - 1;
        b.flying = true;
        b.v.set(dir * (b.row ? 3.2 : 6.5) * (0.8 + Math.random() * 0.4), (b.row ? 1.6 : 3.4) + Math.random(), side * (1.4 + Math.random()) + (Math.random() - 0.5));
        b.w.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
      }
      for (let i = 0; i < N; i++) {
        pos[i * 3] = hitX + dir * 0.3; pos[i * 3 + 1] = 0.2 + Math.random() * 0.5; pos[i * 3 + 2] = STRIP.z + (Math.random() - 0.5) * 2;
        vel.push(new THREE.Vector3(dir * Math.random() * 3, 0.5 + Math.random() * 1.8, (Math.random() - 0.5) * 3.5));
      }
      dustGeo.attributes.position.needsUpdate = true; dust.visible = true; dustT = 0;
    },
    update(h) {
      if (h <= 0) return;
      for (const b of barrels) {
        if (!b.flying) continue;
        b.v.y -= 9.8 * h; b.obj.position.addScaledVector(b.v, h);
        b.obj.rotation.x += b.w.x * h; b.obj.rotation.y += b.w.y * h; b.obj.rotation.z += b.w.z * h;
        if (b.obj.position.y < R) {                                          // lands, rolls to a stop on its side
          b.obj.position.y = R; b.v.y = Math.abs(b.v.y) * 0.25; b.v.x *= 0.6; b.v.z *= 0.6; b.w.multiplyScalar(0.6);
          b.obj.rotation.x += (Math.PI / 2 - (b.obj.rotation.x % Math.PI)) * 0.3;
          if (b.v.length() < 0.25) b.flying = false;
        }
      }
      if (dustT >= 0) {
        dustT += h;
        for (let i = 0; i < N; i++) { const v = vel[i]; v.multiplyScalar(Math.exp(-1.2 * h)); pos[i * 3] += v.x * h; pos[i * 3 + 1] += v.y * h; pos[i * 3 + 2] += v.z * h; }
        dustGeo.attributes.position.needsUpdate = true;
        dustMat.opacity = Math.min(0.75, dustT * 8) * Math.exp(-dustT / 1.6); dustMat.size = 1.1 + dustT * 1.4;
      }
    },
    dispose() { g.removeFromParent(); barrelGeo.dispose(); capGeo.dispose(); bandGeo.dispose(); dustGeo.dispose(); },
  };
}

// ---------- the seatbelt: flat webbing through anchor points that move with Bumper ----------
function seatBelt(car, driver, belted) {
  const g = new THREE.Group(); g.name = 'seatBelt'; car.add(g);
  const web = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.3 });
  // car-local fixed points (driver on +x, facing +z): the B-pillar loop, the outboard floor anchor, the buckle
  const pillar = new THREE.Vector3(0.80, 1.02, -0.78), floorOut = new THREE.Vector3(0.76, 0.36, -0.62), buckle = new THREE.Vector3(0.10, 0.42, -0.50);
  const loop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.03), metal); loop.position.copy(pillar); g.add(loop);
  const bk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), metal); bk.position.copy(buckle); g.add(bk);
  const segs = [], unit = new THREE.BoxGeometry(1, 1, 1);
  const seg = () => { const m = new THREE.Mesh(unit, web); m.castShadow = true; g.add(m); segs.push(m); return m; };
  const a = driver.userData.parts?.anchors || {};
  const fallback = { shoulder: new THREE.Vector3(0.15, 0.73, 0.16), chest: new THREE.Vector3(0.0, 0.6, 0.17), hipL: new THREE.Vector3(0.14, 0.36, 0.15), hipR: new THREE.Vector3(-0.14, 0.36, 0.15) };
  const P = { shoulder: new THREE.Vector3(), chest: new THREE.Vector3(), hipL: new THREE.Vector3(), hipR: new THREE.Vector3() };
  const anchor = (name, key) => {
    const o = a[name];
    if (o) { o.getWorldPosition(P[key]); car.worldToLocal(P[key]); }
    else { P[key].copy(fallback[key]); driver.localToWorld(P[key]); car.worldToLocal(P[key]); }
    P[key].z += 0.02;                                                       // lies on the chest, not inside it
  };
  const lay = (m, p, q, w = 0.05) => {
    const d = q.clone().sub(p), len = d.length();
    m.position.copy(p).addScaledVector(d, 0.5); m.scale.set(w, 0.008, len);
    m.lookAt(car.localToWorld(q.clone()));                                 // (Object3D.lookAt already undoes the parent's rotation)
  };
  let path = null;
  if (belted) { for (let i = 0; i < 6; i++) seg(); }
  else {                                                                   // unused: hangs from the pillar along the door side
    const hang = seg(); lay(hang, pillar, floorOut, 0.05);
  }
  return {
    update() {
      if (!belted) return;
      car.updateMatrixWorld(true);
      anchor('shoulder', 'shoulder'); anchor('chest', 'chest'); anchor('hip_L', 'hipL'); anchor('hip_R', 'hipR');
      path = [[pillar, P.shoulder], [P.shoulder, P.chest], [P.chest, P.hipR], [P.hipR, buckle], [floorOut, P.hipL], [P.hipL, P.hipR]];
      path.forEach(([p, q], i) => lay(segs[i], p, q));
    },
    dispose() { g.removeFromParent(); unit.dispose(); },
  };
}

// ---------- the airbag: bursts out of the steering wheel in ~30 ms, deflates after ~0.4 s ----------
function airbag(car) {
  const wheel = car.getObjectByName('wheel');
  const g = new THREE.Group(); g.name = 'airbag';
  const geo = new THREE.SphereGeometry(0.3, 24, 16);
  { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); p.setZ(i, p.getZ(i) * 0.55); p.setX(i, x * (1 + 0.04 * Math.sin(y * 40))); } geo.computeVertexNormals(); }
  const mat = new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.9 });
  const bag = new THREE.Mesh(geo, mat); bag.castShadow = true; g.add(bag);
  g.visible = false; g.scale.setScalar(0.05);
  const hub = new THREE.Vector3(0.38, 0.95, 0.12);                        // car-local; the wheel's hub when the model has one
  if (wheel) { car.updateMatrixWorld(true); wheel.getWorldPosition(hub); car.worldToLocal(hub); }
  car.add(g); g.position.copy(hub);
  let fired = -1;
  return {
    fire() { fired = 0; g.visible = true; },
    update(t) {
      if (fired < 0 || t < 0) return;
      const s = t < 0.03 ? 0.05 + 0.95 * (t / 0.03) : t < 0.4 ? 1 : Math.max(0.55, 1 - (t - 0.4) * 1.2);
      g.scale.set(s, s, s * (t < 0.4 ? 1 : 0.7));
      // a pillow facing the driver (car −z), pushed out of the hub toward him
      g.position.z = hub.z - 0.16 * Math.min(1, t / 0.03); g.position.y = hub.y + 0.04;
    },
    dispose() { g.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}

// ---------- the high-speed camera tag (desktop) ----------
function recTag() {
  const el = document.createElement('div'); el.id = 'crashRec';
  el.innerHTML = '<i></i><span>מצלמה מהירה</span><b>הילוך איטי ×10</b>';
  const css = document.createElement('style');
  css.textContent = `#crashRec{position:fixed;left:18px;top:18px;z-index:6;pointer-events:none;display:flex;gap:10px;align-items:center;
    font:700 18px Heebo,"Segoe UI",sans-serif;color:#eef2f8;background:rgba(8,12,20,.8);padding:8px 14px;border-radius:12px;direction:rtl}
    #crashRec i{width:14px;height:14px;border-radius:50%;background:#ff3b30;box-shadow:0 0 10px #ff3b30;animation:recb 1s steps(2) infinite}
    #crashRec b{color:#ffb347;display:none}#crashRec.slow b{display:inline}
    @keyframes recb{50%{opacity:.2}}`;
  document.head.appendChild(css); document.body.appendChild(el);
  return { slow(v) { el.classList.toggle('slow', v); }, remove() { el.remove(); css.remove(); } };
}

// ---------- the crash, heard: a deep boom (slowed, like the picture), a crunch and plastic barrels ----------
function crashSound(audio) {
  const a = audio?.unlock?.(); if (!a) return;
  const now = a.currentTime;
  const out = a.createGain(); out.gain.value = 0.9; out.connect(a.destination);
  const o = a.createOscillator(), og = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(70, now); o.frequency.exponentialRampToValueAtTime(28, now + 1.2);
  og.gain.setValueAtTime(0.0001, now); og.gain.exponentialRampToValueAtTime(0.9, now + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
  o.connect(og).connect(out); o.start(now); o.stop(now + 1.7);
  const n = a.createBuffer(1, a.sampleRate * 1.5, a.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * 0.35)) * (Math.random() < 0.02 ? 3 : 1);
  const s = a.createBufferSource(); s.buffer = n; s.playbackRate.value = 0.55;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, now); f.frequency.exponentialRampToValueAtTime(300, now + 1.2);
  const sg = a.createGain(); sg.gain.value = 0.55;
  s.connect(f).connect(sg).connect(out); s.start(now);
  setTimeout(() => out.disconnect(), 2500);
}
