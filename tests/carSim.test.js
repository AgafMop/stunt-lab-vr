// Car physics for the race and the scripted strip runs. The race must brake like the science model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brakeProfile, CAR, createCar, stepCar, createStepper } from '../src/game/carSim.js';
import { MU, G, kmhToMs, brakingDistance } from '../src/game/model.js';

const H = 1 / 120;
const none = { throttle: 0, brake: 0, steer: 0 };

test('brake profile stops exactly at the model braking distance and stays there', () => {
  const p = brakeProfile(kmhToMs(80), MU.dry);
  assert.ok(Math.abs(p.stopDist - brakingDistance(80)) < 1e-6);
  assert.equal(p.at(p.stopTime).v, 0);
  assert.ok(Math.abs(p.at(p.stopTime).x - p.stopDist) < 1e-9);
  assert.equal(p.at(p.stopTime + 5).x, p.stopDist);
  assert.equal(p.at(0).x, 0);
  assert.equal(p.at(0).v, kmhToMs(80));
});

test('full brake in the race sim stops within 1 % of the model distance', () => {
  const car = createCar(); car.speed = kmhToMs(80);
  for (let i = 0; i < 20000 && car.speed > 0; i++) stepCar(car, { throttle: 0, brake: 1, steer: 0 }, H, 'dry');
  const d = Math.hypot(car.x, car.z);
  assert.ok(Math.abs(d - brakingDistance(80)) / brakingDistance(80) < 0.01, `${d}`);
});

test('letting go of everything: the car coasts to a stop in a straight line', () => {
  const car = createCar({ heading: 0.3 }); car.speed = kmhToMs(60);
  for (let i = 0; i < 60000 && car.speed > 0; i++) stepCar(car, none, H, 'dry');
  assert.equal(car.speed, 0);
  assert.ok(Math.abs(car.heading - 0.3) < 1e-6);
  assert.ok(Math.abs(Math.atan2(car.x, car.z) - 0.3) < 1e-6, 'moved along its heading');
});

// radius of the path this instant: v / yaw rate, measured over one tiny step
function radius(speed, steer, surface) {
  const car = createCar(); car.speed = speed;
  const h = 1e-4;
  stepCar(car, { throttle: 0, brake: 0, steer }, h, surface);
  return speed * h / Math.abs(car.heading);
}

test('too fast on wet: the car turns less than asked (friction limit), never tighter than v²/(μg)', () => {
  const r = radius(25, 1, 'wet');
  assert.ok(r >= 25 ** 2 / (MU.wet * G) * (1 - 1e-3), `${r}`);
});

test('slow on dry: the car follows the steering (bicycle radius)', () => {
  const r = radius(8, 0.3, 'dry');
  const bike = CAR.wheelbase / Math.tan(0.3 * CAR.maxSteer);
  assert.ok(Math.abs(r - bike) / bike < 0.02, `${r} vs ${bike}`);
});

test('steer right (+) turns to the right of the heading', () => {
  const car = createCar(); car.speed = 10;
  for (let i = 0; i < 60; i++) stepCar(car, { throttle: 0, brake: 0, steer: 0.5 }, H, 'dry');
  assert.ok(car.heading < 0, 'heading decreases = turns right when facing +z');
});

test('a frame hiccup (dt 0.25 s) gives the same state as 30 fixed steps', () => {
  const input = { throttle: 1, brake: 0, steer: 0.4 };
  const a = createCar(), b = createCar();
  const stepper = createStepper(h => stepCar(a, input, h, 'dry'), H, 30);
  stepper(0.25);
  for (let i = 0; i < 30; i++) stepCar(b, input, H, 'dry');
  for (const k of ['x', 'z', 'heading', 'speed']) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k);
});

test('throttle accelerates up to the top speed, never beyond', () => {
  const car = createCar();
  for (let i = 0; i < 120 * 30; i++) stepCar(car, { throttle: 1, brake: 0, steer: 0 }, H, 'dry');
  assert.ok(Math.abs(car.speed - CAR.maxSpeed) < 1e-9);
});
