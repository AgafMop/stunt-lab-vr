// Keyboard steering: eased in, springs back faster, a little less lock at speed — never a snap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keySteerStep, KEY } from '../src/game/keySteer.js';

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
