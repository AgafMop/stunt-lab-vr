// Car physics (pure, Node-tested). Two uses:
//  - brakeProfile: the scripted strip runs — constant deceleration μg from the gate, so the car stops exactly where
//    model.js says (the numbers the student measures).
//  - createCar/stepCar: the race — an arcade-honest car that drives like the racing games students know:
//      · the steering wheel turns at a finite rate and asks for a share of the AVAILABLE grip at this speed
//        (full lock at 90 km/h is a firm turn just under the dry limit, never a spin; at walking pace it is the real lock),
//      · the body has yaw inertia (the turn builds up over ≈ 0.15 s and settles, no snapping),
//      · grip is a friction circle from the same μ table as the science model: braking hard leaves less for turning
//        (the gas does not — arcade),
//        and a corner taken faster than √(μ g R) understeers — the car goes straighter than asked (the wet-corner
//        lesson), while the body slides a little (slip angle, for tyre smoke and the look),
//      · gas fades toward top speed (drag), sand drags hard (run-off slows you; it grips enough to steer back),
//      · a full brake decelerates at exactly μ·g — the race brakes like the data.
// Coordinates: three.js ground plane (x, z). heading 0 = facing +z; forward = (sin h, cos h).
// steer > 0 = turn right, which (facing +z, seen from above with y up) decreases the heading.
import { MU, G } from './model.js';

/** Constant-deceleration stop from v0 (m/s) on friction mu. at(t) → distance travelled and speed since the gate. */
export function brakeProfile(v0, mu) {
  const a = mu * G;
  const stopTime = v0 / a;
  const stopDist = v0 * v0 / (2 * a);
  return {
    stopTime, stopDist,
    at(t) {
      if (t >= stopTime) return { x: stopDist, v: 0 };
      if (t <= 0) return { x: 0, v: v0 };
      return { x: v0 * t - 0.5 * a * t * t, v: v0 - a * t };
    },
  };
}

export const CAR = {
  maxSpeed: 26,          // m/s (≈ 94 km/h) — top speed on the long straights
  accel: 6.2,            // m/s² from standstill (fades with speed²)
  coast: 0.6,            // m/s² rolling + engine braking with nothing pressed
  sandDrag: 3.2,         // m/s² extra on sand (run-off)
  reverse: 4,            // m/s top reverse speed (brake held at a standstill)
  wheelbase: 2.7,
  maxSteer: 0.55,        // rad, the wheels' full lock at walking pace
  steerRate: 6,          // full-lock fractions per second the wheels can turn (arcade: quick hands)
  gripAsk: 0.9,          // full lock asks this × the (arcade) dry grip at speed: just under the limit — a held turn bites, never
                         // slides on dry (only braking hard while turning, or the wet / sand, take you past it)
  // SIDEWAYS grip × μ — arcade handling on dry tarmac (like the racing games students know); the wet keeps far less of
  // that bonus so the wet corner stays the lesson. Braking stays exactly μ·g on every surface (the science).
  // sand: the run-off still holds enough sideways to steer back onto the road (it slows you, it does not trap you).
  arcadeGrip: { dry: 1.9, wet: 1.15, sand: 2, oil: 1 },
  yawLag: 0.07,          // s, the body's yaw response time
  steerCurve: 1.2,       // response curve: small inputs (a key tap, a nudge of the stick) turn a little gentler
  brakeCircle: 0.6,      // friction circle: a full brake leaves √(1 − this) of the sideways grip
  gasCircle: 0,          // share of the gas the friction circle charges (arcade: full gas never costs turning grip)
};

export function createCar({ x = 0, z = 0, heading = 0 } = {}) {
  return { x, z, heading, speed: 0, steer: 0, yawRate: 0, slip: 0, sliding: 0, latG: 0, offTrack: 0 };
}

/** The curvature (1/m) the wheels ask for at full lock at this speed. */
export function lockCurvature(speed) {
  const geo = Math.tan(CAR.maxSteer) / CAR.wheelbase;
  const v2 = speed * speed;
  return v2 > 1e-6 ? Math.min(geo, (CAR.gripAsk * CAR.arcadeGrip.dry * MU.dry * G) / v2) : geo;
}

