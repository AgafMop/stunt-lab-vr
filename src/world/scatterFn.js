// Where the desert's rocks, boulders, scrub and dry grass stand (pure, deterministic, Node-tested).
// Nothing on the asphalt or in the cars' run-off; denser near the set (what the student sees), boulders along the rim.
import { heightAt, rimX } from './terrainFn.js';
import { STRIP, TRACK_ORIGIN } from './layout.js';
import { TRACK_DEF, buildTrack } from '../game/track.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const track = buildTrack(TRACK_DEF);

/** Metres from the nearest asphalt (strip or track centreline minus half width); big outside the play area. */
export function clearance(x, z) {
  let d = Infinity;
  const sx = Math.max(STRIP.startX - x, 0, x - STRIP.endX), sz = Math.abs(z - STRIP.z) - STRIP.width / 2;
  d = Math.min(d, Math.hypot(sx, Math.max(sz, 0)));
  if (x > -500 && x < 160 && z > -680 && z < -20) d = Math.min(d, track.nearest(x - TRACK_ORIGIN.x, z - TRACK_ORIGIN.z).dist - TRACK_DEF.width / 2);
  d = Math.min(d, Math.hypot(x, z) - 6);                                   // the tower
  return d;
}

const KINDS = {
  //            count, minR, maxR, clear, scale range
  rock:       [650, 14, 650, 16, 0.35, 1.5],
  boulder:    [140, 20, 900, 30, 2.2, 6.0],
  slab:       [110, 40, 420, 28, 3.0, 8.0],          // flat layered rock shelves, like the film's road side
  shrub:      [620, 10, 500, 12, 0.6, 1.5],
  grass:      [1100, 8, 350, 9, 0.5, 1.2],
};

/** [{ kind, x, y, z, s, rot, v }] — v: variant 0..2. */
export function scatter(seed = 2026) {
  const r = rng(seed), out = [];
  for (const [kind, [count, minR, maxR, clear, s0, s1]] of Object.entries(KINDS)) {
    let tries = 0, n = 0;
    while (n < count && tries++ < count * 30) {
      // density falls with distance from the tower (√ gives more near the centre)
      const ang = r() * Math.PI * 2, rad = minR + (maxR - minR) * r() ** 1.6;
      const x = Math.cos(ang) * rad + (kind === 'boulder' ? 60 : 0), z = Math.sin(ang) * rad - 80;
      if (clearance(x, z) < clear) continue;
      const rim = rimX(z);
      if (x > rim - 1 && kind !== 'boulder') continue;                     // only boulders on the canyon side
      const y = heightAt(x, z);
      if (kind === 'boulder' && x < rim - 40 && r() < 0.65) continue;      // boulders mostly along the rim and below
      const slope = Math.abs(heightAt(x + 1, z) - y) + Math.abs(heightAt(x, z + 1) - y);
      if (slope > (kind === 'boulder' ? 1.2 : 0.5)) continue;
      if (kind === 'slab' && r() < 0.5 && clearance(x, z) > 90) continue;   // shelves cluster near the roads
      out.push({ kind, x, y, z, s: s0 + (s1 - s0) * r() ** 2, rot: r() * Math.PI * 2, v: Math.floor(r() * 3) });
      n++;
    }
  }
  // the roadside of the circuit (what the chase camera sees): denser scrub, grass tufts and rocks 7–45 m off the asphalt
  for (const [kind, count, clear, s0, s1] of [['grass', 1500, 6.5, 0.5, 1.2], ['shrub', 450, 8, 0.6, 1.6], ['rock', 550, 8, 0.3, 1.3], ['slab', 60, 18, 2.5, 6]]) {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 20) {
      const s = r() * track.length, p = track.sample(s), side = r() < 0.5 ? -1 : 1;
      const u = side * (TRACK_DEF.width / 2 + clear + (45 - clear) * r() ** 1.7);
      const x = TRACK_ORIGIN.x + p.x + p.tz * u, z = TRACK_ORIGIN.z + p.z - p.tx * u;
      if (clearance(x, z) < clear || x > rimX(z) - 3) continue;
      const y = heightAt(x, z);
      if (Math.abs(heightAt(x + 1, z) - y) + Math.abs(heightAt(x, z + 1) - y) > 0.5) continue;
      out.push({ kind, x, y, z, s: s0 + (s1 - s0) * r() ** 2, rot: r() * Math.PI * 2, v: Math.floor(r() * 3) });
      n++;
    }
  }
  return out;
}
