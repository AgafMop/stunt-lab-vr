// A NAIVE human on the keyboard (pure Node, no browser) — the driver the race must forgive.
// Unlike the tuned keyboard driver in track.test.js it knows no racing line and no physics:
//   · gas is held down all the time, unless the corner it can see is clearly too tight for its speed (then it lifts,
//     or stamps on the brake when it is very much too fast) — crude, like a casual player,
//   · it looks at the road ≈ 0.4 s ahead and holds A or D fully (bang-bang) while that point is off to one side,
//   · everything it decides reaches the keys ≈ 250 ms late (reaction time),
//   · the keys go through the real keySteerStep + keyAlign (what driveSession does for keyboard input), the car through
//     stepCar + collide + the same surface and rescue rules as driveSession.js (1/120 s steps; far off / stuck / at the
//     rim → put back on the road). opts.trace(t, car, near, input, surface) is called every step (debugging).
import { createCar, stepCar } from '../src/game/carSim.js';
import { keySteerStep, keyAlign } from '../src/game/keySteer.js';
import { respawn, OFFTRACK_RESPAWN_S } from '../src/game/track.js';
import { buildBarriers, collide } from '../src/game/barriers.js';
import { rimX } from '../src/world/terrainFn.js';
import { TRACK_ORIGIN } from '../src/world/layout.js';

export const H = 1 / 120;
const FAR_OFF = 22;               // driveSession.js
const RESPAWN_FADE = 0.55;        // s lost to the fade out/in of a rescue (250 + 300 ms)
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Drive one lap from a standing start at s = from.
 * opts: look (s ahead the driver aims), delay (s reaction), dead (rad: how far off the aim point must be before a key
 * goes down), feel (m/s²: the crude "this corner looks OK at this speed" sideways acceleration), wet ('real' | 'dry':
 * 'dry' paints the wet corner dry), wetPace (m/s the driver slows to on the wet patch it sees; null = ignores it),
 * maxT (s give-up time), from (start s), v0 (start speed), u0 (m, start offset; > 0 = left of the centreline), yaw0 (rad,
 * start heading off the road; > 0 = pointing left), distance (m to drive; default one lap).
 */