/** One fixed step h (s). input: { throttle 0..1, brake 0..1, steer -1..1 }. Mutates and returns the car. */
export function stepCar(car, { throttle = 0, brake = 0, steer = 0, park = false }, h, surface) {
  const mu = MU[surface] ?? MU.dry, grip = mu * G;
  // ---- the steering wheel: finite rate ----
  const ds = steer - car.steer, maxD = CAR.steerRate * h;
  car.steer += Math.abs(ds) <= maxD ? ds : Math.sign(ds) * maxD;

  // ---- longitudinal ----
  const v = car.speed, gas = throttle > 0, brk = brake > 0;
  let aLong = 0;
  if (v > 0.05) {
    if (brk) aLong = -brake * grip;                                                   // exactly μ·g at full brake
    else if (gas) aLong = throttle * Math.min(grip, CAR.accel * Math.max(0, 1 - (v / CAR.maxSpeed) ** 2));
  } else if (v < -0.05) {
    if (gas) aLong = throttle * grip;                                                 // gas while reversing = brake
    else if (brk) aLong = v > -CAR.reverse ? -2.5 * brake : 0;
  } else if (gas) aLong = throttle * Math.min(grip, CAR.accel);
  else if (brk && !park) { car.still = (car.still || 0) + h; if (car.still > 0.5) aLong = -2.5 * brake; }   // hold the brake to reverse
  if (!brk || gas) car.still = 0;
  const drag = (CAR.coast * (gas || brk ? 0 : 1) + (surface === 'sand' ? CAR.sandDrag * Math.min(1, Math.abs(v) / 9) : 0)) * Math.sign(v);   // sand bites at speed
  let nv = v + (aLong - drag) * h;
  if (v > 0 && nv < 0 && !gas) nv = 0;                                                // braking/coasting stops, never reverses
  if (v < 0 && nv > 0 && !gas) nv = 0;
  if (Math.abs(nv) <= 0.05 && aLong === 0) nv = 0;
  car.speed = Math.max(-CAR.reverse, Math.min(CAR.maxSpeed, nv));

  // ---- lateral: friction circle (hard braking leaves less grip for turning) ----
  const used = Math.min(1, Math.abs(aLong) / grip);
  const circ = Math.min(1, (aLong * v < 0 ? 1 : CAR.gasCircle) * Math.abs(aLong) / grip);   // share of grip the circle charges
  const latMax = (CAR.arcadeGrip[surface] ?? 1) * grip * Math.sqrt(Math.max(0.3, 1 - CAR.brakeCircle * circ * circ));
  const sp = Math.abs(car.speed);
  const kAsk = Math.sign(car.steer) * Math.abs(car.steer) ** CAR.steerCurve * lockCurvature(sp);   // > 0 = right; gentle near centre
  let kGet = kAsk;
  const kLim = sp > 0.1 ? latMax / (sp * sp) : Infinity;
  const over = Math.abs(kAsk) > kLim ? Math.abs(kAsk) / kLim : 1;
  if (over > 1) kGet = Math.sign(kAsk) * kLim;                                        // understeer: straighter than asked
  const rDes = -car.speed * kGet;                                                     // yaw rate (rad/s), right = negative
  car.yawRate += (rDes - car.yawRate) * Math.min(1, h / CAR.yawLag);
  car.heading += car.yawRate * h;
  car.latG = sp * Math.abs(car.yawRate) / G;
  // the body's slip angle (visual): grows when the tyres are past the limit, eases back when they grip again
  const slipWant = over > 1 ? Math.sign(kAsk) * Math.min(0.14, (over - 1) * 0.12 + 0.03) : 0;
  car.slip += (slipWant - car.slip) * Math.min(1, h / 0.25);
  car.sliding = over > 1.02 ? Math.min(1, (over - 1) * 2) : (used > 0.95 && sp > 3 ? 0.6 : 0);

  car.x += Math.sin(car.heading) * car.speed * h;
  car.z += Math.cos(car.heading) * car.speed * h;
  return car;
}

/** Fixed-step accumulator: calls step(h) as many times as dt covers, at most maxSub per call (frame hiccups). */
export function createStepper(step, h = 1 / 120, maxSub = 30) {
  let acc = 0;
  return dt => {
    acc += dt;
    let n = 0;
    while (acc >= h - 1e-9 && n < maxSub) { step(h); acc -= h; n++; }
    if (n === maxSub) acc = Math.min(acc, h);
  };
}
