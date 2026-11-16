// Two ways to watch the car you drive:
//   cockpit — the student sits in the driver's seat; the rig follows the seat with YAW ONLY (no roll/pitch ever),
//             a fixed dashboard + pillars frame the view, a soft vignette eases in on fast turns / hard acceleration.
//   table   — the student stays in the tower chair; the track and the car appear as a 1:70 model on a table, the
//             full-size world is hidden: zero camera motion.
// Switching fades out/in. ?ride=off locks the table view (teacher's choice for the class).
import * as THREE from 'three';
import { TRACK_ORIGIN } from '../lab/stuntScene.js';
import { createVignette } from '../fx/vignette.js';

export function createDriveView(ctx, { car3d, forced = false }) {
  const { engine, lab, loco } = ctx;
  const seat = car3d.getObjectByName('seat');
  const frame = car3d.userData.built ? new THREE.Group() : cockpitFrame(); car3d.add(frame);   // the Blender car has a real dash + pillars
  const mini = lab.makeCar(); mini.scale.setScalar(2.2); lab.mini.add(mini);    // 2.2× so the model car reads on the table
  const vignette = createVignette(engine);
  const eye = new THREE.Vector3();
  let mode = null, prevHeading = null, prevSpeed = 0, busy = false;

  const view = {
    get mode() { return mode; },
    forced,
    async setMode(m) {
      if (busy || m === mode || (forced && mode)) return;
      busy = true;
      if (mode) await engine.fade(1, 180);
      if (m === 'cockpit') {
        loco.lock(true); loco.setPitch(-0.08);
        lab.world.visible = true; lab.table.visible = false; frame.visible = true;
        loco.follow(() => ({ pos: seat.getWorldPosition(eye), yaw: car3d.rotation.y + Math.PI }));
      } else {
        loco.follow(null);
        await loco.goTo('tower', { fade: false });
        loco.lock(true);
        lab.world.visible = false; lab.table.visible = true; frame.visible = false;
        vignette.set(0);
      }
      mode = m;
      if (ctx.audio?.sfx) ctx.audio.sfx('click');
      await engine.fade(0, 220);
      busy = false;
    },
    toggle() { return view.setMode(mode === 'cockpit' ? 'table' : 'cockpit'); },
    /** Move the full-size and the model car to the sim state; place the rig after the car (no lag). */
    update(car, dt) {
      car3d.position.set(TRACK_ORIGIN.x + car.x, 0, TRACK_ORIGIN.z + car.z);
      car3d.rotation.y = car.heading;
      mini.position.set(car.x, 0, car.z); mini.rotation.y = car.heading;
      if (mode === 'cockpit' && dt > 0) {
        const yawRate = prevHeading == null ? 0 : Math.abs(car.heading - prevHeading) / dt;
        const accel = Math.abs(car.speed - prevSpeed) / dt;
        vignette.set(Math.max((yawRate - 0.4) / 1.2, accel > 4 ? (accel - 4) / 6 : 0));
      }
      prevHeading = car.heading; prevSpeed = car.speed;
      lab.focusShadow?.(car3d.position.x, car3d.position.z);          // the sun's shadow map follows the car
      loco.applyFollow();
    },
    dispose() {
      loco.follow(null); loco.lock(false);
      lab.world.visible = true; lab.table.visible = false;
      car3d.remove(frame); lab.mini.remove(mini); vignette.dispose();
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
