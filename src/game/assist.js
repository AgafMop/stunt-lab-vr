// Steering assist for the race (pure, Node-tested). The car holds the racing line (pure pursuit, like the autopilot)
// and the student drives gas and brake; a firm turn of the wheel/stick (|steer| > 0.25) takes over. A speed governor
// eases off before the DRY corners only (so holding the gas never ends in the sand there); the wet corner is left
// alone on purpose — rushing it is the race's lesson (friction, not steering, limits the turn).
import { autopilot } from './autopilot.js';
import { MU, G } from './model.js';

const LOOK = [8, 16, 24, 32, 40];        // metres ahead where the curvature is checked

export function assistInput(car, track, cur, { governor = true } = {}) {
  const ap = autopilot(car, track, 99);
  const steer = Math.abs(cur.steer) > 0.25 ? cur.steer : ap.steer;
  let { throttle, brake } = cur;
  if (governor) {
    const { s } = track.nearest(car.x, car.z);
    const [w0, w1] = track.def.wet;
    let vMax = Infinity;
    for (const d of LOOK) {
      const a = track.sample(s + d - 3), b = track.sample(s + d + 3);
      const dh = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
      const k = dh / 6;                                                   // curvature (1/m)
      const sAt = (s + d) % track.length;
      if (k < 1e-3 || (sAt >= w0 - 12 && sAt <= w1)) continue;            // straight, or the wet corner: no help there
      const v = Math.sqrt((0.82 * MU.dry * G) / k);                      // a margin under the grip limit
      vMax = Math.min(vMax, Math.sqrt(v * v + 2 * 0.6 * MU.dry * G * Math.max(0, d - 8)));   // brake in time
    }
    if (car.speed > vMax) { throttle = 0; brake = Math.max(brake, Math.min(1, (car.speed - vMax) * 0.4)); }
  }
  return { throttle, brake, steer };
}
