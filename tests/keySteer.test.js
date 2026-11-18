// Keyboard steering: eased in, springs back faster, a little less lock at speed — never a snap; with no key held the car
// settles parallel to the road (keyAlign, the arcade heading hold).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keySteerStep, keyAlign, KEY, ALIGN } from '../src/game/keySteer.js';
import { createCar, stepCar } from '../src/game/carSim.js';
import { buildTrack, TRACK_DEF } from '../src/game/track.js';

const run = (want, seconds, speed, cur = 0) => { for (let t = 0; t < seconds; t += 1 / 120) cur = keySteerStep(cur, want, 1 / 120, speed); return cur; };

test('held at walking pace: full lock in well under 0.1 s (arcade)', () => {
  assert.ok(run(1, 0.03, 2) < 0.7);
  assert.ok(Math.abs(run(1, 0.1, 2) - 1) < 0.02);
});
test('held at top speed: eased in over ≈ 0.16 s, capped at 90 %', () => {
  assert.ok(run(1, 0.05, 26) < 0.5);
  assert.equal(run(1, 1, 26), KEY.capAtTop);
});
test('released: springs back faster than it went in, and never overshoots past centre', () => {
  const held = run(1, 1, 26);
  const back = run(0, 0.15, 26, held);
  assert.ok(back < held * 0.62 && back >= 0, `${back}`);
  assert.equal(run(0, 1, 26, held), 0);
});
test('left is the mirror of right', () => {
  assert.equal(run(-1, 0.2, 10), -run(1, 0.2, 10));
});

const track = buildTrack(TRACK_DEF);
const onRoad = (s, yaw, speed) => { const p = track.sample(s); return Object.assign(createCar({ x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz) + yaw }), { speed }); };

test('keyAlign: no key, pointing left of the road → steers right (and the mirror); along the road → nothing', () => {
  for (const yaw of [0.2, -0.2]) {
    const car = onRoad(20, yaw, 20);
    assert.equal(Math.sign(keyAlign(car, track, track.nearest(car.x, car.z), 0)), Math.sign(yaw));
  }
  const car = onRoad(20, 0, 20);
  assert.ok(Math.abs(keyAlign(car, track, track.nearest(car.x, car.z), 0)) < 0.05);
});

test('keyAlign: released, the car settles parallel to the road (a lane change, not a spin)', () => {
  const car = onRoad(10, 0.25, 20);
  for (let i = 0; i < 1.5 * 120; i++) stepCar(car, { throttle: 0.3, brake: 0, steer: keyAlign(car, track, track.nearest(car.x, car.z), 0) }, 1 / 120, 'dry');
  const p = track.sample(track.nearest(car.x, car.z).s), err = Math.atan2(Math.sin(car.heading - Math.atan2(p.tx, p.tz)), Math.cos(car.heading - Math.atan2(p.tx, p.tz)));
  assert.ok(Math.abs(err) < 0.03, `heading off the road by ${err}`);
});

test('keyAlign: a held key still wins; off when crawling, turned round, or ALIGN.tau = 0', () => {
  const car = onRoad(20, 0.1, 20), near = track.nearest(car.x, car.z);
  assert.ok(keyAlign(car, track, near, -1) < -0.3, 'full left key still turns left');
  assert.equal(keyAlign(onRoad(20, 0.3, 1.5), track, near, 0.2), 0.2);
  const back = onRoad(20, 2.5, 10);
  assert.equal(keyAlign(back, track, track.nearest(back.x, back.z), 0), 0);
  const tau = ALIGN.tau; ALIGN.tau = 0;
  try { assert.equal(keyAlign(car, track, near, 0.4), 0.4); } finally { ALIGN.tau = tau; }
});

test('keyAlign: a held key = a steady move across the road (a lane change), never a spin', () => {
  const car = onRoad(20, 0, 20), p0 = track.sample(20);
  const errs = [];
  for (let i = 0; i < 1.5 * 120; i++) {
    const near = track.nearest(car.x, car.z);
    stepCar(car, { throttle: 0.4, brake: 0, steer: keyAlign(car, track, near, -1) }, 1 / 120, 'dry');
    const p = track.sample(near.s);
    errs.push(Math.atan2(Math.sin(car.heading - Math.atan2(p.tx, p.tz)), Math.cos(car.heading - Math.atan2(p.tx, p.tz))));
  }
  const u = (car.x - p0.x) * p0.tz - (car.z - p0.z) * p0.tx;   // > 0 = moved left
  assert.ok(u > 2.5, `moved ${u.toFixed(2)} m left`);
  assert.ok(Math.max(...errs) < 0.35 && Math.abs(errs.at(-1) - errs.at(-30)) < 0.01, `heading settles ${errs.at(-1).toFixed(3)} rad off the road`);
});
