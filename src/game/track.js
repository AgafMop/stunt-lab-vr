// The race track (pure, Node-tested): a ≈ 1.9 km closed circuit on the plateau between the tower and the canyon —
// a long start straight in front of the tower, a fast sweeper, S-bends, a hairpin, a long fast straight, the wet
// corner, a run along the canyon rim with a chicane, and back to the line. Lefts and rights.
// Built from control points (world metres): centripetal Catmull-Rom → resampled every 0.5 m → Gaussian-smoothed
// (no kinks: the tightest radius is the hairpin, ≈ 17 m) → resampled again.
// Same coordinates as carSim.js: ground plane (x, z), heading 0 = +z, a right turn decreases the heading.
// The wet corner (a water truck spilled) comes after the fastest straight: taken calmly it holds; rushed, the car
// understeers into the sand — the race's teaching failure (spec §6 ch. 1).

export const TRACK_DEF = {
  points: [[20, -60], [-150, -60], [-215, -80], [-250, -135], [-262, -205], [-238, -250], [-268, -300], [-240, -350],
    [-280, -395], [-340, -425], [-395, -440], [-425, -485], [-405, -525], [-360, -520], [-250, -560], [-100, -590],
    [0, -600], [70, -590], [105, -550], [115, -470], [110, -400], [92, -360], [112, -325], [95, -290], [85, -220],
    [68, -165], [60, -110], [42, -70]],
  smooth: 14,               // Gaussian sigma (m) of the centreline smoothing
  width: 11,
  wet: [1240, 1365],        // arc-length range of the wet corner (after the long straight; tests check it covers the apex)
  start: [0, -60],          // s = 0 lies on the centreline nearest this point (mid start straight, in front of the tower)
};

export const OFFTRACK_RESPAWN_S = 3;      // seconds stuck or far off the road before the car is put back

const DS = 0.5;

function catmull(P, perSeg = 60) {
  const n = P.length, out = [];
  const d = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]));   // centripetal: no cusps, no self-loops
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const L = (A, B, ta, tb, T) => [0, 1].map(k => ((tb - T) * A[k] + (T - ta) * B[k]) / (tb - ta));
    for (let k = 0; k < perSeg; k++) {
      const T = t1 + (t2 - t1) * (k / perSeg);
      const A1 = L(p0, p1, 0, t1, T), A2 = L(p1, p2, t1, t2, T), A3 = L(p2, p3, t2, t3, T);
      out.push(L(L(A1, A2, 0, t2, T), L(A2, A3, t1, t3, T), t1, t2, T));
    }
  }
  return out;
}

