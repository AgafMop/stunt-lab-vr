import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contact, resolvePair, resolveCars, CAR_BOX } from '../src/game/carCollide.js';
import { createCar, stepCar } from '../src/game/carSim.js';

const car = (x, z, heading = 0, speed = 0) => ({ ...createCar({ x, z, heading }), speed });

test('boxes: side by side touching vs a hand apart; nose to tail', () => {
  assert.ok(contact(car(0, 0), car(1.8, 0)));
  assert.equal(contact(car(0, 0), car(2.0, 0)), null);
  const c = contact(car(0, 0), car(0, 4.1));
  assert.ok(c && Math.abs(c.nz - 1) < 1e-9 && Math.abs(c.depth - 0.3) < 1e-9);
  assert.equal(contact(car(0, 0), car(0, 4.5)), null);
  assert.equal(contact(car(0, 0), car(1.6, 4.0, 0.5)) !== null, true);         // a rotated car's corner reaches in
});

test('rear-end: the hitter slows, the car ahead is shoved, nothing overlaps, momentum kept', () => {
  const a = car(0, 0, 0, 20), b = car(0, 4.2, 0, 10);
  const v = resolvePair(a, b);
  assert.ok(v > 9);
  assert.ok(a.speed < 20 && b.speed > 10, `${a.speed} ${b.speed}`);
  assert.ok(Math.abs(a.speed + b.speed - 30) < 1e-9);
  assert.equal(contact(a, b), null);
});

test('a fast car never drives through a parked one (1/120 s steps, full gas)', () => {
  const a = car(0, 0, 0, 30), b = car(0, 12, 0, 0);
  for (let i = 0; i < 240; i++) {
    stepCar(a, { throttle: 1 }, 1 / 120, 'dry'); stepCar(b, {}, 1 / 120, 'dry');
    resolveCars([a, b]);
    assert.ok(a.z < b.z, `step ${i}: a ${a.z.toFixed(2)} passed b ${b.z.toFixed(2)}`);
    assert.ok(b.z - a.z >= 2 * CAR_BOX.halfL - 0.05);
  }
  assert.ok(b.speed > 0 || b.z > 12, 'the parked car was pushed');
});

test('a side swipe turns both cars and pushes them apart', () => {
  const a = car(0, 0, 0.25, 20), b = car(1.6, 2.5, 0, 18);
  const h0 = [a.heading, b.heading];
  resolveCars([a, b]);
  assert.equal(contact(a, b), null);
  assert.ok(a.heading !== h0[0] || b.heading !== h0[1]);
  assert.ok(b.x > 1.6 && a.x < 0);
});

test('a six-car pile-up settles without overlap or NaN', () => {
  const cars = [0, 1, 2, 3, 4, 5].map(i => car((i % 2) * 1.5, i * 3.6, 0.1 * (i % 3), 15 - i));
  for (let k = 0; k < 120; k++) { for (const c of cars) stepCar(c, { throttle: 0.5 }, 1 / 120, 'dry'); resolveCars(cars, 4); }
  for (const c of cars) for (const v of [c.x, c.z, c.heading, c.speed]) assert.ok(Number.isFinite(v));
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { const c = contact(cars[i], cars[j]); assert.ok(!c || c.depth < 0.05, `${i}-${j} ${c?.depth}`); }
});
