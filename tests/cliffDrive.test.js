import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCliffDrive, lineVerdict, CLIFF } from '../src/game/cliffDrive.js';
import { brakingDistance } from '../src/game/model.js';

const run = (d, pressAt, dt = 1 / 72) => {          // press when the front reaches pressAt (null = never)
  for (let i = 0; i < 72 * 60; i++) {
    const s = d.step(dt, pressAt != null && d.state.x >= pressAt);
    if (s.phase === 'stopped' || s.phase === 'over') return s;
  }
  return d.state;
};

test('reaches the target speed before the decision zone and holds it', () => {
  const d = createCliffDrive({ kmh: 70, brake: 30, start: -117 });
  while (d.state.x < -50) d.step(1 / 72, false);
  assert.ok(Math.abs(d.state.v - 70 / 3.6) < 1e-6);
});

test('pressing at the right point stops on the line (the road decelerates as the model says)', () => {
  const brake = brakingDistance(70, 'dry');
  const d = createCliffDrive({ kmh: 70, brake, start: -117 });
  const s = run(d, d.brakePointFor(0));
  assert.equal(s.phase, 'stopped');
  assert.ok(Math.abs(s.x) < 0.4, `${s.x}`);
  assert.equal(lineVerdict(s.x, false), 'ok');
});

test('a late press goes over the lip; an early one stops short ("parking")', () => {
  const brake = brakingDistance(70, 'wet');
  const late = run(createCliffDrive({ kmh: 70, brake, start: -117 }), -brake + 8);
  assert.equal(late.phase, 'over');
  assert.ok(late.overSpeed > 0);
  assert.equal(lineVerdict(late.x, true), 'cliff');
  const early = run(createCliffDrive({ kmh: 70, brake, start: -117 }), -brake - 10);
  assert.equal(early.phase, 'stopped');
  assert.equal(lineVerdict(early.x, false), 'short');
  const bit = run(createCliffDrive({ kmh: 70, brake, start: -117 }), -brake + 3.5);
  assert.equal(lineVerdict(bit.x, bit.phase === 'over'), 'over');     // past the line, still on the lip
});

test('never pressed: over the edge at full speed', () => {
  const s = run(createCliffDrive({ kmh: 70, brake: 30, start: -117 }), null);
  assert.equal(s.phase, 'over');
  assert.ok(Math.abs(s.overSpeed - 70 / 3.6) < 1e-6);
  assert.ok(s.x >= CLIFF.edge);
});

test('frame rate does not change where it stops', () => {
  const a = run(createCliffDrive({ kmh: 70, brake: 30, start: -117 }), -32, 1 / 90);
  const b = run(createCliffDrive({ kmh: 70, brake: 30, start: -117 }), -32, 1 / 30);
  assert.ok(Math.abs(a.x - b.x) < 0.8, `${a.x} vs ${b.x}`);
});
