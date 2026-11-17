// The race circuit: ≈ 1.9 km, closed, smooth (no kinks), lefts and rights and a hairpin, on flat play ground away
// from the canyon rim, never crossing itself or the braking strip; one wet corner after the fastest straight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_DEF, buildTrack, surfaceAt, respawn, speedProfile, OFFTRACK_RESPAWN_S } from '../src/game/track.js';
import { createCar, stepCar } from '../src/game/carSim.js';
import { autopilot } from '../src/game/autopilot.js';
import { keySteerStep } from '../src/game/keySteer.js';
import { rimX } from '../src/world/terrainFn.js';
import { STRIP } from '../src/world/layout.js';

const track = buildTrack(TRACK_DEF);
const H = 1 / 120;

test('the loop closes, is about 1.9 km long, and s = 0 is on the start straight in front of the tower', () => {
  const a = track.sample(0), b = track.sample(track.length - 0.01);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.6);
  assert.ok(track.length > 1700 && track.length < 2100, `${track.length}`);
  assert.ok(Math.abs(a.k) < 1 / 200, 'straight at the start');
  assert.ok(Math.abs(a.z + 60) < 5 && Math.abs(a.x) < 10);
});

test('smooth: no radius under 20 m except the hairpin (≥ 15 m); lefts AND rights', () => {
  let minR = Infinity;
  for (let s = 0; s < track.length; s += 1) minR = Math.min(minR, 1 / Math.max(1e-9, Math.abs(track.sample(s).k)));
  assert.ok(minR >= 15, `min radius ${minR}`);
  const c = track.corners();
  assert.ok(c.some(x => x[2] > 0) && c.some(x => x[2] < 0));
  assert.ok(c.length >= 10, `${c.length} corners`);
});

test('the road never comes near itself (except neighbours), the strip, or the canyon rim', () => {
  const pts = []; for (let s = 0; s < track.length; s += 4) pts.push([s, track.sample(s)]);
  for (const [s1, p] of pts) {
    for (const [s2, q] of pts) {
      const along = Math.min(Math.abs(s1 - s2), track.length - Math.abs(s1 - s2));
      if (along < 60) continue;
      assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > TRACK_DEF.width + 8, `legs at s=${s1} and s=${s2} too close`);
    }
    assert.ok(p.x < rimX(p.z) - 25, `s=${s1} too close to the rim`);
    assert.ok(Math.abs(p.z - STRIP.z) > STRIP.width / 2 + TRACK_DEF.width / 2 + 20, `s=${s1} near the strip`);
  }
});

test('nearest() is exact against brute force, also at the hairpin and between close legs', () => {
  for (let s = 0; s < track.length; s += 37) {
    const p = track.sample(s);
    for (const u of [-4, 0, 3]) {
      const x = p.x + p.tz * u, z = p.z - p.tx * u;
      const n = track.nearest(x, z);
      assert.ok(Math.abs(n.dist - Math.abs(u)) < 0.15, `s=${s} u=${u}: dist ${n.dist}`);
    }
  }
});

test('surfaces: centreline dry, 8 m sideways sand, the middle of the wet range wet', () => {
  for (const s of [0, 300, 800, 1500]) {
    const p = track.sample(s);
    assert.ok(track.nearest(p.x, p.z).dist < 0.05);
    const side = { x: p.x + p.tz * 8, z: p.z - p.tx * 8 };
    assert.equal(surfaceAt(track, side.x, side.z), 'sand');
  }
  const mid = track.sample((TRACK_DEF.wet[0] + TRACK_DEF.wet[1]) / 2);
  assert.equal(surfaceAt(track, mid.x, mid.z), 'wet');
  assert.equal(surfaceAt(track, track.sample(10).x, track.sample(10).z), 'dry');
});

