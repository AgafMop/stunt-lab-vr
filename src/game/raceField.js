// The race field (pure, Node-tested): the student + five rival drivers on a starting grid, all of them REAL cars —
// the same carSim physics, the same barriers, and solid against each other (carCollide.js). Nobody is a ghost.
//   grid      — staggered two-by-two behind the start line; the student starts 4th: slower cars ahead to pass, faster
//               ones behind who will come past — a race, not a time trial.
//   drivers   — each rival follows its own racing line (autopilot with a lane offset and its own pace profile), moves
//               over to pass a slower car when the other half of the road is free, and brakes behind it when it is not;
//               side by side it gives room. A rival that ends up stuck in the sand is put back on the road where no car is.
//   standings — progress along the track from each car's own grid slot; finish = back across the start line.
import { createCar, stepCar } from './carSim.js';
import { autopilot } from './autopilot.js';
import { speedProfile } from './track.js';
import { collide } from './barriers.js';
import { resolveCars } from './carCollide.js';

export const GRID = { first: -7, gap: 4.6, lane: 2.6 };
export const PLAYER_SLOT = 3;
export const LANE_MAX = 3.6;                    // |offset| a rival aims for on the 11 m road (barriers stay clear)
// slowest at the front, fastest at the back; bumper drives config GHOST (≈ 94 s)
export const RIVALS = [
  // 2026-11-19 headset check: "the rivals are too easy to beat" — faster corners and harder braking for everyone (a lap
  // of ≈ 90–97 s in the field, was 97–112; a clean student lap is ≈ 86–90 s). vMax above the car's top speed (26 m/s)
  // only keeps the gas down on the straights.
  { id: 'violet', color: 0x8a4fd1, pace: { margin: 0.8, vMax: 27, accel: 4.6, decel: 5.8 }, react: 0.42, lane: 1.2 },
  { id: 'blue',   color: 0x2f6fd6, pace: { margin: 0.88, vMax: 28.5, accel: 5, decel: 6 }, react: 0.35, lane: -1.4 },
  { id: 'bumper', color: 0x3cc4bc, pace: null, react: 0.3, lane: 0.6 },
  { id: 'yellow', color: 0xf2c12e, pace: { margin: 1.04, vMax: 32, accel: 5.8, decel: 6.4 }, react: 0.32, lane: -0.8 },
  { id: 'red',    color: 0xd9342b, pace: { margin: 1.12, vMax: 34, accel: 6.2, decel: 6.8 }, react: 0.28, lane: 1.6 },
];

/** Grid slot k (0 = pole): track position s (m, negative = behind the line) and offset u (m, + = left). */
export function gridSlot(k) { return { s: GRID.first - GRID.gap * k, u: k % 2 === 0 ? GRID.lane : -GRID.lane }; }

const wrap = (d, L) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
const offsetOf = (track, c, near) => { const p = track.sample(near.s); return (c.x - p.x) * p.tz - (c.z - p.z) * p.tx; };

/** Put a car on the track at (s, u) facing along it, parked. */
export function placeOnTrack(track, car, s, u) {
  const p = track.sample(s);
  Object.assign(car, { x: p.x + p.tz * u, z: p.z - p.tx * u, heading: Math.atan2(p.tx, p.tz), speed: 0, steer: 0, yawRate: 0, slip: 0, offTrack: 0 });
  car.near = track.nearest(car.x, car.z);
  return car;
}

