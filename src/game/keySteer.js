// Keyboard steering (pure, Node-tested): A/D are on/off, a car's wheel is not. Like racing games do it:
//   · the held key eases the wheel in (faster at walking pace, slower at speed) and lets it spring back quicker,
//   · at speed a held key asks for a little less lock (85 % at top speed; with the car's response curve ≈ ¾ of the
//     grip) — a tap is a lane change, not a spin, yet a held key still takes the tightest corner at its speed.
// Analog input (thumbstick, the gripped wheel) never goes through this: it is already proportional.
//
// keyAlign — the arcade part (Horizon-Chase-like, keyboard only): a held key steers the car's heading AWAY from the
// road's direction, and a released key lets it settle back PARALLEL to the road within ≈ ALIGN.tau. So A/D move the
// car across the road (a lane change, not a spin) and nothing needs a counter-steer. It does not take corners for
// you: with no key the car lags the bend and drifts wide (≈ v²·κ·tau, the "curve push"), so the student steers every
// corner. It only shapes the steering request: stepCar still caps every turn at the grip, so the wet corner rushed
// still slides wide into the sand. Fades out when crawling or pointing well away from the road (turning round,
// driving off on purpose). ALIGN.tau = 0 turns it off.
import { lockCurvature, CAR } from './carSim.js';

export const KEY = { rampSlow: 0.06, rampFast: 0.16, back: 0.7, capAtTop: 0.9, vTop: 26 };   // arcade: snappy

/** One step: current key steer, wanted direction (−1, 0, 1), dt (s), car speed (m/s) → new key steer (−1..1). */
export function keySteerStep(cur, want, dt, speed) {
  const f = Math.min(1, Math.abs(speed) / KEY.vTop);
  const cap = 1 - (1 - KEY.capAtTop) * f;
  const target = want * cap;
  const ramp = KEY.rampSlow + (KEY.rampFast - KEY.rampSlow) * f;           // seconds to full lock
  const toward = target === 0 || Math.sign(target) !== Math.sign(cur) ? 1 / KEY.back : 1;   // springs back faster
  const step = (dt / ramp) * toward;
  const d = target - cur;
  return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
}


export const ALIGN = { tau: 0.25, vMin: 2, vFull: 6, errFull: 0.7, errOff: 1.3 };

const ramp = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));

/** The car's steer request (−1..1) from the key steer: the key's turn + the turn that settles the heading along the road.
 *  near = track.nearest(car) (driveSession has it). */
export function keyAlign(car, track, near, keySteer) {
  const v = car.speed;
  if (!ALIGN.tau || v <= ALIGN.vMin) return keySteer;
  const p = track.sample(near.s), road = Math.atan2(p.tx, p.tz);
  const err = Math.atan2(Math.sin(car.heading - road), Math.cos(car.heading - road));   // > 0 = pointing left of the road
  const w = ramp(ALIGN.vMin, ALIGN.vFull, v) * (1 - ramp(ALIGN.errFull, ALIGN.errOff, Math.abs(err)));
  if (!w) return keySteer;
  const L = lockCurvature(v);
  const k = Math.sign(keySteer) * Math.abs(keySteer) ** CAR.steerCurve * L + w * err / (ALIGN.tau * v);   // > 0 = right
  const x = Math.max(-1, Math.min(1, k / L));
  return Math.sign(x) * Math.abs(x) ** (1 / CAR.steerCurve);
}
