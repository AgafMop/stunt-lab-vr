// The desert world's height field (pure, deterministic, Node-tested). Plateau at y = 0 where the game is played,
// a terraced canyon (≈ 130 m deep) right after the strip end, a far canyon wall, mesas and a ridge on the horizon.
// tools/world/gen-terrain.mjs samples it on a warped grid (dense near the set) and bakes sun shadow + sky AO.
import { STRIP, RIM_X } from './layout.js';

// ---- noise ----
function hash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const fade = t => t * t * (3 - 2 * t);
export function vnoise(x, z, seed = 1) {           // value noise in [0, 1]
  const ix = Math.floor(x), iz = Math.floor(z), fx = fade(x - ix), fz = fade(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm(x, z, oct = 4, seed = 1) {      // in [-1, 1]
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * (vnoise(x * f, z * f, seed + i * 17) * 2 - 1); norm += amp; amp *= 0.5; f *= 2.03; }
  return s / norm;
}
const ss = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

// ---- play area: exactly flat (strip, tower, the race track + 40 m of run-off) ----
const PLAY = { x0: -185, z0: -350, z1: 42 };        // east side is cut by the rim
function playDist(x, z) {                            // 0 inside, metres outside (west/north/south sides only)
  const dx = Math.max(PLAY.x0 - x, 0), dz = Math.max(PLAY.z0 - z, z - PLAY.z1, 0);
  return Math.hypot(dx, dz);
}

// ---- canyon ----
/** x of the near rim at z: exactly RIM_X beside the strip; further away it only bends east (side bays, points). */
export function rimX(z) {
  const away = ss(60, 260, Math.abs(z - STRIP.z));
  return RIM_X + away * 75 * (0.5 + 0.5 * fbm(z / 210, 3.7, 3, 11));
}
export function farRimX(z) {                       // bays, buttresses and a few deep side canyons (shadows → depth)
  const bays = 55 * Math.max(0, fbm(z / 130, 4.2, 3, 37)) ** 1.5;
  return 420 + 40 * fbm(z / 240, 9.1, 3, 23) + 22 * fbm(z / 45, 2.3, 2, 29) + bays;
}

// cross-section below a rim, t = metres into the canyon: sheer cliff, talus ledge, second cliff, slopes, floor
function wall(t, z) {
  const w = 1 + 0.18 * fbm(z / 60, t / 40, 2, 31);                     // band widths wander along the canyon
  t = t / w;
  return -52 * ss(0, 7, t) - 9 * ss(7, 38, t) - 42 * ss(40, 51, t) - 16 * ss(51, 105, t) - 9 * ss(105, 175, t);
}

// ---- mesas and buttes (centre x, z, radius, height) ----
const MESAS = [
  [-760, -980, 170, 175], [-1550, -420, 260, 140], [-380, -1700, 120, 235], [-980, 820, 230, 120],
  [-260, 1550, 190, 165], [980, -700, 210, 150], [1480, 520, 340, 125], [760, -1750, 160, 205],
  [1900, -1500, 260, 180], [-2100, 1100, 300, 150], [300, 2100, 260, 140], [-1900, -1900, 280, 200],
];
function mesa(x, z, [mx, mz, r, h]) {
  const dx = x - mx, dz = z - mz, d = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
  const re = r * (1 + 0.22 * fbm(Math.cos(ang) * 2 + mx, Math.sin(ang) * 2 + mz, 3, 41));
  const top = ss(re * 1.06, re * 0.97, d), skirt = ss(re * 1.9, re * 1.02, d);
  return h * (0.72 * top + 0.28 * skirt);                                // strata come from the shader
}

// spires and thin buttes (Monument-Valley-like silhouettes on the horizon): x, z, radius, height
const SPIRES = [
  [-620, -1150, 45, 150], [-540, -1210, 28, 175], [-1250, -760, 60, 140], [-300, -1350, 38, 190], [-1700, -1050, 70, 160],
  [1150, -1150, 50, 170], [1250, -1220, 30, 200], [700, -1350, 55, 150], [-1100, 1300, 60, 150], [1600, -300, 45, 180],
  [-2300, -300, 80, 170], [2200, -900, 70, 190],
];
function spire(x, z, [sx, sz, r, h]) {
  const d = Math.hypot(x - sx, z - sz), ang = Math.atan2(z - sz, x - sx);
  const re = r * (1 + 0.25 * fbm(Math.cos(ang) * 1.5 + sx, Math.sin(ang) * 1.5 + sz, 2, 43));
  return h * (0.85 * ss(re * 1.08, re * 0.92, d) + 0.15 * ss(re * 3.2, re * 1.1, d));
}

const GROUND_E = 60;                                                    // the far side is a high wall facing the tower (lit gold at sunset)

/** Terrain height (m) at world (x, z). */
export function heightAt(x, z) {
  const pd = playDist(x, z);
  const undul = ss(0, 140, pd) * (3.2 * fbm(x / 160, z / 160, 4, 5) + 1.4 * fbm(x / 47, z / 47, 3, 7));
  const r = rimX(z), fr = farRimX(z);
  let h;
  if (x <= r) h = undul;
  else if (x >= fr) h = GROUND_E + undul;
  else {
    const near = wall(x - r, z) + undul * (1 - ss(0, 6, x - r));
    const far = GROUND_E + wall(fr - x, z + 500) * ((GROUND_E + 131) / 131) + undul * (1 - ss(0, 6, fr - x));
    h = Math.max(near, far);
    const cx = (r + fr) / 2 + 28 * Math.sin(z / 170), dc = Math.abs(x - cx);   // river channel
    h -= 4 * (1 - ss(5, 16, dc));
  }
  for (const m of MESAS) { const mh = mesa(x, z, m); if (mh > 0.01) h = Math.max(h, mh + (x > fr ? GROUND_E : 0)); }
  for (const sp of SPIRES) { const sh = spire(x, z, sp); if (sh > 0.01) h = Math.max(h, sh + (x > fr ? GROUND_E : 0)); }
  // a broken ridge closes the horizon so the edge of the world never shows
  const R = Math.hypot(x - GRID.cx, z - GRID.cz);
  if (R > 2000) h = Math.max(h, ss(2000, 2900, R) * (70 + 120 * (0.5 + 0.5 * fbm(x / 420, z / 420, 4, 61))));
  return h;
}

// ---- warped grid: ≈ 2 m cells at the centre, ≈ 55 m at the edge, ±3.2 km ----
export const GRID = { n: 300, cx: 200, cz: -120, S: 3200, a: 0.1, p: 3 };
const warp = u => Math.sign(u) * GRID.S * (GRID.a * Math.abs(u) + (1 - GRID.a) * Math.abs(u) ** GRID.p);
export function gridToWorld(i, j) {
  return { x: GRID.cx + warp((i / GRID.n) * 2 - 1), z: GRID.cz + warp((j / GRID.n) * 2 - 1) };
}
