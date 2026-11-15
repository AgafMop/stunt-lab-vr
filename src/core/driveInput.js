// Driving controls → { throttle, brake, steer, controllers }.
// XR: right trigger = gas, left trigger = brake; steering = the wheel held with either grip (one or two hands), else the
// left thumbstick. Desktop: W/↑ gas, S/↓ brake, A/D/←/→ steer (eased). Missing controllers or axes read as zeros.
import * as THREE from 'three';
import { createWheelGrip, MAX_WHEEL } from '../game/wheel.js';

const DEAD = 0.12, GRAB_R = 0.3, KEY_RATE = 1 / 0.15;

export function createDriveInput(engine, input, { car3d }) {
  const wheelMesh = car3d.getObjectByName('wheel');
  const center = wheelMesh.position.clone();
  const normal = new THREE.Vector3(0, 0, -1).applyEuler(wheelMesh.rotation);   // toward the driver, car-local
  const up = new THREE.Vector3(0, 1, 0).applyEuler(wheelMesh.rotation);
  const grip = createWheelGrip({ center: center.toArray(), normal: normal.toArray(), up: up.toArray() });
  const baseRot = wheelMesh.rotation.clone();
  const keys = new Set();
  let keySteer = 0, last = performance.now();
  const onDown = e => keys.add(e.code), onUp = e => keys.delete(e.code);
  addEventListener('keydown', onDown); addEventListener('keyup', onUp);
  const held = { left: false, right: false };
  const tmp = new THREE.Vector3();

  function localHand(p) { return car3d.worldToLocal(p.grip.getWorldPosition(tmp)).toArray(); }

  function read() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const out = { throttle: 0, brake: 0, steer: 0, controllers: false };
    const session = engine.renderer.xr.getSession?.();
    if (session) {
      const hands = { left: null, right: null };
      let stick = 0;
      for (const p of input.pointers) {
        const gp = p.source?.gamepad, side = p.handedness;
        if (!gp || (side !== 'left' && side !== 'right')) continue;
        out.controllers = true;
        const trig = gp.buttons?.[0]?.value ?? 0, squeeze = !!gp.buttons?.[1]?.pressed;
        if (side === 'right') out.throttle = trig; else out.brake = trig;
        const pos = localHand(p);
        if (squeeze && !held[side] && Math.hypot(pos[0] - center.x, pos[1] - center.y, pos[2] - center.z) < GRAB_R) { held[side] = true; grip.grab(side, pos); }
        if (!squeeze && held[side]) { held[side] = false; grip.release(side); }
        if (held[side]) hands[side] = pos;
        if (side === 'left' && gp.axes?.length) { const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0]; if (Math.abs(ax) > DEAD) stick = ax; }
      }
      const ang = grip.angle(hands.left, hands.right, dt);
      out.steer = held.left || held.right ? ang / MAX_WHEEL : stick;
    } else {
      out.throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
      out.brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
      const want = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const d = want - keySteer, step = KEY_RATE * dt * (want === 0 ? 1.5 : 1);
      keySteer += Math.abs(d) <= step ? d : Math.sign(d) * step;
      out.steer = keySteer;
    }
    wheelMesh.rotation.set(baseRot.x, baseRot.y, baseRot.z + out.steer * MAX_WHEEL);   // clockwise as the driver sees it
    return out;
  }

  return {
    read,
    /** In the headset: is at least one tracked controller with a gamepad present? (hand tracking alone = false) */
    hasControllers() {
      if (!engine.renderer.xr.getSession?.()) return false;
      return input.pointers.some(p => p.source?.gamepad && !p.source.hand && (p.handedness === 'left' || p.handedness === 'right'));
    },
    /** Gas pressed right now (start lights): right trigger, W/↑ or Space. */
    gasHeld() {
      const session = engine.renderer.xr.getSession?.();
      if (session) return input.pointers.some(p => p.handedness === 'right' && (p.source?.gamepad?.buttons?.[0]?.value ?? 0) > 0.5);
      return keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space');
    },
    dispose() { removeEventListener('keydown', onDown); removeEventListener('keyup', onUp); grip.reset(); },
  };
}
