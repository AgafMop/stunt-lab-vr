// Keyboard steering (pure, Node-tested): A/D are on/off, a car's wheel is not. Like racing games do it:
//   · the held key eases the wheel in (faster at walking pace, slower at speed) and lets it spring back quicker,
//   · at speed a held key asks for a little less lock (85 % at top speed; with the car's response curve ≈ ¾ of the
//     grip) — a tap is a lane change, not a spin, yet a held key still takes the tightest corner at its speed.
// Analog input (thumbstick, the gripped wheel) never goes through this: it is already proportional.
export const KEY = { rampSlow: 0.12, rampFast: 0.35, back: 0.6, capAtTop: 0.85, vTop: 26 };

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
