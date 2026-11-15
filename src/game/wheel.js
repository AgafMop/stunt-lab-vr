// Steering wheel held by one or two controllers (pure, Node-tested).
// The wheel plane: centre, normal pointing toward the driver, up. A hand's angle on the plane is measured CCW from the
// driver's right; turning clockwise (as the driver sees it) = steering right = positive wheel angle.
// Increments are integrated per call, so turns past 180° don't wrap; released, the wheel self-centres.
export const MAX_WHEEL = 2.5;            // rad (≈ 143°) each way
const RETURN_RATE = 2;                   // 1/s: exp(-2·0.5) ≈ 0.37 left after half a second

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createWheelGrip({ center, normal, up }) {
  const right = cross(normal.map(v => -v), up);          // forward (−normal) × up
  const last = { left: null, right: null };
  let wheel = 0;
  const phi = p => { const v = sub(p, center); return Math.atan2(dot(v, up), dot(v, right)); };

  return {
    grab(side, pos) { last[side] = phi(pos); },
    release(side) { last[side] = null; },
    held: () => last.left != null || last.right != null,
    /** left/right: hand positions [x,y,z] (null if that hand isn't on the wheel). Returns the wheel angle (rad). */
    angle(left, right, dt = 1 / 72) {
      const incs = [];
      for (const [side, pos] of [['left', left], ['right', right]]) {
        if (last[side] == null || !pos) continue;
        const f = phi(pos);
        incs.push(-wrap(f - last[side]));
        last[side] = f;
      }
      if (incs.length) wheel += incs.reduce((a, b) => a + b, 0) / incs.length;
      else wheel *= Math.exp(-RETURN_RATE * dt);
      wheel = Math.max(-MAX_WHEEL, Math.min(MAX_WHEEL, wheel));
      return wheel;
    },
    /** Steering input -1..1 for stepCar. */
    steer: () => wheel / MAX_WHEEL,
    reset() { wheel = 0; last.left = last.right = null; },
  };
}
