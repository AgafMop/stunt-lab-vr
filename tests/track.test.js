// The race track: a closed loop with one wet corner; drivable calmly, a teaching failure when rushed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_DEF, buildTrack, surfaceAt, respawn, OFFTRACK_RESPAWN_S } from '../src/game/track.js';
import { createCar, stepCar } from '../src/game/carSim.js';
import { autopilot } from '../src/game/autopilot.js';

const track = buildTrack(TRACK_DEF);
const H = 1 / 120;

test('the loop closes and is about half a kilometre long', () => {
  const a = track.sample(0), b = track.sample(track.length);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.05);
  assert.ok(track.length > 450 && track.length < 550, `${track.length}`);
});

test('surfaces: centreline dry, 7 m sideways sand, the middle of the wet range wet', () => {
  for (const s of [0, 50, 200, 400]) {
    const p = track.sample(s);
    assert.ok(track.nearest(p.x, p.z).dist < 0.05);
    const side = { x: p.x + p.tz * 7, z: p.z - p.tx * 7 };
    assert.equal(surfaceAt(track, side.x, side.z), 'sand');
  }
  const mid = track.sample((TRACK_DEF.wet[0] + TRACK_DEF.wet[1]) / 2);
  assert.equal(surfaceAt(track, mid.x, mid.z), 'wet');
  const dry = track.sample(10);
  assert.equal(surfaceAt(track, dry.x, dry.z), 'dry');
});

test('respawn from far in the desert lands on the centreline facing along the track', () => {
  const p = track.sample(120);
  const r = respawn(track, p.x + p.tz * 40, p.z - p.tx * 40);
  assert.ok(track.nearest(r.x, r.z).dist < 0.05);
  const q = track.sample(track.nearest(r.x, r.z).s);
  const d = Math.atan2(Math.sin(r.heading - Math.atan2(q.tx, q.tz)), Math.cos(r.heading - Math.atan2(q.tx, q.tz)));
  assert.ok(Math.abs(d) < 0.01, `heading off by ${d}`);
  assert.equal(OFFTRACK_RESPAWN_S, 3);
});

test('a calm lap at 15 m/s never leaves the track', () => {
  const st = track.sample(0);
  const car = createCar({ x: st.x, z: st.z, heading: Math.atan2(st.tx, st.tz) });
  car.speed = 15;
  let travelled = 0, px = car.x, pz = car.z;
  for (let i = 0; i < 120 * 60 && travelled < track.length + 20; i++) {
    stepCar(car, autopilot(car, track, 15), H, surfaceAt(track, car.x, car.z));
    travelled += Math.hypot(car.x - px, car.z - pz); px = car.x; pz = car.z;
    assert.notEqual(surfaceAt(track, car.x, car.z), 'sand', `left the track at ${travelled.toFixed(0)} m`);
  }
  assert.ok(travelled >= track.length);
});

test('rushing the wet corner at 25 m/s ends in the sand', () => {
  const st = track.sample(TRACK_DEF.wet[0] - 30);
  const car = createCar({ x: st.x, z: st.z, heading: Math.atan2(st.tx, st.tz) });
  car.speed = 25;
  let sand = false;
  for (let i = 0; i < 120 * 10 && !sand; i++) {
    stepCar(car, autopilot(car, track, 25), H, surfaceAt(track, car.x, car.z));
    sand = surfaceAt(track, car.x, car.z) === 'sand';
  }
  assert.ok(sand);
});