/** Uniform resampling of a closed polyline every `step` metres (exact closure). */
function resample(pts, step) {
  const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) { const a = pts[i - 1], b = pts[i % n]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = cum[n], m = Math.round(total / step), out = [];
  let j = 0;
  for (let k = 0; k < m; k++) {
    const t = (k / m) * total;
    while (cum[j + 1] < t) j++;
    const a = pts[j], b = pts[(j + 1) % n], u = (t - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

function gauss(pts, sigma) {
  const m = pts.length, r = Math.ceil(3 * sigma), w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  return pts.map((_, i) => {
    let x = 0, z = 0, W = 0;
    for (let k = -r; k <= r; k++) { const p = pts[(i + k + m) % m], g = w[k + r]; x += p[0] * g; z += p[1] * g; W += g; }
    return [x / W, z / W];
  });
}

export function buildTrack(def) {
  let pts = resample(catmull(def.points), DS);
  pts = resample(gauss(pts, (def.smooth ?? 14) / DS), DS);
  if (def.start) {                                  // rotate so that s = 0 is the start line
    let bi = 0, bd = Infinity;
    pts.forEach(([x, z], i) => { const d = Math.hypot(x - def.start[0], z - def.start[1]); if (d < bd) { bd = d; bi = i; } });
    pts = pts.slice(bi).concat(pts.slice(0, bi));
  }
  const N = pts.length;
  const xs = new Float64Array(N + 1), zs = new Float64Array(N + 1), hs = new Float64Array(N + 1), ks = new Float64Array(N + 1);
  let len = 0;
  for (let i = 0; i <= N; i++) { xs[i] = pts[i % N][0]; zs[i] = pts[i % N][1]; if (i) len += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); }
  const length = len, ds = length / N;
  // headings from central differences, unwrapped so interpolation never jumps across ±π
  for (let i = 0; i <= N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    hs[i] = Math.atan2(b[0] - a[0], b[1] - a[1]);
    if (i) { while (hs[i] - hs[i - 1] > Math.PI) hs[i] -= 2 * Math.PI; while (hs[i] - hs[i - 1] < -Math.PI) hs[i] += 2 * Math.PI; }
  }
  // signed curvature (1/m; > 0 = left turn, heading increases), over ±4 m
  const W = Math.round(4 / ds);
  for (let i = 0; i <= N; i++) {
    const a = (i - W + N) % N, b = (i + W) % N;
    let dh = Math.atan2(pts[(b + 1) % N][0] - pts[b][0], pts[(b + 1) % N][1] - pts[b][1]) - Math.atan2(pts[(a + 1) % N][0] - pts[a][0], pts[(a + 1) % N][1] - pts[a][1]);
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    ks[i] = dh / (2 * W * ds);
  }

  const wrap = s => { const t = ((s % length) + length) % length; return t; };
  function sample(sq) {
    const t = sq === length ? length : wrap(sq);
    const f = t / ds, i = Math.min(N - 1, Math.floor(f)), k = f - i;
    const h = hs[i] + (hs[i + 1] - hs[i]) * k;
    return { x: xs[i] + (xs[i + 1] - xs[i]) * k, z: zs[i] + (zs[i + 1] - zs[i]) * k, tx: Math.sin(h), tz: Math.cos(h), k: ks[i] + (ks[i + 1] - ks[i]) * k };
  }

  function segNearest(i, px, pz) {
    const ax = xs[i], az = zs[i], bx = xs[i + 1] - ax, bz = zs[i + 1] - az, L2 = bx * bx + bz * bz;
    const u = L2 ? Math.max(0, Math.min(1, ((px - ax) * bx + (pz - az) * bz) / L2)) : 0;
    const dx = ax + bx * u - px, dz = az + bz * u - pz;
    return [dx * dx + dz * dz, (i + u) * ds];
  }
  /** Nearest centreline point: a coarse pass every 4 m over the whole loop, then exact around the best. */
  function nearest(px, pz) {
    const C = 8;
    let best = Infinity, bi = 0;
    for (let i = 0; i < N; i += C) { const dx = xs[i] - px, dz = zs[i] - pz, d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = i; } }
    best = Infinity; let bs = 0;
    for (let j = -C * 2; j <= C * 2; j++) {
      const i = (bi + j + N) % N;
      const [d2, s] = segNearest(i, px, pz);
      if (d2 < best) { best = d2; bs = s; }
    }
    return { s: bs, dist: Math.sqrt(best) };
  }

  /** Corner ranges [s0, s1, sign] where |curvature| > 1/kMinR (sign > 0 = left-hander). */
  function corners(minR = 110) {
    const out = []; let cur = null;
    for (let i = 0; i <= N; i++) {
      const on = Math.abs(ks[i]) > 1 / minR, sg = Math.sign(ks[i]);
      if (on && cur && cur[2] === sg) cur[1] = i * ds;
      else if (on) { cur = [i * ds, i * ds, sg]; out.push(cur); }
      else cur = null;
    }
    return out.filter(c => c[1] - c[0] > 6);
  }

  return { def, length, sample, nearest, corners, points: { xs, zs }, N, ds };
}

export function surfaceAt(track, x, z) {
  const { s, dist } = track.nearest(x, z);
  if (dist > track.def.width / 2) return 'sand';
  const [w0, w1] = track.def.wet;
  return s >= w0 && s <= w1 ? 'wet' : 'dry';
}

/** Back onto the centreline at the nearest point, facing along the track. */
export function respawn(track, x, z) {
  const p = track.sample(track.nearest(x, z).s);
  return { x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz) };
}

/** The fastest sensible speed at every metre (m/s): v ≤ √(margin·μ·g / |k|), reachable with the car's braking and
 *  acceleration (backward/forward passes). Bumper's ghost drives it; the assist and the tests use it. */
export function speedProfile(track, { mu = 0.75, g = 9.8, margin = 0.8, vMax = 25, accel = 4.5, decel = 5.5, wetMu = 0.45 } = {}) {
  const n = Math.ceil(track.length), v = new Float64Array(n + 1);
  const [w0, w1] = track.def.wet;
  for (let i = 0; i <= n; i++) {
    let k = 0; for (let d = -6; d <= 6; d += 2) k = Math.max(k, Math.abs(track.sample(i + d).k));
    const m = i >= w0 && i <= w1 ? wetMu : mu;
    v[i] = Math.min(vMax, k > 1e-4 ? Math.sqrt((margin * m * g) / k) : vMax);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % n] ** 2 + 2 * decel));
    for (let i = 1; i <= n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * accel));
  }
  return s => v[Math.max(0, Math.min(n, Math.round(((s % track.length) + track.length) % track.length)))];
}
