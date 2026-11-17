// Steering assist: a student who just holds the gas (and never steers) never leaves the track at a DRY corner; the wet
// corner stays the lesson — rushed, it still slides into the sand (then the game respawns the car, as here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistInput } from '../src/game/assist.js';
import { createCar, stepCar } from '../src/game/carSim.js';
import { TRACK_DEF, buildTrack, surfaceAt, respawn, OFFTRACK_RESPAWN_S } from '../src/game/track.js';

function lap(cur, seconds = 120) {
  const track = buildTrack(TRACK_DEF), st = track.sample(0);
  const car = createCar({ x: st.x, z: st.z, heading: Math.atan2(st.tx, st.tz) });
  const h = 1 / 120, exits = [];
  let lastS = 0, progress = 0, sand = 0, prev = 'dry';
  for (let i = 0; i < seconds / h && progress < track.length; i++) {
    const surface = surfaceAt(track, car.x, car.z);
    const { s } = track.nearest(car.x, car.z);
    if (surface === 'sand' && prev !== 'sand') exits.push(Math.round(s));
    prev = surface;
    let ds = s - lastS; if (ds < -track.length / 2) ds += track.length; if (Math.abs(ds) < 20) progress += ds; lastS = s;
    stepCar(car, assistInput(car, track, cur), h, surface);
    sand = surface === 'sand' ? sand + h : 0;
    if (sand > OFFTRACK_RESPAWN_S) { Object.assign(car, respawn(track, car.x, car.z), { speed: 0 }); sand = 0; }
  }
  return { exits, progress, length: track.length, wet: TRACK_DEF.wet };
}

test('full gas, no steering: never off the track at a dry corner, and the lap completes', () => {
  const r = lap({ throttle: 1, brake: 0, steer: 0 });
  const dryExits = r.exits.filter(s => s < r.wet[0] - 5 || s > r.wet[1] + 15);
  assert.deepEqual(dryExits, [], `exits at s = ${r.exits.join(', ')}`);
  assert.ok(r.progress >= r.length - 3, `progress ${r.progress.toFixed(0)} / ${r.length.toFixed(0)}`);
});

test('the wet corner is still the lesson: rushed at full gas it slides off', () => {
  const r = lap({ throttle: 1, brake: 0, steer: 0 });
  assert.ok(r.exits.some(s => s >= r.wet[0] - 5 && s <= r.wet[1] + 15), `exits at s = ${r.exits.join(', ')}`);
});
