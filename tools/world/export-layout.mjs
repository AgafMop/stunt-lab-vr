// Writes src/world/layout.js as JSON for the Blender builds (blender/cache/layout.json) — one source of truth.
// Usage: node tools/world/export-layout.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import * as L from '../../src/world/layout.js';
import { TRACK_DEF, buildTrack } from '../../src/game/track.js';

mkdirSync('blender/cache', { recursive: true });
// track spots the set dresses (world coords): the pit beside the start, the middle of the wet corner
const track = buildTrack(TRACK_DEF), O = L.TRACK_ORIGIN;
const at = s => { const p = track.sample(s); return { x: O.x + p.x, z: O.z + p.z, tx: p.tx, tz: p.tz }; };
const TRACK_SPOTS = { start: at(0), wetMid: at((TRACK_DEF.wet[0] + TRACK_DEF.wet[1]) / 2), half: TRACK_DEF.width / 2 };
writeFileSync('blender/cache/layout.json', JSON.stringify({ ...L, TRACK_SPOTS }, null, 1));
console.log('blender/cache/layout.json', Object.keys(L).join(', '));
