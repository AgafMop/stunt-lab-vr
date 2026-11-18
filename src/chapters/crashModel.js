// The crash test's motion (pure, Node-tested): the car into the barrels, and Bumper in its frame.
// The car stops in CRASH.crush metres (≈ 10 g at 40 km/h). Bumper is NOT pushed forward by anything — in the car's
// frame he just keeps going while the car stops (the "force" A here is the car's deceleration seen from inside it).

export const CRASH = { kmh: 40, crush: 0.6, impactX: -8, runIn: 34, slow: 0.1, nose: 2.25 };

/** Car position along its path (m, 0 = touching the barrels) and deceleration at sim time t (0 = impact). */
export function carAt(t) {
  const v = CRASH.kmh / 3.6, a = v * v / (2 * CRASH.crush), tc = v / a;
  if (t < 0) return { x: v * t, A: 0, v };
  if (t < tc) return { x: v * t - 0.5 * a * t * t, A: a, v: v - a * t };
  const tb = t - tc, back = 0.18 * (1 - Math.exp(-tb / 0.12)) * Math.exp(-tb / 0.9);   // the rebound off the barrels
  return { x: CRASH.crush - back, A: tb < 0.15 ? -30 * Math.exp(-tb / 0.05) : 0, v: 0 };
}

/** One step of the dummy in the car's frame. s = { u, du, th, dth, ph, dph } (hip slide m, torso pitch rad, head nod
 *  rad); A = the car's deceleration (m/s², > 0 while it stops). Mutates and returns s. */
export function dummyStep(s, A, h, belted) {
  // hip slide: the lap belt holds the hips (a stiff spring past 2 cm); without it the knees stop them at the dash
  const fHip = belted ? -40000 * Math.max(0, s.u - 0.02) - 300 * s.du
    : -(s.u > 0.14 ? 9000 * (s.u - 0.14) + 60 * s.du : 0) - 6 * s.du - 30 * s.u;
  s.du += (A + fHip) * h; s.u += s.du * h;
  // torso pitch about the hips: inertia tips it forward; the shoulder belt holds it (unbelted: the airbag catches it
  // past ~0.45 rad)
  const fTh = belted ? -900 * s.th - 30 * s.dth
    : -(s.th > 0.45 ? 900 * (s.th - 0.45) + 20 * s.dth : 0) - 25 * s.th - 3 * s.dth;
  s.dth += (A * (belted ? 0.5 : 1.6) + fTh) * h; s.th += s.dth * h;
  // head nod about the neck: whiplash forward, then back (unbelted: the airbag pushes it back)
  const fPh = -140 * s.ph - 7 * s.dph - (!belted && s.th > 0.42 ? 500 * Math.max(0, s.ph - 0.1) : 0);
  s.dph += (A * (belted ? 0.6 : 1.2) + fPh) * h; s.ph += s.dph * h;
  s.u = Math.min(0.3, Math.max(-0.02, s.u)); s.th = Math.min(0.95, Math.max(-0.15, s.th)); s.ph = Math.min(0.8, Math.max(-0.4, s.ph));
  return s;
}
