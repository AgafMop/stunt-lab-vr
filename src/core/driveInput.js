// Driving controls → { throttle, brake, steer, controllers, align }.
// XR: right trigger = gas, left trigger = brake; steering = hold the two controllers like a wheel and turn them together
// (handWheel.js: no button to hold, the hands need not reach the virtual wheel), or the left thumbstick when it is
// pushed. Two gloves sit on the car's wheel rim and turn with it (shown in the driver's seat only, driveView).
// Desktop: W/↑ gas, S/↓ brake, A/D/←/→ steer (eased). Missing controllers or axes read as zeros.
// align: driveSession adds keyAlign (the arcade heading hold: let go and the car settles along the road) — keyboard
// and headset alike.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHandWheel, HANDWHEEL } from '../game/handWheel.js';
import { keySteerStep } from '../game/keySteer.js';

const DEAD = 0.12;
export const RIM_R = 0.17;           // the Blender car's steering wheel: 0.38 m across the rim

export function createDriveInput(engine, input, { car3d, speed = () => 0 }) {
  const wheelMesh = car3d.getObjectByName('wheel');
  const baseRot = wheelMesh.rotation.clone();
  const hands = driverHands(); wheelMesh.add(hands);
  const hw = createHandWheel();
  const keys = new Set();
  let keySteer = 0, last = performance.now();
  const onDown = e => keys.add(e.code), onUp = e => keys.delete(e.code);
  addEventListener('keydown', onDown); addEventListener('keyup', onUp);

  function read() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const out = { throttle: 0, brake: 0, steer: 0, controllers: false, align: true };
    let shown;                                                           // the wheel's visual angle (rad, clockwise)
    if (engine.renderer.xr.getSession?.()) {
      const pos = { left: null, right: null };
      let stick = 0;
      for (const p of input.pointers) {
        const gp = p.source?.gamepad, side = p.handedness;
        if (!gp || (side !== 'left' && side !== 'right')) continue;
        out.controllers = true;
        const trig = gp.buttons?.[0]?.value ?? 0;
        if (side === 'right') out.throttle = trig; else out.brake = trig;
        pos[side] = p.grip.position.toArray();                           // rig-local: x = the driver's right, y = up
        if (side === 'left' && gp.axes?.length) { const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0]; if (Math.abs(ax) > DEAD) stick = ax; }
      }
      const ang = hw.update(pos.left, pos.right, dt);
      if (stick) { out.steer = stick; shown = stick * HANDWHEEL.full; }
      else { out.steer = hw.steer; shown = ang; }
      out.hands = hw.active;
    } else {
      out.throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
      out.brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
      const want = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      keySteer = keySteerStep(keySteer, want, dt, speed());               // eased, gentler at speed (keySteer.js)
      out.steer = keySteer;
      out.keyboard = true;
      shown = keySteer * HANDWHEEL.full;
    }
    wheelMesh.rotation.set(baseRot.x, baseRot.y, baseRot.z + shown);    // + about the column = clockwise as the driver sees it
    return out;
  }

  return {
    read,
    hands,
    /** The hand wheel's live state (tests, the steering check before the lights). */
    wheel: hw,
    /** In the headset: is at least one tracked controller with a gamepad present? (hand tracking alone = false) */
    hasControllers() {
      if (!engine.renderer.xr.getSession?.()) return false;
      return input.pointers.some(p => p.source?.gamepad && !p.source.hand && (p.handedness === 'left' || p.handedness === 'right'));
    },
    /** Y on the left controller held (skip the lap; xr-standard buttons[5]). Desktop: never (a screen button does it). */
    skipHeld() {
      if (!engine.renderer.xr.getSession?.()) return false;
      return input.pointers.some(p => p.handedness === 'left' && p.source?.gamepad?.buttons?.[5]?.pressed);
    },
    /** Gas pressed right now (start lights): right trigger, W/↑ or Space. */
    gasHeld() {
      const session = engine.renderer.xr.getSession?.();
      if (session) return input.pointers.some(p => p.handedness === 'right' && (p.source?.gamepad?.buttons?.[0]?.value ?? 0) > 0.5);
      return keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space');
    },
    dispose() { removeEventListener('keydown', onDown); removeEventListener('keyup', onUp); hw.reset(); hands.removeFromParent(); },
  };
}

/** Two gloved fists gripping the rim at a quarter to three (wheel-local: x = car x, so the driver's right hand is at
 *  −x; −z faces the driver). One mesh, one material (vertex colours): 1 draw call. */
function driverHands() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  for (const side of [-1, 1]) {
    const fist = new THREE.SphereGeometry(0.042, 12, 8); fist.scale(0.95, 1.25, 0.9);
    fist.translate(side * RIM_R, 0.005, -0.012);
    const thumb = new THREE.CapsuleGeometry(0.013, 0.035, 3, 8); thumb.rotateZ(side * 0.9);
    thumb.translate(side * (RIM_R - 0.03), 0.035, -0.035);
    const cuff = new THREE.CylinderGeometry(0.029, 0.032, 0.05, 12); cuff.rotateX(Math.PI / 2);
    cuff.translate(side * (RIM_R + 0.01), -0.02, -0.062);
    parts.push(paint(fist, 0x26262c), paint(thumb, 0x26262c), paint(cuff, 0xf07a1a));
  }
  const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  m.name = 'driverHands'; m.visible = false; m.castShadow = false;
  return m;
}
