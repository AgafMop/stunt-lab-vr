// The crash test's dummy: belted, the car's deceleration barely moves him; unbelted, he keeps going into the airbag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dummyStep, carAt, CRASH } from '../src/chapters/crashModel.js';

function run(belted) {
  const s = { u: 0, du: 0, th: 0, dth: 0, ph: 0, dph: 0 }, peak = { u: 0, th: 0, ph: 0 };
  for (let t = 0; t < 1.2; t += 1 / 600) {
    dummyStep(s, carAt(t).A, 1 / 600, belted);
    for (const k of ['u', 'th', 'ph']) peak[k] = Math.max(peak[k], s[k]);
  }
  return { peak, end: s };
}

test('the car stops within the crush distance at ~10 g', () => {
  const v = CRASH.kmh / 3.6, a = v * v / (2 * CRASH.crush);
  assert.ok(a / 9.8 > 8 && a / 9.8 < 14);
  assert.ok(Math.abs(carAt(v / a).x - CRASH.crush) < 1e-6);
  assert.ok(carAt(2).x < CRASH.crush && carAt(2).x > CRASH.crush - 0.2);    // a small rebound
});

test('belted: held with the car — small slide and lean, a nod', () => {
  const { peak, end } = run(true);
  assert.ok(peak.u < 0.1, `hips ${peak.u}`);
  assert.ok(peak.th < 0.35, `torso ${peak.th}`);
  assert.ok(peak.ph > 0.2 && peak.ph < 0.8, `head ${peak.ph}`);
  assert.ok(Math.abs(end.th) < 0.1 && Math.abs(end.ph) < 0.1, `end ${JSON.stringify(end)}`);   // back upright
});

test('unbelted: keeps going — slides and pitches into the airbag, far more than belted', () => {
  const b = run(true).peak, { peak } = run(false);
  assert.ok(peak.u > 0.15 && peak.th > 0.6, JSON.stringify(peak));
  assert.ok(peak.th > 2 * b.th && peak.u > 2 * b.u, JSON.stringify({ peak, b }));
});
