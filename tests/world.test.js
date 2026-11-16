// The terrain keeps the game playable: flat (y = 0) under the strip, the tower and around the whole race track;
// the canyon drops right after the strip end, like in the film; mesas rise far away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, rimX, gridToWorld, GRID } from '../src/world/terrainFn.js';
import { STRIP, TRACK_ORIGIN, RIM_X } from '../src/world/layout.js';
import { TRACK_DEF, buildTrack } from '../src/game/track.js';

test('flat under the strip, the tower and the gate (|h| < 2 cm)', () => {
  for (let x = STRIP.startX - 10; x <= STRIP.endX; x += 2)
    for (const dz of [-8, 0, 8]) assert.ok(Math.abs(heightAt(x, STRIP.z + dz)) < 0.02, `strip ${x}`);
  for (const [x, z] of [[0, 0], [3, 3], [-3, -3]]) assert.ok(Math.abs(heightAt(x, z)) < 0.02, 'tower');
});

test('flat 40 m around every point of the race track (the car runs off into sand for 3 s)', () => {
  const track = buildTrack(TRACK_DEF);
  for (let s = 0; s < track.length; s += 4) {
    const p = track.sample(s);
    for (const [dx, dz] of [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40], [28, 28], [-28, -28], [28, -28], [-28, 28]]) {
      const h = heightAt(TRACK_ORIGIN.x + p.x + dx, TRACK_ORIGIN.z + p.z + dz);
      assert.ok(Math.abs(h) < 0.02, `track s=${s} (${dx},${dz}) h=${h}`);
    }
  }
});

test('the canyon drops right after the strip end, deep enough to look down into', () => {
  assert.ok(Math.abs(rimX(STRIP.z) - RIM_X) < 0.5);
  assert.ok(heightAt(RIM_X + 12, STRIP.z) < -40, `${heightAt(RIM_X + 12, STRIP.z)}`);
  assert.ok(heightAt(RIM_X + 150, STRIP.z) < -110, `${heightAt(RIM_X + 150, STRIP.z)}`);
});

test('the rim only bends away from the play area (never west of x = 100)', () => {
  for (let z = -1500; z <= 1500; z += 10) assert.ok(rimX(z) >= RIM_X - 0.01, `z=${z}`);
});

test('a far canyon wall rises back to the plateau, and mesas stand on the horizon', () => {
  let farTop = -Infinity;
  for (let x = 400; x < 700; x += 5) farTop = Math.max(farTop, heightAt(x, STRIP.z));
  assert.ok(farTop > -5, `${farTop}`);
  let peak = 0;
  for (let x = -3000; x <= 3000; x += 25) for (let z = -3000; z <= 3000; z += 25) peak = Math.max(peak, heightAt(x, z));
  assert.ok(peak > 100, `${peak}`);
});

test('the warped grid is dense near the set (≈ 2–4 m) and reaches the horizon (≥ 3 km)', () => {
  const c = Math.floor(GRID.n / 2);
  const a = gridToWorld(c, c), b = gridToWorld(c + 1, c);
  assert.ok(Math.abs(b.x - a.x) < 4, `${b.x - a.x}`);
  const e = gridToWorld(GRID.n, c);
  assert.ok(e.x - GRID.cx >= 3000);
});

test('scatter: nothing within its clearance of the asphalt, everything sits on the ground', async () => {
  const { scatter, clearance } = await import('../src/world/scatterFn.js');
  const items = scatter();
  const by = k => items.filter(i => i.kind === k).length;
  assert.ok(by('rock') > 500 && by('shrub') > 500 && by('grass') > 500 && by('boulder') > 60, JSON.stringify({ r: by('rock'), s: by('shrub'), g: by('grass'), b: by('boulder') }));
  for (const i of items) {
    assert.ok(clearance(i.x, i.z) >= 9, `${i.kind} at ${i.x.toFixed(1)},${i.z.toFixed(1)}`);
    assert.ok(Math.abs(i.y - heightAt(i.x, i.z)) < 1e-6);
  }
  assert.ok(clearance(0, STRIP.z) <= 0 && clearance(-10, STRIP.z + 30) > 10);
});
