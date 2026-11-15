import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/state.js';
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

