// Car-to-car collisions (pure, Node-tested): every car is a solid box of the real car's size — nobody drives through
// anybody. Runs inside the race's fixed step (1/120 s) after every car has moved:
//   1. overlap test between the two oriented boxes (separating axes),
//   2. push the two cars apart along the contact normal (equal masses: half each) — never left overlapping,
//   3. an impulse along the normal exchanges speed (a rear-end slows the hitter and shoves the car ahead; e < 1: crumple),
//   4. an off-centre hit turns the car (yaw kick from the impulse's torque about the centre).
// The car model (carSim.js) keeps only a speed along its heading, so the impulse is projected back onto it; the sideways
// part goes into the push and the turn — arcade-honest, no ghosts, no pinball.
// Coordinates as carSim: heading 0 = facing +z, forward = (sin h, cos h); a positive yaw turns +z toward +x.

export const CAR_BOX = { halfL: 2.2, halfW: 0.95 };      // the Blender car: 4.48 m × 2.02 m (mirrors) → the body box
export const BUMP = { restitution: 0.25, inertia: (4.4 ** 2 + 1.9 ** 2) / 12, spin: 0.09, maxSpin: 0.35 };

/** The box's centre, unit axes (forward f, right r) and half sizes. */
function box(c) {
  const s = Math.sin(c.heading), k = Math.cos(c.heading);
  return { x: c.x, z: c.z, f: [s, k], r: [k, -s], hl: CAR_BOX.halfL, hw: CAR_BOX.halfW };
}
const corners = b => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, d]) =>
  [b.x + b.f[0] * b.hl * a + b.r[0] * b.hw * d, b.z + b.f[1] * b.hl * a + b.r[1] * b.hw * d]);
const project = (b, ax) => Math.abs(b.f[0] * ax[0] + b.f[1] * ax[1]) * b.hl + Math.abs(b.r[0] * ax[0] + b.r[1] * ax[1]) * b.hw;
const inside = (b, [px, pz], slack = 1e-3) => {
  const dx = px - b.x, dz = pz - b.z;
  return Math.abs(dx * b.f[0] + dz * b.f[1]) <= b.hl + slack && Math.abs(dx * b.r[0] + dz * b.r[1]) <= b.hw + slack;
};

/** Overlap of cars a and b: null, or { nx, nz (unit normal from a to b), depth (m), cx, cz (contact point) }. */
export function contact(a, b) {
  const A = box(a), B = box(b);
  const dx = B.x - A.x, dz = B.z - A.z;
  if (dx * dx + dz * dz > (2 * Math.hypot(CAR_BOX.halfL, CAR_BOX.halfW)) ** 2) return null;
  let best = null;
  for (const ax of [A.f, A.r, B.f, B.r]) {
    const dist = dx * ax[0] + dz * ax[1];
    const depth = project(A, ax) + project(B, ax) - Math.abs(dist);
    if (depth <= 0) return null;                                   // a separating axis: no contact
    if (!best || depth < best.depth) best = { nx: ax[0] * Math.sign(dist || 1), nz: ax[1] * Math.sign(dist || 1), depth };
  }
  // contact point: the corners of each box that lie inside the other (their mean), else halfway between the centres
  const pts = [...corners(A).filter(p => inside(B, p)), ...corners(B).filter(p => inside(A, p))];
  best.cx = pts.length ? pts.reduce((s, p) => s + p[0], 0) / pts.length : (A.x + B.x) / 2;
  best.cz = pts.length ? pts.reduce((s, p) => s + p[1], 0) / pts.length : (A.z + B.z) / 2;
  return best;
}

/** Resolve one pair (mutates both). Returns the closing speed along the normal (m/s; 0 = only a push, no impact). */
export function resolvePair(a, b, c = contact(a, b)) {
  if (!c) return 0;
  const { nx, nz, depth } = c;
  a.x -= nx * depth / 2; a.z -= nz * depth / 2;                    // apart, half each
  b.x += nx * depth / 2; b.z += nz * depth / 2;
  const va = [Math.sin(a.heading) * a.speed, Math.cos(a.heading) * a.speed];
  const vb = [Math.sin(b.heading) * b.speed, Math.cos(b.heading) * b.speed];
  const closing = (vb[0] - va[0]) * nx + (vb[1] - va[1]) * nz;    // < 0: moving into each other
  if (closing >= 0) return 0;
  const j = -(1 + BUMP.restitution) * closing / 2;                 // equal masses
  kick(a, va, -j * nx, -j * nz, c);
  kick(b, vb, j * nx, j * nz, c);
  return -closing;
}

/** Apply impulse (jx, jz) at the contact point to a car moving with velocity v. */
function kick(car, v, jx, jz, c) {
  const nvx = v[0] + jx, nvz = v[1] + jz;
  car.speed = nvx * Math.sin(car.heading) + nvz * Math.cos(car.heading);    // back onto the car's own axis
  const rx = c.cx - car.x, rz = c.cz - car.z;
  const torque = rz * jx - rx * jz;                                          // + turns +z toward +x (as heading)
  const turn = Math.max(-BUMP.maxSpin, Math.min(BUMP.maxSpin, torque / BUMP.inertia * BUMP.spin));
  car.heading += turn;
  car.slip = (car.slip || 0) + turn * 0.5;                                    // the body shows the knock a moment
  car.yawRate = 0;
}

/** All pairs among `cars` (a few passes so a pile-up settles). Returns impacts [{ i, j, v }] with v > 0.5 m/s. */
export function resolveCars(cars, passes = 3) {
  const hits = [];
  for (let p = 0; p < passes; p++) {
    let any = false;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const c = contact(cars[i], cars[j]);
      if (!c) continue;
      any = true;
      const v = resolvePair(cars[i], cars[j], c);
      if (v > 0.5) hits.push({ i, j, v });
    }
    if (!any) break;
  }
  return hits;
}
