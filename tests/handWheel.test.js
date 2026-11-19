import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handTilt, createHandWheel, HANDWHEEL } from '../src/game/handWheel.js';

// hands held 0.5 m apart, rotated by `deg` clockwise (as the driver sees it) about a centre in front of the chest
const hands = (deg, cx = 0.05, cy = 1.0) => {
  const a = -deg * Math.PI / 180, r = 0.25;
  return [[cx - r * Math.cos(a), cy - r * Math.sin(a), -0.4], [cx + r * Math.cos(a), cy + r * Math.sin(a), -0.4]];
};

test('hands level = straight; a crooked grip (2°) still straight', () => {
  assert.equal(handTilt(...hands(0)), 0);
  assert.equal(handTilt(...hands(2)), 0);
  assert.equal(handTilt(...hands(-2)), 0);
});

test('right hand down (clockwise) steers right (+), left hand down steers left (−), 1:1 past the dead zone', () => {
  const r = handTilt(...hands(30)), l = handTilt(...hands(-30));
  assert.ok(r > 0 && l < 0);
  assert.ok(Math.abs(r - 30 * Math.PI / 180) < 0.06, `${r}`);
  assert.equal(handTilt(...hands(85)), HANDWHEEL.full);
  assert.equal(handTilt(...hands(120)), HANDWHEEL.full);          // turned past a quarter: still full right
  assert.equal(handTilt(...hands(-150)), -HANDWHEEL.full);
});

test('where the hands are does not matter (lap, chest, off to one side), only the tilt', () => {
  const a = handTilt(...hands(25, 0, 0.6)), b = handTilt(...hands(25, 0.3, 1.3));
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('one controller missing or both on top of each other: no reading; the wheel self-centres', () => {
  assert.equal(handTilt(null, [0, 1, 0]), null);
  assert.equal(handTilt([0, 1, 0], [0.05, 1.02, 0]), null);
  const w = createHandWheel();
  for (let i = 0; i < 60; i++) w.update(...hands(40), 1 / 72);
  assert.ok(w.steer > 0.4 && w.active);
  for (let i = 0; i < 72; i++) w.update(null, null, 1 / 72);
  assert.ok(!w.active && Math.abs(w.steer) < 0.03, `${w.steer}`);
});

test('smoothing: follows the hands within a few frames', () => {
  const w = createHandWheel();
  for (let i = 0; i < 10; i++) w.update(...hands(-45), 1 / 72);
  assert.ok(w.angle < -0.6, `${w.angle}`);
});
