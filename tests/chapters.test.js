// Pure logic of the later chapters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stuntOutcome, STUNT, doublingPairs } from '../src/game/chapterMath.js';
import { reactionDistance, brakingDistance } from '../src/game/model.js';

const dr = reactionDistance(STUNT.kmh, STUNT.tr), db = brakingDistance(STUNT.kmh, 'wet');

test('stunt: the right lamp (reaction + braking) stops on the line', () => {
  assert.equal(stuntOutcome(Math.round(dr + db), dr, db).kind, 'ok');
  assert.ok(Math.abs(dr - 13.6) < 0.1 && Math.abs(db - 42.9) < 0.2);
});

test('stunt: forgetting the reaction distance sends the car over the cliff', () => {
  assert.equal(stuntOutcome(Math.round(db), dr, db).kind, 'cliff');
});

test('stunt: a lamp too far back stops the car short (parking); just past the line stays on the lip', () => {
  assert.equal(stuntOutcome(Math.round(dr + db) + 8, dr, db).kind, 'short');
  assert.equal(stuntOutcome(Math.round(dr + db) - 4, dr, db).kind, 'over');
});

test('doubling pairs come only from measured speeds', () => {
  assert.deepEqual(doublingPairs([30, 40, 60, 80, 110]), [[30, 60], [40, 80]]);
  assert.deepEqual(doublingPairs([30, 50, 70]), []);
});
