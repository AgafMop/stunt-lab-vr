// The science of the stunt lab: stopping distance = reaction + braking; braking ∝ v²/μ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  G, MU, kmhToMs, reactionDistance, brakingDistance, stoppingDistance,
  sampleRun, cleanRuns, classifyStart, makeRng, findOutliers,
} from '../src/game/model.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (±${tol})`);

test('constants: g and friction per surface', () => {
  assert.equal(G, 9.8);
  assert.deepEqual(MU, { dry: 0.75, wet: 0.45, sand: 0.35, oil: 0.15 });
  near(kmhToMs(36), 10, 1e-12);
});

test('braking distance on dry asphalt: 50 km/h ≈ 13.1 m, 100 km/h ≈ 52.5 m', () => {
  near(brakingDistance(50), 13.1, 0.1);
  near(brakingDistance(100), 52.5, 0.1);
});

test('double the speed → four times the braking distance', () => {
  for (const v of [30, 40, 60]) near(brakingDistance(2 * v) / brakingDistance(v), 4, 1e-9, `v=${v}`);
});

test('surfaces: dry < wet < sand < oil at 70 km/h', () => {
  const d = s => brakingDistance(70, s);
  assert.ok(d('dry') < d('wet') && d('wet') < d('sand') && d('sand') < d('oil'));
});

test('the final stunt numbers from the spec: 70 km/h, 0.7 s, wet', () => {
  near(reactionDistance(70, 0.7), 13.6, 0.1);
  near(stoppingDistance(70, 0.7, 'wet'), 56.5, 0.3);
});

test('a run: gate speed within ±2 km/h of the target, distance within ±3 % of the model at that speed', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 500; i++) {
    const r = sampleRun(60, 'dry', rng);
    assert.ok(Math.abs(r.kmh - 60) <= 2, `kmh ${r.kmh}`);
    assert.equal(r.kmh, Math.round(r.kmh));
    const truth = brakingDistance(r.kmh);
    assert.ok(Math.abs(r.distance - truth) <= truth * 0.03 + 0.25, `d ${r.distance} vs ${truth}`);
    assert.equal(r.distance * 2, Math.round(r.distance * 2));   // read to 0.5 m
  }
});

test('clean repeats never look like outliers; a sprinkler run is always detected', () => {
  const rng = makeRng(11);
  for (let v = 30; v <= 120; v += 10) {
    const clean = cleanRuns(v, 'dry', rng);
    assert.equal(clean.length, 3);
    assert.deepEqual(findOutliers({ [v]: clean.map(r => r.distance) }), [], `clean at ${v}`);
    const set = [...cleanRuns(v, 'dry', rng, 2), sampleRun(v, 'dry', rng, { sprinkler: true })];
    assert.deepEqual(findOutliers({ [v]: set.map(r => r.distance) }).map(o => o.index), [2], `sprinkler at ${v}`);
  }
});

test('same seed → same runs', () => {
  assert.deepEqual(cleanRuns(50, 'wet', makeRng(7)), cleanRuns(50, 'wet', makeRng(7)));
});

test('start classification: held trigger or anticipation is a false start', () => {
  assert.equal(classifyStart(null, 1000, true).kind, 'false');
  assert.equal(classifyStart(1050, 1000, false).kind, 'false');
  assert.equal(classifyStart(900, 1000, false).kind, 'false');
  assert.deepEqual(classifyStart(1250, 1000, false), { kind: 'ok', reaction: 0.25 });
  assert.equal(classifyStart(null, 1000, false).kind, 'none');
});
