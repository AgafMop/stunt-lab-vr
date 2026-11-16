// Opening-film timeline: cues sit inside their shot and the film, never overlap, and every cue is a short script line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, SHOT_AT, XFADE, DURATION, INTRO_VIDEO, cueAt } from '../src/game/introVideo.js';
import { LINES } from '../src/game/script.js';

test('film is the shots minus the crossfades (≈ 74 s)', () => {
  const sum = SHOTS.reduce((t, s) => t + s.len, 0);
  assert.ok(Math.abs(DURATION - (sum - XFADE * (SHOTS.length - 1))) < 1e-6);
  assert.ok(DURATION > 60 && DURATION < 95, `${DURATION}`);
  assert.equal(SHOT_AT[0], 0);
});

test('cues are in order, do not overlap and end before the film does', () => {
  const cs = INTRO_VIDEO.cues;
  for (let i = 0; i < cs.length; i++) {
    assert.ok(cs[i].at + cs[i].dur <= DURATION, cs[i].id);
    if (i) assert.ok(cs[i].at >= cs[i - 1].at + cs[i - 1].dur, `${cs[i - 1].id} overlaps ${cs[i].id}`);
  }
});

test('every cue is a script line of at most 15 words', () => {
  for (const c of INTRO_VIDEO.cues) {
    assert.ok(LINES[c.id], `missing line ${c.id}`);
    assert.ok(LINES[c.id].text.split(/\s+/).length <= 15, c.id);
  }
});

test('the chair line ends before the clapper snap (8.4 s into the last shot)', () => {
  const last = INTRO_VIDEO.cues.at(-1);
  assert.ok(last.at + last.dur <= SHOT_AT.at(-1) + 8.4);
});

test('cueAt finds the cue showing at a time, and nothing between cues', () => {
  const c = INTRO_VIDEO.cues[0];
  assert.equal(cueAt(c.at + 0.1)?.id, c.id);
  assert.equal(cueAt(0.1), null);
});
