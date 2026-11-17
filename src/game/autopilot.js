// Pure-pursuit driver (pure): drives a car round the track at a target speed (a number, or a function s → m/s such as
// track.speedProfile). Used by ?auto self-play, by the steering assist and by the track tests. Returns the same input
// shape a student produces.
import { lockCurvature, CAR } from './carSim.js';

export function autopilot(car, track, target, near = track.nearest(car.x, car.z), { look = 1 } = {}) {
  const { s } = near;
  const v = Math.abs(car.speed);
  const Ld = Math.max(7, v * 0.75) * look;
  const p = track.sample(s + Ld);
  const want = Math.atan2(p.x - car.x, p.z - car.z);
  const alpha = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
  const k = 2 * Math.sin(alpha) / Ld;                                   // > 0 = left
  const x = Math.max(-1, Math.min(1, -k / lockCurvature(v)));
  const steer = Math.sign(x) * Math.abs(x) ** (1 / CAR.steerCurve);     // invert the car's response curve
  const tv = typeof target === 'function' ? target(s + Math.max(4, v * 0.3)) : target;
  const throttle = car.speed < tv - 0.1 ? Math.min(1, (tv - car.speed) * 0.8 + 0.2) : 0;
  const brake = car.speed > tv + 0.3 ? Math.min(1, (car.speed - tv) * 0.5) : 0;
  return { throttle, brake, steer };
}
