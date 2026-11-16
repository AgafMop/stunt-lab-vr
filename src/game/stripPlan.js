// The motion of one scripted strip run (pure, Node-tested). Positions are of the car's FRONT axle along the strip, in
// metres from the gate (ruler zero). The car accelerates, cruises past the gate at v (the signal), keeps going `react`
// metres at full speed (reaction distance), then brakes with constant deceleration and stops exactly `brake` metres
// later (so what the student sees is what the science model recorded). If `edge` (metres from the gate) is given and
// the car would stop beyond it, the run reports where and how fast it goes over.
import { kmhToMs, G } from './model.js';

export const RUNUP_ACCEL = 4;     // m/s² while accelerating to the target speed
export const CRUISE = 6;          // m at constant speed before the gate

export function planStripRun({ kmh, brake, react = 0, edge = null }) {
  const v = kmhToMs(kmh);
  const runup = (v * v) / (2 * RUNUP_ACCEL);
  const start = -runup - CRUISE;                          // where the front starts (m from the gate)
  const tAcc = v / RUNUP_ACCEL, tCruise = (CRUISE + react) / v;
  const a = (v * v) / (2 * brake);                        // the run's own deceleration (μ_eff · g)
  const tBrake = v / a;
  const brakeAt = react, stop = react + brake;
  const T = tAcc + tCruise + tBrake;
  const frontAt = t => {
    if (t <= 0) return start;
    if (t < tAcc) return start + 0.5 * RUNUP_ACCEL * t * t;
    if (t < tAcc + tCruise) return start + runup + v * (t - tAcc);
    const tb = Math.min(t - tAcc - tCruise, tBrake);
    return brakeAt + v * tb - 0.5 * a * tb * tb;
  };
  const speedAt = t => (t < tAcc ? RUNUP_ACCEL * t : t < tAcc + tCruise ? v : Math.max(0, v - a * (t - tAcc - tCruise)));
  let over = null;
  if (edge != null && stop > edge) {
    // time the front reaches the edge, and the speed there
    let lo = 0, hi = T;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (frontAt(m) < edge) lo = m; else hi = m; }
    over = { t: hi, speed: speedAt(hi) };
  }
  return { v, start, brakeAt, stop, duration: T, frontAt, speedAt, mu: a / G, over };
}
