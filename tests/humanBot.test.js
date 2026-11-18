// The race must be drivable by a clumsy human on a keyboard (Horizon-Chase feel), without breaking the science.
// The driver is NAIVE (humanBot.js): gas held, A/D fully on or off, aims ≈ 0.4 s ahead, reacts 250 ms late, brakes
// only when a corner looks clearly too tight. It drives through the real keySteerStep + keyAlign + stepCar + collide and
// driveSession's surface and rescue rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naiveLap, fmt } from './humanBot.js';
import { buildTrack, TRACK_DEF } from '../src/game/track.js';
import { WET_RUSH } from '../src/game/config.js';

const track = buildTrack(TRACK_DEF);

// several clumsy drivers, not one tuned one: shorter/longer look, slower/faster reactions, twitchy/lazy keys, timid/bold
const DRIVERS = [{}, { look: 0.3 }, { look: 0.5 }, { delay: 0.2 }, { delay: 0.3 }, { dead: 0.02 }, { dead: 0.06 },
  { feel: 8 }, { feel: 13 }, { look: 0.3, delay: 0.3 }];

test('a naive keyboard driver laps the dry circuit cleanly: no rescue, no wall, no sand, (almost) no sliding', () => {
  for (const d of DRIVERS) {
    const r = naiveLap(track, d), who = `${JSON.stringify(d)} → ${fmt(r)}`;
    assert.ok(r.lapTime != null && r.lapTime < 110, who);
    assert.equal(r.respawns.length, 0, who);
    assert.equal(r.hits, 0, who);
    assert.ok(r.sand < 0.5, who);
    assert.ok(r.maxOff < 5, `stays on the 11 m road: ${who}`);
    assert.ok(r.sliding < 3, `slides only braking into a corner: ${who}`);
  }
});

test('on the real track, a driver who slows for the wet patch also laps cleanly', () => {
  const r = naiveLap(track, { wet: 'real', wetPace: 14 });
  assert.ok(r.lapTime != null && r.respawns.length === 0 && r.hits === 0 && r.sand < 0.5, fmt(r));
});

test(`the wet-corner lesson survives: rushed (> ${WET_RUSH} m/s) it slides wide into the sand, calm it holds`, () => {
  const at = v => naiveLap(track, { wet: 'real', from: TRACK_DEF.wet[0] - 30, v0: v, wetPace: v, feel: 99, distance: 200, maxT: 20 });
  for (const v of [20, 22, 25]) {
    const r = at(v);
    assert.ok(r.wetEntry > WET_RUSH && r.wetExitToSand, `${v} m/s: entry ${r.wetEntry}, ${fmt(r)}`);
  }
  for (const v of [14, 15]) {
    const r = at(v);
    assert.ok(!r.wetExitToSand && r.sand === 0 && r.maxOff < 4, `${v} m/s: ${fmt(r)}`);
  }
});

test('it does not drive itself: hands off the keys, the car runs wide at the first real corner', () => {
  const r = naiveLap(track, { dead: 9, maxT: 150 });                    // never presses A or D
  assert.equal(r.lapTime, null, fmt(r));
  assert.ok(r.sand > 30, fmt(r));
});

test('out in the sand, pointed 45° away at 12 m/s: the driver steers back onto the road without a rescue', () => {
  for (const [s, side] of [[100, 1], [100, -1], [600, 1], [1000, -1]]) {
    const r = naiveLap(track, { from: s, u0: side * 13.5, yaw0: side * Math.PI / 4, v0: 12, distance: 150, maxT: 30 });
    assert.ok(r.lapTime != null && r.respawns.length === 0 && r.sand < 8, `s=${s} side ${side}: ${fmt(r)}`);
  }
});
