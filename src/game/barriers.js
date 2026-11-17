// Where the circuit's solid things stand (pure, Node-tested) — shared by the scenery (track3d.js places them) and the
// car (driveSession stops it at them): tyre walls outside the tight corners, the guardrail along the canyon, the banner
// wall and the grandstand at the start, the gantry's legs. Offsets are track-relative: u > 0 is the driver's left.
import { rimX } from '../world/terrainFn.js';

export const BARRIER = { tyres: 16, rail: 4.5, banner: 6, gantry: 1.4, stand: 14, standS: 20, standHalf: 15.5, bannerS: [-110, 90], gantryS: -2 };
export const CAR_HALF = 1.0;          // the car's half width (m) — how close its centre gets to a barrier face

/** Corners tight enough for gravel + tyre walls: [s0, s1, sign] (sign > 0 = left-hander). */
export function tightCorners(track) {
  return track.corners().filter(([a, b]) => { let m = 0; for (let s = a; s <= b; s += 2) m = Math.max(m, Math.abs(track.sample(s).k)); return m > 1 / 45; });
}

/** The side (+1 left / −1 right) of the guardrail at s, or 0 where there is none (the rim is further than 70 m). */
export function railSide(track, s, origin = { x: 0, z: 0 }) {
  const p = track.sample(s), side = p.tz > 0 ? 1 : -1;                   // the side whose offset points east (+x, the canyon)
  const u = side * (track.def.width / 2 + BARRIER.rail), x = origin.x + p.x + p.tz * u, z = origin.z + p.z - p.tx * u;
  return rimX(z) - x > 70 ? 0 : side;
}

/** Barrier lookup: at(s) → { left, right } = the |u| of the nearest solid face on each side (Infinity = open sand). */
export function buildBarriers(track, origin) {
  const half = track.def.width / 2, L = track.length, n = Math.ceil(L);
  const left = new Float32Array(n + 1).fill(Infinity), right = new Float32Array(n + 1).fill(Infinity);
  const put = (s, side, u) => { const i = ((Math.round(s) % n) + n) % n; const a = side > 0 ? left : right; a[i] = Math.min(a[i], u); };
  for (const [a, b, sg] of tightCorners(track)) for (let s = a - 12; s <= b + 22; s++) put(s, -sg, half + BARRIER.tyres - 0.45);
  for (let s = 0; s < L; s++) { const side = railSide(track, s, origin); if (side) put(s, side, half + BARRIER.rail - 0.1); }
  for (let s = BARRIER.bannerS[0]; s <= BARRIER.bannerS[1]; s++) put(s, 1, half + BARRIER.banner - 0.15);
  for (let s = BARRIER.standS - BARRIER.standHalf; s <= BARRIER.standS + BARRIER.standHalf; s++) put(s, -1, half + BARRIER.stand - 0.6);
  for (const side of [1, -1]) put(BARRIER.gantryS, side, half + BARRIER.gantry - 0.2);
  return { at(s) { const i = ((Math.round(s) % n) + n) % n; return { left: left[i], right: right[i] }; } };
}

/** Keep the car off the barriers (mutates): clamp its offset, scrub the speed into the wall, turn it along the wall.
 *  Returns the impact speed (m/s) across the wall, 0 when nothing was hit. */
export function collide(car, track, walls, near) {
  const p = track.sample(near.s), u = (car.x - p.x) * p.tz - (car.z - p.z) * p.tx;
  const w = walls.at(near.s), lim = u > 0 ? w.left - CAR_HALF : w.right - CAR_HALF;
  if (!(Math.abs(u) > lim)) return 0;
  const side = Math.sign(u), back = Math.abs(u) - lim;
  car.x -= p.tz * side * back; car.z += p.tx * side * back;                 // back onto the barrier face
  const th = Math.atan2(p.tx, p.tz);
  let d = Math.atan2(Math.sin(car.heading - th), Math.cos(car.heading - th));
  if (car.speed < 0) d = Math.atan2(Math.sin(d + Math.PI), Math.cos(d + Math.PI));
  const into = Math.abs(car.speed) * Math.abs(Math.sin(d));                // speed across the wall
  car.speed *= Math.max(0.25, Math.abs(Math.cos(d)) * 0.85);               // a glancing hit scrubs, a head-on stops
  if (car.speed >= 0 && Math.abs(d) < Math.PI / 2) car.heading -= d * 0.6;   // slews along the wall
  car.yawRate = 0; car.slip = 0;
  return into;
}
