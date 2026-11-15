// Pure-pursuit driver (pure): drives a car round the track at a target speed. Used by ?auto self-play, by the ghost
// rival in the race, and by the track tests. Returns the same input shape a student produces.
import { CAR } from './carSim.js';

export function autopilot(car, track, targetSpeed) {
  const { s } = track.nearest(car.x, car.z);
  const Ld = Math.max(6, car.speed * 0.7);
  const p = track.sample(s + Ld);
  const want = Math.atan2(p.x - car.x, p.z - car.z);
  const alpha = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
  const k = 2 * Math.sin(alpha) / Ld;
  const steer = Math.max(-1, Math.min(1, -Math.atan(k * CAR.wheelbase) / CAR.maxSteer));
  const throttle = car.speed < targetSpeed - 0.1 ? 1 : 0;
  const brake = car.speed > targetSpeed + 0.3 ? Math.min(1, (car.speed - targetSpeed) * 0.5) : 0;
  return { throttle, brake, steer };
}
