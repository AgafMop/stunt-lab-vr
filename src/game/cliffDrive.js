// The student drives to the cliff and brakes (pure, Node-tested). Used twice: the acceptance test right after the race
// (stop on the line by eye) and the big shot (brake when the red lamp lights). The speed is held for the student
// (accelerate to `kmh`, then cruise); the ONLY thing they control is when they press the brake — one press, full
// braking to a stop. The deceleration is the road's (the science model's braking distance `brake` at `kmh`), so a
// correct calculation + a reaction like the one measured in the race really stops the car on the line.
// Positions: the car's FRONT axle, metres from the painted line (− = before it, + = past it); the lip at `edge`.
// (The 2026-11-19 headset check: "the film promises stopping on the cliff edge, and the lab never asks for it".)
import { kmhToMs } from './model.js';

export const CLIFF = {
  accel: 4,            // m/s² run-up
  window: 2,           // m: within ±2 m of the line = on the line ("Cut! Perfect!")
  edge: 4.7,           // m from the line to the lip (layout: RIM_X − 0.3 − LINE_X)
};

/**
 * start: the front's start position (m, negative); brake: the braking distance from `kmh` (m).
 * step(dt, pressed) advances the car; the first press latches full braking. Read state from the returned object.
 */
export function createCliffDrive({ kmh, brake, start, edge = CLIFF.edge }) {
  const vT = kmhToMs(kmh);
  const decel = (vT * vT) / (2 * brake);                    // the road's grip: from vT it stops in exactly `brake` m
  const s = { t: 0, x: start, v: 0, phase: 'run', brakeX: null, brakeT: null, overSpeed: null };
  return {
    state: s,
    step(dt, pressed) {
      if (s.phase === 'stopped' || s.phase === 'over') return s;
      s.t += dt;
      if (pressed && s.brakeX == null) { s.brakeX = s.x; s.brakeT = s.t; s.phase = 'brake'; }
      if (s.phase === 'brake') {
        const dv = Math.min(s.v, decel * dt);
        s.x += (s.v - dv / 2) * dt; s.v -= dv;
        if (s.v <= 1e-6) { s.v = 0; s.phase = 'stopped'; }
      } else {
        const v0 = s.v; s.v = Math.min(vT, s.v + CLIFF.accel * dt);
        s.x += (v0 + s.v) / 2 * dt;
      }
      if (s.x >= edge && s.v > 0) { s.phase = 'over'; s.overSpeed = s.v; }
      return s;
    },
    /** Where it would stop if the brake were pressed at the front position x (at cruise speed). */
    stopIfBrakeAt: x => x + brake,
    /** The front position at which to press to stop exactly on the line (+ react m of reaction at cruise). */
    brakePointFor: (react = 0) => -brake - react,
    vT, decel,
  };
}

/** The verdict for a stop `miss` m past the line (negative = before it); fell = went over the lip. */
export function lineVerdict(miss, fell, { window = CLIFF.window } = {}) {
  if (fell) return 'cliff';
  if (Math.abs(miss) <= window) return 'ok';
  return miss > 0 ? 'over' : 'short';
}
