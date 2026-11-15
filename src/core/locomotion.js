// Stations + teleport, snap turn, optional smooth move, recenter, seated height; desktop WASD + mouse look.
import * as THREE from 'three';
import { seatedRigOffset, BENCH_TOP, SEAT_GAP } from './seated.js';

const DESK_EYE = BENCH_TOP + SEAT_GAP;

/** room: walkable bounds {x0,x1,z0,z1} in three coords (metres); blocks: floor-plan obstacles [[x0,x1,z0,z1], ...]. */
export function createLocomotion(engine, input, { room = { x0: -3.7, x1: 3.7, z0: -2.7, z1: 2.7 }, blocks = [] } = {}) {
  const ROOM = room, BLOCKS = blocks;
  const order = [];                     // station ids in the order added: desktop keys 1..9 jump to them
  const { rig, camera, renderer } = engine;
  const stations = {};
  let current = null, smooth = false, turnLatch = false, yaw = 0, pitch = -0.12;
  let baseY = 0, seatOff = 0;           // station floor height (a tower deck) + seated calibration
  // follow mode (riding in a car): the rig carries the student's calibrated head to an eye pose every frame — yaw only,
  // never roll or pitch. locked: desktop WASD / digit keys and XR snap turn are off (the controls drive the car).
  let followFn = null, locked = false, lookYaw = 0, calib = { x: 0, y: DESK_EYE, z: 0, yaw: 0 };
  const UP = new THREE.Vector3(0, 1, 0), tmpOff = new THREE.Vector3();
  const offset = new THREE.Vector3();   // cinematic worlds (enzyme zoom, intro) live at an offset from the lab
  const keys = new Set();
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');

  camera.position.set(0, DESK_EYE, 0);
  camera.rotation.order = 'YXZ';

  function headLocal() {
    if (!engine.isXR()) return { x: 0, z: 0, yaw: 0 };
    // pose of the head relative to the rig: three.js keeps it in the user camera (a child of the rig)
    v.copy(camera.position); e.setFromQuaternion(camera.quaternion, 'YXZ');
    return { x: v.x, y: v.y, z: v.z, yaw: e.y };
  }

  function place(pos, targetYaw) {
    const h = headLocal();
    const rigYaw = targetYaw - h.yaw;
    rig.rotation.set(0, rigYaw, 0);
    const off = new THREE.Vector3(h.x, 0, h.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rigYaw);
    rig.position.x = pos.x - off.x + offset.x;
    rig.position.z = pos.z - off.z + offset.z;
    baseY = pos.y;
    rig.position.y = baseY + (engine.isXR() ? seatOff : 0) + offset.y;
    if (!engine.isXR()) { yaw = 0; camera.rotation.set(pitch, 0, 0); }
  }

  function calibrateHeight() {
    const h = headLocal();
    if (h.y) { seatOff = seatedRigOffset(h.y); rig.position.y = baseY + seatOff + offset.y; }
  }

  const loco = {
    stations,
    get current() { return current; },
    addStation(id, node, disc) {
      const p = node.getWorldPosition(new THREE.Vector3());
      stations[id] = { pos: p, yaw: node.userData.yaw ?? 0, pitch: node.userData.pitch, disc };
      if (!order.includes(id)) order.push(id);
      if (disc) input.register(disc, { onSelect: () => loco.goTo(id), noHighlight: false });
    },
    /** Move the player into/out of a cinematic world; teleports are locked while offset ≠ 0. */
    setOffset(v) { rig.position.sub(offset).add(v); offset.copy(v); },
    get offset() { return offset; },
    async goTo(id, { fade = true } = {}) {
      if (offset.lengthSq() > 0) return;
      const s = stations[id];
      if (!s) throw new Error(`no station ${id}`);
      if (fade) await engine.fade(1, 180);
      if (s.pitch != null && !engine.isXR()) pitch = s.pitch;
      place(s.pos, s.yaw);
      current = id;
      for (const [k, st] of Object.entries(stations)) if (st.disc) st.disc.visible = k !== id;
      if (fade) await engine.fade(0, 220);
    },
    recenter() {
      calibrateHeight();
      if (followFn) { captureCalib(); loco.applyFollow(); return; }
      if (current) place(stations[current].pos, stations[current].yaw);
    },
    setSmooth(on) { smooth = on; },
    /** Walkable bounds for desktop WASD / smooth move (null = the lab). */
    setArea(a) { area = a; },
    get smooth() { return smooth; },
    lock(v) { locked = v; },
    /** Desktop look pitch (rad); ignored in XR. */
    setPitch(p) { if (!engine.isXR()) pitch = p; },
    get locked() { return locked; },
    /** fn() → { pos: Vector3 (eye, world), yaw } or null to stop following. */
    follow(fn) { followFn = fn; lookYaw = 0; if (fn) { captureCalib(); loco.applyFollow(); } },
    get following() { return !!followFn; },
    /** Place the rig for the current follow pose now (call right after moving the followed object: no one-frame lag). */
    applyFollow() {
      if (!followFn) return;
      const { pos, yaw: fy } = followFn();
      if (!engine.isXR()) {
        rig.rotation.set(0, fy, 0);
        rig.position.set(pos.x, pos.y - DESK_EYE, pos.z);
        camera.rotation.set(pitch, lookYaw, 0);
        return;
      }
      const ry = fy - calib.yaw;
      rig.rotation.set(0, ry, 0);
      tmpOff.set(calib.x, 0, calib.z).applyAxisAngle(UP, ry);
      rig.position.set(pos.x - tmpOff.x, pos.y - calib.y, pos.z - tmpOff.z);
    },
  };

  function captureCalib() {
    const h = headLocal();
    calib = engine.isXR() && h.y ? { x: h.x, y: h.y, z: h.z, yaw: h.yaw } : { x: 0, y: DESK_EYE, z: 0, yaw: 0 };
  }

  renderer.xr.addEventListener('sessionstart', () => {
    let n = 0;
    const off = engine.onFrame(() => { if (++n === 30) { off(); loco.recenter(); } });
  });
  renderer.xr.addEventListener('sessionend', () => { rig.position.y = offset.y + baseY; camera.position.set(0, DESK_EYE, 0); });

  // ---- desktop controls ----
  const canvas = renderer.domElement;
  addEventListener('keydown', ev => {
    keys.add(ev.code);
    const n = /^Digit[1-9]$/.test(ev.code) ? order[Number(ev.code.slice(5)) - 1] : null;
    if (n && stations[n] && !engine.isXR() && !area && !locked) loco.goTo(n);   // lab hotkeys only inside the lab
  });
  addEventListener('keyup', ev => keys.delete(ev.code));
  canvas.addEventListener('dblclick', () => { if (!engine.isXR() && canvas.requestPointerLock) canvas.requestPointerLock(); });
  let drag = null;
  canvas.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, moved: 0 }; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', ev => {
    if (engine.isXR()) return;
    let dx = 0, dy = 0;
    if (input.mouse.locked) { dx = ev.movementX; dy = ev.movementY; }
    else if (drag && ev.buttons && !input.mouse.grabbed && !input.mouse.pending) { dx = ev.clientX - drag.x; dy = ev.clientY - drag.y; drag.x = ev.clientX; drag.y = ev.clientY; }   // dragging a prop never turns the view
    if (followFn) lookYaw -= dx * 0.0035; else yaw -= dx * 0.0035;
    pitch = Math.max(-1.2, Math.min(1.1, pitch - dy * 0.0035));
  });

  let area = null;   // null = the lab; otherwise {x0,x1,z0,z1,blocks}
  function blocked(x, z) {
    const R = area || ROOM, BL = area ? area.blocks : BLOCKS;
    if (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1) return true;
    return BL.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
  }
  function move(dx, dz) {
    const nx = rig.position.x + dx, nz = rig.position.z + dz;
    if (!blocked(nx, rig.position.z)) rig.position.x = nx;
    if (!blocked(rig.position.x, nz)) rig.position.z = nz;
  }

  engine.onFrame(dt => {
    if (followFn) { loco.applyFollow(); if (!engine.isXR()) return; }   // XR: keep reading the recenter button while riding
    if (!engine.isXR()) {
      rig.rotation.y += yaw; yaw = 0;
      if (offset.lengthSq() > 0) { camera.rotation.set(pitch, 0, 0); return; }
      camera.rotation.set(pitch, 0, 0);
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      if ((f || s) && !locked) {
        const a = rig.rotation.y, sp = 1.6 * dt;
        move((-Math.sin(a) * f + Math.cos(a) * s) * sp, (-Math.cos(a) * f - Math.sin(a) * s) * sp);
      }
      return;
    }
    const session = renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp || gp.axes.length < 4) continue;
      const ax = gp.axes[2], ay = gp.axes[3];
      if (src.handedness === 'right') {
        if (!locked && !turnLatch && Math.abs(ax) > 0.7) {
          turnLatch = true;
          const head = engine.headPosition(new THREE.Vector3());
          const ang = -Math.sign(ax) * Math.PI / 6;
          rig.position.sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(head);
          rig.rotation.y += ang;
        } else if (Math.abs(ax) < 0.3) turnLatch = false;
        if (gp.buttons[3]?.pressed && !loco.__rc) { loco.__rc = true; loco.recenter(); }
        if (!gp.buttons[3]?.pressed) loco.__rc = false;
      } else if (src.handedness === 'left' && smooth && !locked && (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15)) {
        const h = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(q), 'YXZ').y;
        const sp = 1.4 * dt;
        move((Math.cos(h) * ax + Math.sin(h) * ay) * sp, (-Math.sin(h) * ax + Math.cos(h) * ay) * sp);
      }
    }
  });

  return loco;
}
