// The race track (pure, Node-tested): a closed loop of straights and right-hand arcs, sampled every 0.5 m.
// Same coordinates as carSim.js: ground plane (x, z), heading 0 = +z, a right turn decreases the heading.
// The second corner is wet (a water truck spilled): taken calmly (≈ 15 m/s) it holds; rushed (25 m/s) the car
// understeers into the sand — the race's teaching failure (spec §6 ch. 1).

/** Segments: ['S', length] or ['R', radius, degrees]. Closes back on the start (verified by tests). */
export const TRACK_DEF = {
  segments: [['S', 100], ['R', 34, 90], ['S', 40], ['R', 60, 90], ['S', 74], ['R', 34, 90], ['S', 66], ['R', 34, 90]],
  width: 10,
  wet: [183, 298],          // arc-length range around corner 2 (corner 2 spans ≈ 193–288 m)
  start: { s: 0 },
};

export const OFFTRACK_RESPAWN_S = 3;

export function buildTrack(def) {
  const xs = [0], zs = [0], ss = [0], hs = [0];
  let x = 0, z = 0, h = 0, s = 0;
  const push = () => { xs.push(x); zs.push(z); ss.push(s); hs.push(h); };
  for (const [type, a, deg] of def.segments) {
    if (type === 'S') {
      const n = Math.ceil(a / 0.5), ds = a / n;
      for (let i = 0; i < n; i++) { x += Math.sin(h) * ds; z += Math.cos(h) * ds; s += ds; push(); }
    } else {
      const total = deg * Math.PI / 180, len = a * total, n = Math.ceil(len / 0.5), dth = total / n;
      for (let i = 0; i < n; i++) {
        const chord = 2 * a * Math.sin(dth / 2), mid = h - dth / 2;
        x += Math.sin(mid) * chord; z += Math.cos(mid) * chord; h -= dth; s += a * dth; push();
      }
    }
  }
  const length = s, N = xs.length;

  function sample(sq) {
    let t = ((sq % length) + length) % length;
    if (sq === length) t = length;
    let lo = 0, hi = N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= t) lo = m; else hi = m; }
    const k = ss[hi] > ss[lo] ? (t - ss[lo]) / (ss[hi] - ss[lo]) : 0;
    const hh = hs[lo] + (hs[hi] - hs[lo]) * k;
    return { x: xs[lo] + (xs[hi] - xs[lo]) * k, z: zs[lo] + (zs[hi] - zs[lo]) * k, tx: Math.sin(hh), tz: Math.cos(hh) };
  }

  function nearest(px, pz) {
    let best = Infinity, bs = 0;
    for (let i = 0; i < N - 1; i++) {
      const ax = xs[i], az = zs[i], bx = xs[i + 1] - ax, bz = zs[i + 1] - az;
      const L2 = bx * bx + bz * bz;
      const u = L2 ? Math.max(0, Math.min(1, ((px - ax) * bx + (pz - az) * bz) / L2)) : 0;
      const dx = ax + bx * u - px, dz = az + bz * u - pz, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bs = ss[i] + (ss[i + 1] - ss[i]) * u; }
    }
    return { s: bs, dist: Math.sqrt(best) };
  }

  return { def, length, sample, nearest, points: { xs, zs } };
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
