// Steering help for the race (pure, Node-tested). The student always drives: gas, brake AND steering. The help only
// BLENDS a share of the racing-line steering into the student's own (never switches source, never brakes for them):
//   'off'   — pure student input (desktop default: keyboard steering is already eased and rate-limited)
//   'light' — 35 % of the line's steering, fading out as the student steers harder (headset default: thumbstick/wheel)
// The wet-corner lesson is untouched: friction, not steering, limits the turn — no help can beat μ·g.
import { autopilot } from './autopilot.js';

export const ASSIST = { off: 0, light: 0.35 };

export function assistInput(car, track, cur, level = 'light', near) {
  const w = ASSIST[level] ?? 0;
  if (!w) return cur;
  const ap = autopilot(car, track, 99, near);
  const share = w * (1 - Math.min(1, Math.abs(cur.steer)) * 0.7);
  return { ...cur, steer: Math.max(-1, Math.min(1, cur.steer + (ap.steer - cur.steer) * share)) };
}
