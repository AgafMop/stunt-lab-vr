// Solid scenery: the car stops at a tyre wall / the guardrail instead of driving through it; open sand stays open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, TRACK_DEF, surfaceAt } from '../src/game/track.js';
import { buildBarriers, collide, tightCorners, railSide, CAR_HALF, BARRIER } from '../src/game/barriers.js';
import { createCar, stepCar } from '../src/game/carSim.js';

const track = buildTrack(TRACK_DEF), walls = buildBarriers(track), half = TRACK_DEF.width / 2;

function driveOff(s, side, seconds = 6) {
  const p = track.sample(s), h = Math.atan2(p.tx, p.tz) + side * 1.2;    // pointed 70° off the road
  const car = Object.assign(createCar({ x: p.x, z: p.z, heading: h }), { speed: 15 });
  let maxU = 0, hits = 0;
  for (let i = 0; i < seconds * 120; i++) {
    const near = track.nearest(car.x, car.z);
    stepCar(car, { throttle: 1, brake: 0, steer: 0 }, 1 / 120, surfaceAt(track, car.x, car.z));
    if (collide(car, track, walls, near) > 0) hits++;
    const q = track.sample(near.s); maxU = Math.max(maxU, Math.abs((car.x - q.x) * q.tz - (car.z - q.z) * q.tx));
  }
  return { maxU, hits };
}

test('into the tyre wall outside a tight corner: stopped at its face', () => {
  const [a, b, sg] = tightCorners(track)[0], s = (a + b) / 2;
  const r = driveOff(s, -sg);
  assert.ok(r.hits > 0);
  assert.ok(r.maxU <= half + BARRIER.tyres - 0.45 - CAR_HALF + 0.6, `${r.maxU}`);
});

test('into the canyon guardrail: stopped at it', () => {
  let s = 0; while (!railSide(track, s)) s += 5;
  s += 20;
  const r = driveOff(s, railSide(track, s));
  assert.ok(r.hits > 0 && r.maxU < half + BARRIER.rail + 0.5, `${r.maxU}`);
});

test('open desert stays open (no invisible walls)', () => {
  const w = walls.at(300);
  assert.ok(w.left === Infinity || w.right === Infinity);
});