/** walls: barriers.buildBarriers(...). ghostPace: config GHOST (bumper's). */
export function createField(track, walls, { ghostPace, rivals = RIVALS, playerSlot = PLAYER_SLOT } = {}) {
  const L = track.length, half = track.def.width / 2;
  const slots = rivals.map((_, i) => i < playerSlot ? i : i + 1);
  const field = rivals.map((r, i) => {
    const { s, u } = gridSlot(slots[i]);
    const car = placeOnTrack(track, createCar(), s, u);
    car.surface = 'dry';
    return { ...r, car, startS: s, progress: 0, lastS: car.near.s, lane: u, finishT: null, stuck: 0, rescues: 0,
      paceFn: speedProfile(track, r.pace ?? ghostPace), cap: Infinity };
  });
  const player = { startS: gridSlot(playerSlot).s, u: gridSlot(playerSlot).u };
  let t = 0, go = false, goT = 0;

  /** What rival `me` does now (the inputs a student would give). others: [{ car }] incl. the student. */
  function drive(me, others, near) {
    const c = me.car, myU = offsetOf(track, c, near);
    let want = Math.max(-LANE_MAX, Math.min(LANE_MAX, me.lane0 ?? (me.lane0 = me.lane)));
    want += 1.1 * Math.cos(near.s / 160 + me.lane);                      // drifts across the road like a driver
    let cap = Infinity, block = null;
    for (const o of others) {
      if (o.car === c) continue;
      const on = o.car.near, ds = wrap(on.s - near.s, L), du = offsetOf(track, o.car, on) - myU;
      if (ds > 0 && ds < 24 && Math.abs(du) < 2.4 && (!block || ds < block.ds)) block = { ds, du, o };
      if (Math.abs(ds) < 5.5 && Math.abs(du) < 2.6) want = myU - Math.sign(du || 1) * 2.8;   // alongside: give room
    }
    if (block && c.speed > block.o.car.speed - 0.5) {
      const ou = myU + block.du;
      const free = u => Math.abs(u) <= LANE_MAX && others.every(o => {
        if (o.car === c) return true;
        const on = o.car.near, ds = wrap(on.s - near.s, L);
        return !(ds > -8 && ds < 18 && Math.abs(offsetOf(track, o.car, on) - u) < 2.2);
      });
      const pass = [ou - 3.2, ou + 3.2].sort((a, b) => Math.abs(a - myU) - Math.abs(b - myU)).find(free);
      if (pass != null) want = pass;
      else if (block.ds < 14) cap = Math.max(0, block.o.car.speed - (block.ds < 8 ? 1.5 : 0.3));   // no room: wait behind
    }
    me.lane += (Math.max(-LANE_MAX, Math.min(LANE_MAX, want)) - me.lane) * 0.02;   // per 1/120 s step ≈ 2.4 /s
    me.cap = cap;
    const target = s => Math.min(me.paceFn(s), cap);
    return autopilot(c, track, target, near, { lane: me.lane });
  }

  function surfaceAt(near) {
    const [w0, w1] = track.def.wet;
    return near.dist > half ? 'sand' : near.s >= w0 && near.s <= w1 ? 'wet' : 'dry';
  }

  function rescue(me, all, ahead = false) {
    const s = me.car.near.s;
    for (const back of ahead ? [20, 30, 45] : [0, -15, -30, 15]) {
      const ss = s + back;
      if (all.every(o => o.car === me.car || Math.hypot(o.car.x - track.sample(ss).x, o.car.z - track.sample(ss).z) > 12)) {
        placeOnTrack(track, me.car, ss, 0); me.car.speed = 6; me.lane = 0; me.stuck = 0; me.rescues++; return;
      }
    }
  }

  return {
    field, player,
    get t() { return t; },
    /** Lights out: the rivals pull away, each after its own reaction time. */
    start() { go = true; goT = t; },
    /**
     * One fixed step h, AFTER the student's car has moved (driveSession.onStep). playerCar: the student's sim car
     * (its .near set). Steps every rival, keeps them off the barriers, then separates every pair of cars.
     * Returns impacts that involve the student: [{ v (m/s), with: rival id }].
     */
    step(h, playerCar) {
      t += h;
      const all = [{ car: playerCar }, ...field];
      for (const me of field) {
        const c = me.car, near = c.near = track.nearest(c.x, c.z);
        const surface = c.surface = surfaceAt(near);
        const inp = !go || t - goT < me.react ? { throttle: 0, brake: 1, steer: 0, park: true } : drive(me, all, near);
        stepCar(c, inp, h, surface);
        collide(c, track, walls, near);
        me.stuck = surface === 'sand' && Math.abs(c.speed) < 1.2 && go ? me.stuck + h : 0;
        if ((me.stuck > 3 || near.dist > 20) && go) rescue(me, all);
        // wedged on the road (a student parked across its line, the faster field has no room to pass): ahead of it
        me.stall = go && t - goT > 3 && Math.abs(c.speed) < 1 ? (me.stall ?? 0) + h : 0;
        if (me.stall > 4) { rescue(me, all, true); me.stall = 0; }
        const ns = c.near.s, ds = wrap(ns - me.lastS, L);
        if (Math.abs(ds) < 20) me.progress += ds;
        me.lastS = ns;
        if (me.finishT == null && me.progress >= L - me.startS) me.finishT = t - goT;
      }
      for (const me of field) me.car.near = track.nearest(me.car.x, me.car.z);
      const hits = resolveCars(all.map(o => o.car));
      return hits.filter(x => x.i === 0).map(x => ({ v: x.v, with: field[x.j - 1].id }));
    },
    /** The rivals' driving for another car — the student's in ?auto self-play (it passes and waits instead of ramming).
     *  me: { car (its .near set), lane, paceFn }. */
    steerFor(me) { return drive(me, [{ car: me.car }, ...field], me.car.near); },
    /** The student's place (1 = leading) given their progress from their own grid slot. */
    place(playerProgress) {
      const mine = playerProgress + player.startS;                       // distance from the start line, comparable
      return 1 + field.filter(r => r.progress + r.startS > mine).length;
    },
    /** Distance the student must cover from their slot to finish one lap at the start line. */
    get playerFinish() { return L - player.startS; },
  };
}