export function naiveLap(track, opts = {}) {
  const { look = 0.4, delay = 0.25, dead = 0.035, feel = 10, wet = 'dry', wetPace = null, maxT = 300, from = 0, v0 = 0, u0 = 0, yaw0 = 0, distance = track.length } = opts;
  const walls = buildBarriers(track, TRACK_ORIGIN);
  const st = track.sample(from);
  const car = createCar({ x: st.x + st.tz * u0, z: st.z - st.tx * u0, heading: Math.atan2(st.tx, st.tz) + yaw0 }); car.speed = v0;
  const [w0, w1] = track.def.wet, half = track.def.width / 2;
  const q = [];                    // delayed decisions [t, steerWant, throttle, brake]
  let keySteer = 0, t = 0, stuck = 0, lastS = from, progress = 0;
  let inWall = false;
  const log = { lapTime: null, hits: 0, maxHit: 0, sand: 0, sliding: 0, respawns: [], wetEntry: null, wetExitToSand: false, maxSlip: 0, maxOff: 0 };
  let near = track.nearest(car.x, car.z), prevSurf = 'dry';

  const isWet = s => { const u = ((s % track.length) + track.length) % track.length; return u >= w0 && u <= w1; };

  for (; t < maxT; t += H) {
    // ---- perceive + decide (what the player sees now; acted on `delay` later) ----
    const v = Math.max(0, car.speed);
    const L = Math.max(6, v * look);
    const p = track.sample(near.s + L);
    const a = wrapA(Math.atan2(p.x - car.x, p.z - car.z) - car.heading);       // > 0 = the road is to the left
    const steerWant = a > dead ? -1 : a < -dead ? 1 : 0;                       // A = −1 (left), D = +1 (right)
    let kMax = 0;
    for (let d = 0; d <= Math.max(30, v * 2.5); d += 3) kMax = Math.max(kMax, Math.abs(track.sample(near.s + d).k));
    let vOk = kMax > 1e-4 ? Math.sqrt(feel / kMax) : Infinity;
    if (wetPace != null && wet === 'real') for (let d = 0; d <= Math.max(30, v * 2.5); d += 3) if (isWet(near.s + d)) { vOk = Math.min(vOk, wetPace); break; }
    const brake = v > vOk + 4 ? 1 : 0, throttle = brake || v > vOk ? 0 : 1;
    q.push([t, steerWant, throttle, brake]);
    while (q.length > 1 && q[1][0] <= t - delay) q.shift();
    const [, kw, thr, brk] = q[0][0] <= t - delay ? q[0] : [0, 0, 0, 0];      // nothing pressed during the first reaction

    // ---- the keys and the car, exactly as driveInput + driveSession ----
    keySteer = keySteerStep(keySteer, kw, H, car.speed);
    near = track.nearest(car.x, car.z);
    let surface = near.dist > half ? 'sand' : isWet(near.s) ? 'wet' : 'dry';
    if (surface === 'wet' && wet === 'dry') surface = 'dry';
    if (surface === 'wet' && prevSurf !== 'wet' && log.wetEntry == null) log.wetEntry = car.speed;
    if (surface === 'sand' && prevSurf === 'wet') log.wetExitToSand = true;
    prevSurf = surface;
    const inp = { throttle: thr, brake: brk, steer: keyAlign(car, track, near, keySteer) };
    stepCar(car, inp, H, surface);
    opts.trace?.(t, car, near, inp, surface);
    const hit = collide(car, track, walls, near);
    if (hit > 0 && !inWall) { log.hits++; log.maxHit = Math.max(log.maxHit, hit); }
    else if (hit > 0) log.maxHit = Math.max(log.maxHit, hit);
    inWall = hit > 0;
    if (surface === 'sand') log.sand += H;
    if (Math.abs(car.slip) > 0.02) log.sliding += H;               // past the grip limit (a plain full brake is not a slide)
    log.maxSlip = Math.max(log.maxSlip, Math.abs(car.slip));
    log.maxOff = Math.max(log.maxOff, near.dist);
    stuck = surface === 'sand' && Math.abs(car.speed) < 1.2 ? stuck + H : 0;

    // ---- progress along the loop ----
    let ds = near.s - lastS;
    if (ds < -track.length / 2) ds += track.length; else if (ds > track.length / 2) ds -= track.length;
    progress += ds; lastS = near.s;
    if (progress >= distance) { log.lapTime = t; break; }

    // ---- rescue rules (driveSession.needsRescue) ----
    if (surface === 'sand') {
      const wx = TRACK_ORIGIN.x + car.x, wz = TRACK_ORIGIN.z + car.z;
      const why = near.dist > FAR_OFF ? 'far' : stuck > OFFTRACK_RESPAWN_S ? 'stuck' : wx > rimX(wz) - 6 ? 'rim' : null;
      if (why) {
        log.respawns.push({ s: Math.round(near.s), why, t: +t.toFixed(1) });
        const r = respawn(track, car.x, car.z);
        Object.assign(car, { x: r.x, z: r.z, heading: r.heading, speed: 0, steer: 0, yawRate: 0, slip: 0, offTrack: 0 });
        stuck = 0; keySteer = 0; q.length = 0; t += RESPAWN_FADE;
        near = track.nearest(car.x, car.z);
      }
    }
  }
  log.progress = progress;
  return log;
}

export const fmt = r => `lap ${r.lapTime == null ? `DNF (${r.progress.toFixed(0)} m)` : r.lapTime.toFixed(1) + ' s'} · walls ${r.hits} (max ${r.maxHit.toFixed(1)} m/s) · sand ${r.sand.toFixed(1)} s · respawns ${r.respawns.length}${r.respawns.length ? ' ' + JSON.stringify(r.respawns) : ''} · sliding ${r.sliding.toFixed(1)} s · max off ${r.maxOff.toFixed(1)} m`;
