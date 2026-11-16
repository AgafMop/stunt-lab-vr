// Samples src/world/terrainFn.js on its warped grid and bakes, per vertex, the low sun's soft shadow and the sky's
// ambient occlusion (horizon-based) — the same SUN_DIR the sky shader draws. Output: assets/world/terrain.bin
//   Float32[(n+1)²] heights · Uint8[(n+1)² × 2] (sun visibility, sky AO)
// Usage: node tools/world/gen-terrain.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { heightAt, gridToWorld, GRID } from '../../src/world/terrainFn.js';
import { SUN_DIR } from '../../src/world/layout.js';

const t0 = Date.now();
const N1 = GRID.n + 1;

// rasters for fast lookups: fine near the set, coarse to the horizon
function raster(cx, cz, half, step) {
  const n = Math.round((2 * half) / step) + 1, a = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) a[j * n + i] = heightAt(cx - half + i * step, cz - half + j * step);
  return { cx, cz, half, step, n, a };
}
const near = raster(GRID.cx, GRID.cz, 700, 2), far = raster(GRID.cx, GRID.cz, 3600, 20);
function lookup(R, x, z) {
  const fx = (x - R.cx + R.half) / R.step, fz = (z - R.cz + R.half) / R.step;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= R.n - 1 || j >= R.n - 1) return null;
  const u = fx - i, v = fz - j, a = R.a, n = R.n;
  return (a[j * n + i] * (1 - u) + a[j * n + i + 1] * u) * (1 - v) + (a[(j + 1) * n + i] * (1 - u) + a[(j + 1) * n + i + 1] * u) * v;
}
const H = (x, z) => lookup(near, x, z) ?? lookup(far, x, z) ?? 0;
console.log(`rasters ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const heights = new Float32Array(N1 * N1), light = new Uint8Array(N1 * N1 * 2);
const [sx, sy, sz] = SUN_DIR, sh = Math.hypot(sx, sz);
const DIRS = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
const AO_STEPS = [3, 6, 12, 24, 48, 96, 192, 384];

for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
  const { x, z } = gridToWorld(i, j);
  const h = heightAt(x, z), k = j * N1 + i;
  heights[k] = h;
  // soft sun shadow: march toward the sun, keep the tightest clearance angle
  let vis = 1, t = 1.5;
  while (t < 4000 && vis > 0.001) {
    const px = x + sx * t, pz = z + sz * t, py = h + 0.4 + sy * t, th = H(px, pz);
    vis = Math.min(vis, Math.max(0, (8 * (py - th)) / t));
    t *= 1.12;
  }
  // sky occlusion: average horizon elevation over 8 directions
  let occ = 0;
  for (const [dx, dz] of DIRS) {
    let maxSin = 0;
    for (const d of AO_STEPS) { const e = H(x + dx * d, z + dz * d) - h; if (e > 0) maxSin = Math.max(maxSin, e / Math.hypot(e, d)); }
    occ += maxSin;
  }
  const ao = 1 - occ / DIRS.length;
  light[k * 2] = Math.round(Math.min(1, vis) * 255);
  light[k * 2 + 1] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
}
void sh;

mkdirSync('assets/world', { recursive: true });
const buf = Buffer.concat([Buffer.from(heights.buffer), Buffer.from(light.buffer)]);
writeFileSync('assets/world/terrain.bin', buf);
console.log(`terrain ${N1}×${N1}: ${(buf.length / 1024).toFixed(0)} KB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
