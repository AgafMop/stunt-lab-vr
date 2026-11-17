// Car physics for the race and the scripted strip runs. The race must brake like the science model, and drive like a
// car: finite steering rate, yaw inertia, grip-limited turns (understeer past √(μgR)), drag, sand run-off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brakeProfile, CAR, createCar, stepCar, createStepper, lockCurvature } from '../src/game/carSim.js';
import { MU, G, kmhToMs, brakingDistance } from '../src/game/model.js';

const H = 1 / 120;
const none = { throttle: 0, brake: 0, steer: 0 };
const run = (car, input, seconds, surface = 'dry') => { for (let i = 0; i < seconds / H; i++) stepCar(car, typeof input === 'function' ? input(car) : input, H, surface); return car; };

test('brake profile stops exactly at the model braking distance and stays there', () => {
  const p = brakeProfile(kmhToMs(80), MU.dry);
  assert.ok(Math.abs(p.stopDist - brakingDistance(80)) < 1e-6);
  assert.equal(p.at(p.stopTime).v, 0);
  assert.ok(Math.abs(p.at(p.stopTime).x - p.stopDist) < 1e-9);
  assert.equal(p.at(p.stopTime + 5).x, p.stopDist);
  assert.equal(p.at(0).x, 0);
  assert.equal(p.at(0).v, kmhToMs(80));
});

test('full brake in the race sim stops within 1 % of the model distance, on every surface', () => {
  for (const surface of ['dry', 'wet']) {
    const car = createCar(); car.speed = kmhToMs(80);
    for (let i = 0; i < 20000 && car.speed > 0; i++) stepCar(car, { throttle: 0, brake: 1, steer: 0 }, H, surface);
    const d = Math.hypot(car.x, car.z), want = brakingDistance(80, surface);
    assert.ok(Math.abs(d - want) / want < 0.01, `${surface}: ${d} vs ${want}`);
  }
});

test('a held brake never rolls the car backwards while parked (start lights), but reverses once released into "hold to reverse"', () => {
  const parked = run(createCar(), { throttle: 0, brake: 1, steer: 0, park: true }, 5);
  assert.equal(parked.speed, 0);
  const rev = run(createCar(), { throttle: 0, brake: 1, steer: 0 }, 3);
  assert.ok(rev.speed < -1 && rev.speed >= -CAR.reverse, `${rev.speed}`);
});

test('letting go of everything: the car coasts to a stop in a straight line', () => {
  const car = createCar({ heading: 0.3 }); car.speed = kmhToMs(60);
  for (let i = 0; i < 60000 && car.speed > 0; i++) stepCar(car, none, H, 'dry');
  assert.equal(car.speed, 0);
  assert.ok(Math.abs(car.heading - 0.3) < 1e-6);
  assert.ok(Math.abs(Math.atan2(car.x, car.z) - 0.3) < 1e-6, 'moved along its heading');
});

test('the steering wheel turns at a finite rate: a key press does not snap the car', () => {
  const car = createCar(); car.speed = 15;
  stepCar(car, { throttle: 0, brake: 0, steer: 1 }, H, 'dry');
  assert.ok(car.steer > 0 && car.steer <= CAR.steerRate * H + 1e-9);
  run(car, { throttle: 0, brake: 0, steer: 1 }, 1);
  assert.equal(car.steer, 1);
});

test('yaw inertia: the turn builds up smoothly (no instant yaw rate)', () => {
  const car = createCar(); car.speed = 12;
  car.steer = 1;                                                   // wheels already at full lock
  stepCar(car, { throttle: 0, brake: 0, steer: 1 }, H, 'dry');
  const r1 = Math.abs(car.yawRate);
  run(car, { throttle: 0, brake: 0, steer: 1 }, 0.6);
  assert.ok(r1 < Math.abs(car.yawRate) * 0.15, `${r1} vs ${car.yawRate}`);
});

test('full lock at speed asks for a little more than the dry grip: a firm limit turn, never tighter than v²/(μg)', () => {
  for (const [v, surface] of [[25, 'dry'], [25, 'wet'], [18, 'dry']]) {
    const car = createCar(); car.speed = v; car.steer = 1;
    run(car, { throttle: 0.3, brake: 0, steer: 1 }, 1.2, surface);
    const R = Math.abs(car.speed / car.yawRate);
    assert.ok(R >= car.speed ** 2 / (MU[surface] * G) * 0.98, `${surface} ${v}: R ${R.toFixed(1)}`);
  }
  assert.ok(lockCurvature(25) * 25 * 25 > MU.dry * G);           // asks for more than the grip…
  assert.ok(lockCurvature(25) * 25 * 25 < 1.2 * MU.dry * G);     // …but only a little
});

test('too fast on wet: the car goes straighter than asked (understeer) and its body slides', () => {
  const car = createCar(); car.speed = 25; car.steer = 1;
  run(car, { throttle: 0.4, brake: 0, steer: 1 }, 1, 'wet');
  assert.ok(car.sliding > 0.5 && Math.abs(car.slip) > 0.05, `sliding ${car.sliding} slip ${car.slip}`);
  const dry = createCar(); dry.speed = 12; dry.steer = 0.3;
  run(dry, { throttle: 0.2, brake: 0, steer: 0.3 }, 1, 'dry');
  assert.equal(dry.sliding, 0);
});

test('slow on dry: the car follows the steering (bicycle radius)', () => {
  const car = createCar(); car.speed = 5; car.steer = 0.4;
  run(car, { throttle: 0.05, brake: 0, steer: 0.4 }, 1.5);
  const R = Math.abs(car.speed / car.yawRate), bike = 1 / lockCurvature(car.speed) / 0.4 ** CAR.steerCurve;   // with the response curve
  assert.ok(Math.abs(R - bike) / bike < 0.05, `${R} vs ${bike}`);
});

test('steer right (+) turns to the right of the heading', () => {
  const car = createCar(); car.speed = 10;
  run(car, { throttle: 0, brake: 0, steer: 0.5 }, 0.5);
  assert.ok(car.heading < 0, 'heading decreases = turns right when facing +z');
});

test('a frame hiccup (dt 0.25 s) gives the same state as 30 fixed steps', () => {
  const input = { throttle: 1, brake: 0, steer: 0.4 };
  const a = createCar(), b = createCar();
  const stepper = createStepper(h => stepCar(a, input, h, 'dry'), H, 30);
  stepper(0.25);
  for (let i = 0; i < 30; i++) stepCar(b, input, H, 'dry');
  for (const k of ['x', 'z', 'heading', 'speed', 'yawRate', 'steer']) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k);
});

test('throttle: brisk from standstill, fades toward the top speed, never beyond', () => {
  const car = run(createCar(), { throttle: 1, brake: 0, steer: 0 }, 3);
  assert.ok(car.speed > 14, `0–3 s: ${car.speed}`);
  run(car, { throttle: 1, brake: 0, steer: 0 }, 40);
  assert.ok(car.speed <= CAR.maxSpeed && car.speed > CAR.maxSpeed * 0.95, `${car.speed}`);
});

test('sand drags: run-off slows the car fast, and you can still drive out of it', () => {
  const car = createCar(); car.speed = 20;
  run(car, none, 2, 'sand');
  assert.ok(car.speed < 14, `${car.speed}`);
  const out = run(createCar(), { throttle: 1, brake: 0, steer: 0 }, 3, 'sand');
  assert.ok(out.speed > 3, `${out.speed}`);
});
