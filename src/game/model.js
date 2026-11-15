// Science model of the stunt lab (pure, Node-tested). Every number the student sees comes from here.
// stopping distance = reaction distance (v·t_r) + braking distance (v²/(2μg)).

export const G = 9.8;
/** Tyre–road friction coefficient per surface. */
export const MU = { dry: 0.75, wet: 0.45, sand: 0.35, oil: 0.15 };

export const kmhToMs = kmh => kmh / 3.6;
export const reactionDistance = (kmh, tr) => kmhToMs(kmh) * tr;
export const brakingDistance = (kmh, surface = 'dry') => kmhToMs(kmh) ** 2 / (2 * MU[surface] * G);
export const stoppingDistance = (kmh, tr, surface = 'dry') => reactionDistance(kmh, tr) + brakingDistance(kmh, surface);

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


/** Readings far from their condition's median (needs ≥ 3 repeats). Thresholds in metres / fraction of the median. */
export function findOutliers(byX, { abs = 0.75, rel = 0.2 } = {}) {
  const out = [];
  for (const [k, vals] of Object.entries(byX)) {
    if (vals.length < 3) continue;
    const md = median(vals);
    vals.forEach((v, i) => { if (Math.abs(v - md) > Math.max(abs, rel * md)) out.push({ x: Number(k), index: i }); });
  }
  return out;
}

const clamp = (v, a) => Math.max(-a, Math.min(a, v));

/** One test run: the robot driver aims at targetKmh (radar at the gate reads ±1 km/h), then brakes fully.
 *  The distance follows the model at the gate speed, ±3 % noise, read to 0.5 m. The sprinkler run brakes on 'wet'. */
export function sampleRun(targetKmh, surface, rng, { sprinkler = false } = {}) {
  const kmh = Math.round(targetKmh + clamp(0.5 * gauss(rng), 1));
  const d = brakingDistance(kmh, sprinkler ? 'wet' : surface) * (1 + clamp(0.015 * gauss(rng), 0.03));
  return { kmh, distance: Math.round(d * 2) / 2 };
}

/** n runs that agree with each other (rejection-sampled), so no spurious outlier appears unless one is planted. */
export function cleanRuns(targetKmh, surface, rng, n = 3) {
  for (let tries = 0; tries < 50; tries++) {
    const runs = Array.from({ length: n }, () => sampleRun(targetKmh, surface, rng));
    const ds = runs.map(r => r.distance), md = median(ds);
    if (ds.every(d => Math.abs(d - md) <= Math.max(0.5, 0.1 * md))) return runs;
  }
  const d = Math.round(brakingDistance(targetKmh, surface) * 2) / 2;
  return Array.from({ length: n }, () => ({ kmh: targetKmh, distance: d }));
}

/** Start-light drill. pressMs: first trigger press after the lights started (null = none yet); heldAtLightsOut: the
 *  trigger was already down when the lights went out. Anticipating (< 100 ms) counts as a false start. */
export function classifyStart(pressMs, lightsOutMs, heldAtLightsOut) {
  if (heldAtLightsOut) return { kind: 'false', reaction: null };
  if (pressMs == null) return { kind: 'none', reaction: null };
  if (pressMs < lightsOutMs + 100) return { kind: 'false', reaction: null };
  return { kind: 'ok', reaction: Math.round(pressMs - lightsOutMs) / 1000 };
}
