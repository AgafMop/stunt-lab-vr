// Science model: the true response curve + seeded noise. Pure, so node --test can check the science.
// Replace trueResponse() with your experiment's curve (from the real lab's data or a textbook model) and keep the rest.

/** The true measured quantity at condition x. EXAMPLE: catalase O₂ ml/min vs temperature (°C), peak ≈ 40–43°. */
export function trueResponse(x) {
  return 36 * Math.pow(2, (x - 37) / 10) / (1 + Math.exp((x - 48) / 3.2));
}

/** mulberry32 seeded PRNG → () => [0,1). Same seed = same game (tests, ?seed=N). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng) {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One measured value: true response × (1 ± noise), rounded to what the instrument can read. `fault` (0..1) scales it down
 *  for a procedural error (forgot to stir, leak) so the reading is a clear, detectable outlier. */
export function sampleTrial(x, rng, { noise = 0.06, fault = 1, step = 0.5, min = 0, max = 50 } = {}) {
  let v = trueResponse(x) * (1 + noise * gauss(rng)) * fault;
  v = Math.min(max, Math.max(min, v));
  return Math.round(v / step) * step;
}

export function mean(vals) {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function median(vals) {
  const s = [...vals].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Readings far from their condition's median (needs ≥ 3 repeats). */
export function findOutliers(byX, { abs = 3, rel = 0.25 } = {}) {
  const out = [];
  for (const [k, vals] of Object.entries(byX)) {
    if (vals.length < 3) continue;
    const md = median(vals);
    vals.forEach((v, i) => { if (Math.abs(v - md) > Math.max(abs, rel * md)) out.push({ x: Number(k), index: i }); });
  }
  return out;
}

/** The condition with the highest mean. */
export function bestX(byX) {
  let best = null, bm = -Infinity;
  for (const [k, vals] of Object.entries(byX)) { const m = mean(vals); if (m != null && m > bm) { bm = m; best = Number(k); } }
  return best;
}

/** n clean readings at x (rejection-sampled so no spurious outlier appears unless you plant one on purpose). */
export function cleanValues(x, rng, n = 3) {
  for (let tries = 0; tries < 30; tries++) {
    const vals = Array.from({ length: n }, () => sampleTrial(x, rng));
    if (!findOutliers({ [x]: vals }).length) return vals;
  }
  const v = Math.round(trueResponse(x) * 2) / 2;
  return Array(n).fill(v);
}