test('the wet range covers the whole corner after the long straight', () => {
  const c = track.corners().find(([a, b]) => a < TRACK_DEF.wet[1] && b > TRACK_DEF.wet[0]);
  assert.ok(c, 'a corner in the wet range');
  assert.ok(TRACK_DEF.wet[0] <= c[0] - 10 && TRACK_DEF.wet[1] >= c[1] + 10, `corner ${c[0]}–${c[1]}`);
  // fast approach: at least 300 m without a corner before it
  const prev = track.corners().filter(x => x[1] < c[0]).pop();
  assert.ok(c[0] - prev[1] > 300, `approach ${c[0] - prev[1]} m`);
});

test('respawn from far in the desert lands on the centreline facing along the track', () => {
  const p = track.sample(120);
  const r = respawn(track, p.x + p.tz * 30, p.z - p.tx * 30);
  assert.ok(track.nearest(r.x, r.z).dist < 0.05);
  const q = track.sample(track.nearest(r.x, r.z).s);
  const d = Math.atan2(Math.sin(r.heading - Math.atan2(q.tx, q.tz)), Math.cos(r.heading - Math.atan2(q.tx, q.tz)));
  assert.ok(Math.abs(d) < 0.01, `heading off by ${d}`);
  assert.equal(OFFTRACK_RESPAWN_S, 3);
});

function drive(driver, { from = 0, v0 = 0, seconds = 200 } = {}) {
  const st = track.sample(from);
  const car = createCar({ x: st.x, z: st.z, heading: Math.atan2(st.tx, st.tz) }); car.speed = v0;
  let travelled = 0, px = car.x, pz = car.z, t = 0;
  const exits = [];
  let prev = 'dry', maxLat = 0;
  for (let i = 0; i < seconds / H && travelled < track.length; i++, t += H) {
    const surf = surfaceAt(track, car.x, car.z);
    { const n = track.nearest(car.x, car.z); if (n.s > 20 && n.s < 180) maxLat = Math.max(maxLat, n.dist); }
    if (surf === 'sand' && prev !== 'sand') exits.push(Math.round((from + travelled) % track.length));
    prev = surf;
    stepCar(car, driver(car, t), H, surf);
    travelled += Math.hypot(car.x - px, car.z - pz); px = car.x; pz = car.z;
  }
  return { travelled, exits, t, maxLat };
}

test("Bumper's line (speed profile) completes the lap without touching the sand, in 85–110 s", () => {
  const prof = speedProfile(track);
  const r = drive(car => autopilot(car, track, prof));
  assert.deepEqual(r.exits, []);
  assert.ok(r.travelled >= track.length);
  assert.ok(r.t > 85 && r.t < 110, `lap ${r.t.toFixed(1)} s`);
});

test('a keyboard driver (on/off keys, 150 ms late, through keySteer like driveInput) gets round without assist, steady on the straights', () => {
  const prof = speedProfile(track, { margin: 0.7 });
  const q = []; let keySteer = 0;
  const r = drive((car, t) => {
    const ap = autopilot(car, track, prof, undefined, { look: 2 });   // a human looks far down the road
    const want = Math.abs(ap.steer) > 0.2 ? Math.sign(ap.steer) : 0;
    q.push([t, want, ap.throttle > 0.3 ? 1 : 0, ap.brake > 0.1 ? 1 : 0]);
    while (q.length > 1 && q[1][0] <= t - 0.15) q.shift();
    const [, w, gas, brk] = q[0];
    keySteer = keySteerStep(keySteer, w, H, car.speed);
    return { throttle: gas, brake: brk, steer: keySteer };
  }, { seconds: 260 });
  assert.ok(r.travelled >= track.length, `${r.travelled.toFixed(0)} m`);
  assert.ok(r.exits.length === 0, `exits at ${r.exits.join(', ')}`);
  assert.ok(r.maxLat < 2, `weaves ${r.maxLat.toFixed(2)} m on the start straight`);
});

test('rushing the wet corner at 25 m/s ends in the sand; 15 m/s holds', () => {
  for (const [v, sand] of [[25, true], [15, false]]) {
    const r = drive(car => autopilot(car, track, v), { from: TRACK_DEF.wet[0] - 40, v0: v, seconds: 12 });
    assert.equal(r.exits.length > 0, sand, `${v} m/s exits ${r.exits}`);
  }
});
