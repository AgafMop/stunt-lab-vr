// The headset's steering wheel (pure, Node-tested): hold the two controllers like a wheel and turn them together.
// No button to hold, and the hands need not reach the virtual wheel. The tilt of the line from the left hand to the
// right hand (in the rig's frame: x = the driver's right, y = up) IS the wheel angle: hands level = straight ahead,
// right hand down = clockwise = steer right. The angle is 1:1, so the gloves drawn on the rim follow the real hands,
// and HANDWHEEL.full (≈ 80°, a quarter turn of the hands) is full lock.
// (The 2026-11-19 headset check: the old wheel needed the grip button held within 30 cm of the wheel's centre, so the
// student never found it. "My hands should sit on the wheel and turn it.")
export const HANDWHEEL = {
  full: 1.4,        // rad of hand tilt = full lock (and the wheel's visual angle at full lock, in every input mode)
  dead: 0.05,       // rad (≈ 3°): a natural, slightly crooked grip still drives straight
  tau: 0.05,        // s: smoothing of the tracking jitter
  minSpan: 0.12,    // m: hands closer than this give no reliable line (one controller on top of the other)
  back: 3,          // 1/s: no hands → the wheel self-centres
};

const clamp = (v, a) => Math.max(-a, Math.min(a, v));

/** The wheel angle (rad, + = clockwise as the driver sees it = steer right) the two hands hold now, or null. */
export function handTilt(left, right) {
  if (!left || !right) return null;
  const dx = right[0] - left[0], dy = right[1] - left[1];
  if (Math.hypot(dx, dy) < HANDWHEEL.minSpan) return null;
  if (dx <= 0) return dy < 0 ? HANDWHEEL.full : -HANDWHEEL.full;     // turned past a quarter (or crossed): full lock
  const a = -Math.atan2(dy, dx);                                      // right hand lower (dy < 0) → + (steer right)
  const { dead, full } = HANDWHEEL;                                   // dead zone, rescaled so full lock stays at `full`
  return clamp(Math.sign(a) * Math.max(0, Math.abs(a) - dead) * full / (full - dead), full) || 0;   // no −0
}

export function createHandWheel() {
  let angle = 0, active = false;
  return {
    /** left/right: rig-local controller positions [x, y, z] or null. Returns the wheel angle (rad). */
    update(left, right, dt) {
      const t = handTilt(left, right);
      active = t != null;
      if (active) angle += (t - angle) * Math.min(1, dt / HANDWHEEL.tau);
      else angle *= Math.exp(-HANDWHEEL.back * dt);
      return angle;
    },
    get angle() { return angle; },
    /** Steering input −1..1 for stepCar. */
    get steer() { return angle / HANDWHEEL.full; },
    get active() { return active; },
    reset() { angle = 0; active = false; },
  };
}
