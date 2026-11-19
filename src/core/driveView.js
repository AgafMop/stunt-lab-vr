// Ways to watch the car you drive:
//   chase   — (desktop default) the racing-game camera: behind and above the car, swinging round smoothly in the
//             corners (heading lag), looking a little ahead; the field of view opens slightly with speed. Never in
//             the headset (a camera that moves on its own makes people sick there).
//   cockpit — the student sits in the driver's seat; the rig follows the seat with YAW ONLY (no roll/pitch ever),
//             a soft vignette eases in on fast turns / hard acceleration (headset).
// Switching fades out/in. (The tower's remote-control table view was removed after the 2026-11-19 headset check:
// "driving from above is bizarre". The headset drives from the driver's seat only.)
import * as THREE from 'three';
import { TRACK_ORIGIN } from '../lab/stuntScene.js';
import { createVignette } from '../fx/vignette.js';

export const CHASE = { back: 7.2, up: 2.6, ahead: 6, lookUp: 0.9, lag: 0.28, fov: [68, 80] };

/** The modes this device offers, in toggle order. */
export function viewModes(engine) {
  return engine.isXR() ? ['cockpit'] : ['chase', 'cockpit'];
}

export function createDriveView(ctx, { car3d }) {
  const { engine, lab, loco } = ctx;
  const seat = car3d.getObjectByName('seat');
  const frame = car3d.userData.built ? new THREE.Group() : cockpitFrame(); car3d.add(frame);   // the Blender car has a real dash + pillars
  const vignette = createVignette(engine);
  const eye = new THREE.Vector3(), cam = new THREE.Vector3(), look = new THREE.Vector3();
  const baseFov = engine.camera.fov;
  let mode = null, prevHeading = null, prevSpeed = 0, busy = false, camYaw = null, camPos = null;

  function chasePose(dt) {
    const p = car3d.position, h = car3d.rotation.y;
    if (camYaw == null || dt === 0) camYaw = h;
    let d = h - camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    camYaw += d * Math.min(1, dt / CHASE.lag);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    cam.set(p.x - fx * CHASE.back, p.y + CHASE.up, p.z - fz * CHASE.back);
    if (!camPos || dt === 0) camPos = cam.clone(); else camPos.lerp(cam, Math.min(1, dt / 0.06));
    look.set(p.x + fx * CHASE.ahead, p.y + CHASE.lookUp, p.z + fz * CHASE.ahead);
    const dx = look.x - camPos.x, dy = look.y - camPos.y, dz = look.z - camPos.z;
    loco.setPitch(Math.atan2(dy, Math.hypot(dx, dz)));
    return { pos: camPos, yaw: Math.atan2(-dx, -dz) };
  }
  let chase = null;

  const view = {
    get mode() { return mode; },
    modes: () => viewModes(engine),
    async setMode(m) {
      if (busy || m === mode || !view.modes().includes(m)) return;
      busy = true;
      if (mode) await engine.fade(1, 180);
      engine.camera.fov = baseFov; engine.camera.updateProjectionMatrix();
      {
        loco.lock(true);
        frame.visible = m === 'cockpit';
        const hands = car3d.getObjectByName('driverHands'); if (hands) hands.visible = m === 'cockpit';
        ctx.input?.setRaysOnHit?.(m === 'cockpit');
        car3d.userData.setInterior?.(m === 'cockpit');
        if (m === 'cockpit') { loco.setPitch(-0.08); loco.follow(() => ({ pos: seat.getWorldPosition(eye), yaw: car3d.rotation.y + Math.PI })); }
        else { camYaw = null; camPos = null; chase = chasePose(0); loco.follow(() => chase); }   // the pose is advanced once per frame in update()
        if (m === 'chase') vignette.set(0);
      }
      mode = m;
      if (ctx.audio?.sfx) ctx.audio.sfx('click');
      await engine.fade(0, 220);
      busy = false;
    },
    toggle() { const ms = view.modes(); return view.setMode(ms[(ms.indexOf(mode) + 1) % ms.length]); },
    /** Move the full-size and the model car to the sim state; place the rig after the car (no lag). */
    update(car, dt) {
      car3d.position.set(TRACK_ORIGIN.x + car.x, 0, TRACK_ORIGIN.z + car.z);
      car3d.rotation.y = car.heading - (car.slip || 0);                        // the body slides a little past the limit
      if (mode === 'cockpit' && dt > 0) {
        const yawRate = prevHeading == null ? 0 : Math.abs(car.heading - prevHeading) / dt;
        const accel = Math.abs(car.speed - prevSpeed) / dt;
        vignette.set(Math.max((yawRate - 0.4) / 1.2, accel > 4 ? (accel - 4) / 6 : 0));
      }
      if (mode === 'chase' && !engine.isXR()) {                               // a touch of speed: the view opens up
        const f = CHASE.fov[0] + (CHASE.fov[1] - CHASE.fov[0]) * Math.min(1, Math.abs(car.speed) / 26) ** 1.5;
        if (Math.abs(engine.camera.fov - f) > 0.05) { engine.camera.fov += (f - engine.camera.fov) * Math.min(1, dt * 3); engine.camera.updateProjectionMatrix(); }
      }
      prevHeading = car.heading; prevSpeed = car.speed;
      lab.focusShadow?.(car3d.position.x, car3d.position.z);          // the sun's shadow map follows the car
      if (mode === 'chase') chase = chasePose(dt);
      loco.applyFollow();
    },
    dispose() {
      loco.follow(null); loco.lock(false); ctx.input?.setRaysOnHit?.(false);
      engine.camera.fov = baseFov; engine.camera.updateProjectionMatrix();
      car3d.remove(frame); vignette.dispose();
      lab.focusShadow?.(25, -12);
    },
  };
  return view;
}

/** Dashboard, A-pillars and a roof edge: a fixed frame of reference inside the car (car-local, driver on +x). */
function cockpitFrame() {
  const g = new THREE.Group(); g.name = 'cockpitFrame'; g.visible = false;
  const m = new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.7 });
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.35), m); dash.position.set(0, 0.84, 0.5); g.add(dash);
  for (const x of [-0.78, 0.78]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.6, 0.035), m);
    p.position.set(x * 1.02, 1.12, 0.62); p.rotation.x = -0.6; g.add(p);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.1), m); roof.position.set(0, 1.4, 0.3); g.add(roof);
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.04, 20), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  gauge.position.set(0.38, 0.905, 0.42); gauge.rotation.y = Math.PI; gauge.name = 'gauge'; g.add(gauge);
  return g;
}
