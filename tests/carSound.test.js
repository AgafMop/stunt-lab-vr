// The engine note follows the car (pure parts of carSound.js): revs at a standstill with the gas, climbs through
// each gear and drops at the shift; the tyres squeal past the grip limit, never when cruising or on sand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineRpm, squealLevel } from '../src/core/carSound.js';

test('standing still: idle, and the gas revs it', () => {
  assert.ok(engineRpm(0, 0) < 1000);
  assert.ok(engineRpm(0, 1) > 3000);
});
test('the rpm climbs within a gear and drops at the shift', () => {
  assert.ok(engineRpm(6.5, 1) > engineRpm(3, 1));
  assert.ok(engineRpm(7.2, 1) < engineRpm(6.9, 1) - 1500, 'shift 1 → 2');
  assert.ok(engineRpm(25, 1) < 6800);
});
test('tyres: quiet cruising, loud past the limit, quiet on the sand', () => {
  const base = { speed: 20, surface: 'dry', latG: 0.2, sliding: 0 };
  assert.equal(squealLevel(base, { brake: 0 }), 0);
  assert.ok(squealLevel({ ...base, sliding: 1 }, { brake: 0 }) > 0.9);
  assert.ok(squealLevel({ ...base, latG: 1.22 }, { brake: 0 }) > 0.5, 'near the (arcade) dry limit');
  assert.ok(squealLevel(base, { brake: 1 }) > 0.4, 'a hard brake at speed');
  assert.equal(squealLevel({ ...base, surface: 'sand', sliding: 1 }, { brake: 0 }), 0);
});
