import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
import { trueResponse, makeRng, sampleTrial, findOutliers, cleanValues, bestX } from '../src/game/model.js';
import { METER, TRIAL_COST, RESERVE } from '../src/game/config.js';

const mem = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))) }; };

test('a trial costs meter; running out is a game over', () => {
  const g = createGame({ seed: 1, storage: mem() });
  let over = 0; g.on('gameover', () => over++);
  g.addTrial(37, { value: 30, by: 'student' });
  assert.equal(g.s.meter, METER.start - TRIAL_COST);
  g.spend(9999);
  assert.equal(over, 1);
});

test('checkpoint restore: back to the chapter start; a second game over refills to the reserve', () => {
  const g = createGame({ seed: 1, storage: mem() });
  g.setChapter('bench');
  for (let k = 0; k < 2; k++) { g.spend(9999); g.restoreCheckpoint(); }
  assert.equal(g.s.over, false);
  assert.ok(g.s.meter >= Math.min(RESERVE, METER.start));
});

test('the science: the true curve peaks between 35 and 50', () => {
  const xs = Array.from({ length: 15 }, (_, i) => 5 + i * 5);
  const best = xs.reduce((a, b) => (trueResponse(b) > trueResponse(a) ? b : a));
  assert.ok(best >= 35 && best <= 50, `peak at ${best}`);
});

test('same seed, same data', () => {
  assert.equal(sampleTrial(37, makeRng(5)), sampleTrial(37, makeRng(5)));
});

test('clean repeats never contain a spurious outlier; a planted fault is detected', () => {
  const rng = makeRng(9);
  for (const x of [10, 30, 40, 60]) assert.deepEqual(findOutliers({ [x]: cleanValues(x, rng) }), []);
  const vals = [...cleanValues(40, rng, 2), sampleTrial(40, rng, { fault: 0.5 })];
  assert.deepEqual(findOutliers({ 40: vals }).map(o => o.index), [2]);
  assert.equal(bestX({ 20: [10, 11, 10.5], 40: [35, 36, 34] }), 40);
});
