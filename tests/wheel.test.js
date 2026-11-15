// Steering wheel grabbed with one or two controllers: angle from hand positions on the wheel plane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWheelGrip, MAX_WHEEL } from '../src/game/wheel.js';

// driver sits at +z looking toward -z; wheel centre at y = 1; R = 0.18 m
const C = [0, 1, 0], R = 0.18;
const at = deg => { const p = deg * Math.PI / 180; return [C[0] + R * Math.cos(p), C[1] + R * Math.sin(p), 0]; };   // CCW from 3 o'clock, as the driver sees it
const make = () => createWheelGrip({ center: C, normal: [0, 0, 1], up: [0, 1, 0] });
const near = (a, b, t = 0.01) => assert.ok(Math.abs(a - b) <= t, `${a} vs ${b}`);

test('two hands at 9 and 3 o’clock turned 30° clockwise → +0.524 rad (steer right)', () => {
  const w = make();
  w.grab('left', at(180)); w.grab('right', at(0));
  let a = 0;
  for (let d = 0; d <= 30; d += 2) a = w.angle(at(180 - d), at(-d));
  near(a, Math.PI / 6);
});

test('one hand from 12 to 1 o’clock → +0.524 rad', () => {
  const w = make();
  w.grab('right', at(90));
  let a = 0;
  for (let d = 0; d <= 30; d += 2) a = w.angle(null, at(90 - d));
  near(a, Math.PI / 6);
});

test('turning counter-clockwise steers left (negative)', () => {
  const w = make();
  w.grab('left', at(180));
  let a = 0;
  for (let d = 0; d <= 20; d += 2) a = w.angle(at(180 + d), null);
  near(a, -20 * Math.PI / 180);
});

test('released: the wheel eases back toward centre by half within 0.5 s', () => {
  const w = make();
  w.grab('right', at(90));
  let a = 0;
  for (let d = 0; d <= 60; d += 2) a = w.angle(null, at(90 - d));
  w.release('right');
  for (let i = 0; i < 36; i++) a = w.angle(null, null, 1 / 72);
  assert.ok(a <= (Math.PI / 3) * 0.5, `${a}`);
  assert.ok(a > 0);
});

test('clamped at ±2.5 rad even after a 200° turn (no wrap-around)', () => {
  const w = make();
  w.grab('right', at(90));
  let a = 0;
  for (let d = 0; d <= 200; d += 5) a = w.angle(null, at(90 - d));
  assert.equal(MAX_WHEEL, 2.5);
  near(a, 2.5, 1e-9);
});

test('steer input is the angle over the maximum', () => {
  const w = make();
  w.grab('right', at(90));
  for (let d = 0; d <= 30; d += 2) w.angle(null, at(90 - d));
  near(w.steer(), (Math.PI / 6) / 2.5);
});
