// Car physics (pure, Node-tested). Two uses:
//  - brakeProfile: the scripted strip runs — constant deceleration μg from the gate, so the car stops exactly where
//    model.js says (the numbers the student measures).
//  - createCar/stepCar: the race — a kinematic bicycle model whose grip comes from the same μ table, so a full brake
//    in the race feels like the data and a wet corner taken too fast understeers (the car goes straighter than asked).
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

export const CAR = { maxSpeed: 25, accel: 6, coast: 0.8, wheelbase: 2.6, maxSteer: 0.5 };

export function createCar({ x = 0, z = 0, heading = 0 } = {}) {
  return { x, z, heading, speed: 0, steer: 0, offTrack: 0 };
}

/** One fixed step h (s). input: { throttle 0..1, brake 0..1, steer -1..1 }. Mutates and returns the car. */
export function stepCar(car, { throttle = 0, brake = 0, steer = 0 }, h, surface) {
  const mu = MU[surface] ?? MU.dry;
  if (brake > 0 || throttle <= 0) {
    const decel = Math.max(brake * mu * G, CAR.coast);
    car.speed = Math.max(0, car.speed - decel * h);
  } else {
    car.speed = Math.min(CAR.maxSpeed, car.speed + throttle * CAR.accel * h);
  }
  car.steer = steer;
  let k = Math.tan(steer * CAR.maxSteer) / CAR.wheelbase;           // asked curvature
  const kMax = car.speed > 0 ? mu * G / (car.speed * car.speed) : Infinity;
  if (Math.abs(k) > kMax) k = Math.sign(k) * kMax;                   // friction limit: understeer
  car.heading -= car.speed * k * h;
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
