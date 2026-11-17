// Steering help: only blends, never switches or brakes; the student's own firm steering dominates; 'off' is pure input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistInput } from '../src/game/assist.js';
import { createCar, stepCar } from '../src/game/carSim.js';
import { TRACK_DEF, buildTrack, surfaceAt } from '../src/game/track.js';

const track = buildTrack(TRACK_DEF);
const st = track.sample(150);
const car = () => Object.assign(createCar({ x: st.x, z: st.z, heading: Math.atan2(st.tx, st.tz) + 0.2 }), { speed: 15 });

test("'off' returns the student's input untouched", () => {
  const cur = { throttle: 0.7, brake: 0, steer: 0.3 };
  assert.deepEqual(assistInput(car(), track, cur, 'off'), cur);
});

test("'light' never touches gas or brake, and moves the steering only part of the way", () => {
  const cur = { throttle: 1, brake: 0, steer: 0 };
  const out = assistInput(car(), track, cur, 'light');
  assert.equal(out.throttle, 1); assert.equal(out.brake, 0);
  assert.ok(Math.abs(out.steer) > 0 && Math.abs(out.steer) < 0.4, `${out.steer}`);
});

test('steering continuity: the output changes smoothly as the student turns (no jump at any threshold)', () => {
  const c = car(); let prev = null, maxJump = 0;
  for (let s = -1; s <= 1.0001; s += 0.01) {
    const o = assistInput(c, track, { throttle: 0, brake: 0, steer: s }, 'light').steer;
    if (prev !== null) maxJump = Math.max(maxJump, Math.abs(o - prev));
    prev = o;
  }
  assert.ok(maxJump < 0.03, `max jump ${maxJump}`);
});
