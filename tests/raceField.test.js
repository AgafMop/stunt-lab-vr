import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, TRACK_DEF, speedProfile } from '../src/game/track.js';
import { buildBarriers, collide } from '../src/game/barriers.js';
import { createField, gridSlot, placeOnTrack, PLAYER_SLOT } from '../src/game/raceField.js';
import { contact } from '../src/game/carCollide.js';
import { createCar, stepCar } from '../src/game/carSim.js';
import { autopilot } from '../src/game/autopilot.js';
import { GHOST } from '../src/game/config.js';
import { TRACK_ORIGIN } from '../src/world/layout.js';

const track = buildTrack(TRACK_DEF);
const walls = buildBarriers(track, TRACK_ORIGIN);
const H = 1 / 120;

/** A whole race in Node. player: 'drive' (a decent student on the racing line) or 'parked' (never presses the gas). */
function race(player = 'drive', maxT = 170) {
  const f = createField(track, walls, { ghostPace: GHOST });
  const me = placeOnTrack(track, createCar(), gridSlot(PLAYER_SLOT).s, gridSlot(PLAYER_SLOT).u);
  const pace = speedProfile(track, { margin: 0.68 });
  let progress = 0, lastS = me.near.s, worst = 0, hits = 0, finishT = null;
  f.start();
  for (let t = 0; t < maxT; t += H) {
    const near = me.near = track.nearest(me.x, me.z);
    const surface = near.dist > track.def.width / 2 ? 'sand' : 'dry';
    const inp = player === 'drive' && t > 0.25 ? autopilot(me, track, pace, near) : { brake: 1, park: true };
    stepCar(me, inp, H, surface);
    collide(me, track, walls, near);
    me.near = track.nearest(me.x, me.z);
    hits += f.step(H, me).length;
    let ds = me.near.s - lastS; if (ds < -track.length / 2) ds += track.length; if (ds > track.length / 2) ds -= track.length;
    if (Math.abs(ds) < 20) progress += ds; lastS = me.near.s;
    if (finishT == null && progress >= f.playerFinish) finishT = t;
    const cars = [me, ...f.field.map(r => r.car)];
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) { const c = contact(cars[i], cars[j]); if (c) worst = Math.max(worst, c.depth); }
    if (f.field.every(r => r.finishT != null) && (player === 'parked' || finishT != null)) break;
  }
  return { f, worst, hits, finishT, place: f.place(progress) };
}

test('a full race: every rival laps, nobody is left inside another car, the order follows the pace', () => {
  const { f, worst, finishT, hits } = race('drive'); race.hits = hits;
  const times = Object.fromEntries(f.field.map(r => [r.id, r.finishT && +r.finishT.toFixed(1)]));
  console.log('lap times', times, 'student', finishT?.toFixed(1), 'rescues', f.field.map(r => r.rescues), 'student hits', race.hits);
  for (const r of f.field) assert.ok(r.finishT != null && r.finishT < 140, `${r.id} ${r.finishT}`);
  for (const r of f.field) assert.ok(r.rescues <= 1, `${r.id} rescued ${r.rescues}×`);
  assert.ok(worst < 0.08, `deepest overlap after a step ${worst.toFixed(3)} m`);
  assert.ok(times.red < times.violet, 'the fastest rival beats the slowest');
});

test('a student who stays parked on the grid is driven around, not through (and never blocks the race)', () => {
  const { f, worst } = race('parked');
  for (const r of f.field) assert.ok(r.finishT != null, `${r.id} never finished`);
  assert.ok(worst < 0.08, `overlap ${worst.toFixed(3)}`);
});
