import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStripRun } from '../src/game/stripPlan.js';
import { brakingDistance, reactionDistance } from '../src/game/model.js';

const near = (a, b, t = 0.01) => assert.ok(Math.abs(a - b) <= t, `${a} vs ${b}`);

test('without reaction the car brakes at the gate and stops exactly `brake` m later', () => {
  const p = planStripRun({ kmh: 60, brake: 18.5 });
  near(p.frontAt(p.duration), 18.5);
  near(p.frontAt(p.duration + 5), 18.5);
  assert.ok(p.frontAt(0) < -20);
});

test('with a reaction distance it keeps full speed past the gate, then brakes', () => {
  const kmh = 70, tr = 0.7, d_r = reactionDistance(kmh, tr), d_b = brakingDistance(kmh, 'wet');
  const p = planStripRun({ kmh, brake: d_b, react: d_r });
  near(p.stop, d_r + d_b);
  near(p.frontAt(p.duration), d_r + d_b, 0.02);
  // just before the brake point the speed is still v
  let t = 0; while (p.frontAt(t) < d_r - 0.5) t += 0.005;
  near(p.speedAt(t), p.v, 1e-6);
});

test('the run’s own friction matches the surface when brake follows the model', () => {
  near(planStripRun({ kmh: 80, brake: brakingDistance(80, 'oil') }).mu, 0.15, 1e-9);
});

test('beyond an edge: reports when and how fast the front goes over', () => {
  const p = planStripRun({ kmh: 70, brake: 43, react: 13.6, edge: 50 });
  assert.ok(p.over && p.over.speed > 0);
  near(p.frontAt(p.over.t), 50, 0.01);
  assert.equal(planStripRun({ kmh: 70, brake: 30, edge: 50 }).over, null);
});
