// A drivable car on the race track: sim (fixed step) + input + view + getting back on the road.
// Used by the ?fx=drive sandbox and by the race chapter.
// Keyboard: the eased key steer (driveInput) + keyAlign (keySteer.js) — the car settles parallel to the road when no
// key is held, so A/D feel like an arcade racer. Controllers (XR) are untouched.
// Sound: engine, tyre squeal, gravel, barrier thuds (carSound.js; ?mute silences it).
// Off the road: sand drags the car down, the student can drive back. The game only puts the car back on the road
// when it is far out (> 22 m), stuck in the sand (no progress for 3 s), or when the student asks (R / B button).
import { createCar, stepCar, createStepper } from '../game/carSim.js';
import { keyAlign } from '../game/keySteer.js';
import { respawn, OFFTRACK_RESPAWN_S } from '../game/track.js';
import { createDriveInput } from './driveInput.js';
import { createDriveView } from './driveView.js';
import { rimX } from '../world/terrainFn.js';
import { buildBarriers, collide } from '../game/barriers.js';
import { createCarSound } from './carSound.js';
import { TRACK_ORIGIN } from '../world/layout.js';

const ZERO = { throttle: 0, brake: 0, steer: 0, controllers: false };
const PARK = { throttle: 0, brake: 1, steer: 0, park: true };
export const FAR_OFF = 22;

/** timeScale/maxSub: ?auto self-play runs the sim faster (more fixed steps per frame), never coarser. */
export function createDriveSession(ctx, { forced = false, timeScale = 1, maxSub = 30 } = {}) {
  const { engine, lab } = ctx;
  const track = lab.track;
  const car3d = lab.makeCar(0xf07a1a);
  lab.world.add(car3d);
  const st = track.sample(0);
  const car = createCar({ x: st.x, z: st.z, heading: Math.atan2(st.tx, st.tz) });
  car.near = track.nearest(car.x, car.z); car.surface = 'dry';
  const input = createDriveInput(engine, ctx.input, { car3d, speed: () => car.speed });
  const view = createDriveView(ctx, { car3d, forced });
  const walls = buildBarriers(track, TRACK_ORIGIN);
  let lastBump = 0, sound = null, lastIn = ZERO;
  let running = false, frozen = false, respawning = false, cur = ZERO, driver = null, stuck = 0, resetAsked = false;
  const stepListeners = new Set();

  const stepper = createStepper(h => {
    const near = car.near = track.nearest(car.x, car.z);
    const [w0, w1] = track.def.wet;
    const surface = near.dist > track.def.width / 2 ? 'sand' : near.s >= w0 && near.s <= w1 ? 'wet' : 'dry';
    const own = cur.keyboard ? { ...cur, steer: keyAlign(car, track, near, cur.steer) } : cur;   // keyboard: arcade heading hold
    const inp = frozen ? PARK : driver ? driver(car, own, near) : own;
    lastIn = frozen ? { throttle: cur.throttle, brake: 0 } : inp;           // parked at the lights the gas still revs the engine
    stepCar(car, inp, h, surface);
    car.surface = surface;
    car.hit = collide(car, track, walls, near);                       // tyre walls, guardrail, gantry, grandstand are solid
    if (car.hit > 2.5 && performance.now() - lastBump > 400) { lastBump = performance.now(); sound?.bump(car.hit); }
    car.offTrack = surface === 'sand' ? car.offTrack + h : 0;
    stuck = surface === 'sand' && Math.abs(car.speed) < 1.2 ? stuck + h : 0;
    for (const fn of stepListeners) fn(car, h);
  }, 1 / 120, maxSub);

  function needsRescue() {
    if (resetAsked) return true;
    if (car.surface !== 'sand') return false;
    const wx = TRACK_ORIGIN.x + car.x, wz = TRACK_ORIGIN.z + car.z;
    return car.near.dist > FAR_OFF || stuck > OFFTRACK_RESPAWN_S || wx > rimX(wz) - 6;
  }

  async function doRespawn() {
    respawning = true; resetAsked = false;
    await engine.fade(1, 250);
    const r = respawn(track, car.x, car.z);
    Object.assign(car, { x: r.x, z: r.z, heading: r.heading, speed: 0, steer: 0, yawRate: 0, slip: 0, offTrack: 0 });
    stuck = 0;
    view.update(car, 0);
    await engine.fade(0, 300);
    respawning = false;
  }

  const offFrame = engine.onFrame(dt => {
    if (!running) return;
    cur = input.read();
    stepper(dt * timeScale);
    view.update(car, dt);
    sound?.update(car, lastIn, dt);
    if (!respawning && needsRescue()) doRespawn();
  });

  const onKey = e => {
    if (!running) return;
    if (e.code === 'KeyV' || e.code === 'KeyC') view.toggle();
    if (e.code === 'KeyR' && !frozen) resetAsked = true;
  };
  addEventListener('keydown', onKey);
  let xLatch = false, bLatch = false;
  const offX = engine.onFrame(() => {                 // XR: left X toggles the view, right B puts the car back on the road
    if (!running) return;
    const left = ctx.input.pointers.find(p => p.handedness === 'left');
    const right = ctx.input.pointers.find(p => p.handedness === 'right');
    const down = !!left?.source?.gamepad?.buttons?.[4]?.pressed;
    if (down && !xLatch) view.toggle();
    xLatch = down;
    const b = !!right?.source?.gamepad?.buttons?.[5]?.pressed;
    if (b && !bLatch && !frozen) resetAsked = true;
    bLatch = b;
  });

  return {
    car, car3d, view, input, track, walls,
    /** A knock from another car (m/s across the contact): the same thud as a barrier, at most every 0.4 s. */
    bump(v) { if (v > 1.5 && performance.now() - lastBump > 400) { lastBump = performance.now(); sound?.bump(v); } },
    start() { running = true; view.update(car, 0); if (!sound && !ctx.params?.has('mute')) sound = createCarSound(ctx.audio); },
    stop() { running = false; sound?.stop(); sound = null; },
    /** Hold the car still (brakes on, no creeping into reverse) — e.g. before the start lights. */
    freeze(v) { frozen = v; },
    /** Replace the student's input by a function (car, studentInput, near) → input, or null. */
    setDriver(fn) { driver = fn; },
    onStep(fn) { stepListeners.add(fn); return () => stepListeners.delete(fn); },
    /** Park the car at track position s, offset u (m, + = left: a grid slot). */
    placeAt(s, u = 0) {
      const p = track.sample(s);
      Object.assign(car, { x: p.x + p.tz * u, z: p.z - p.tx * u, heading: Math.atan2(p.tx, p.tz), speed: 0, steer: 0, yawRate: 0, slip: 0, offTrack: 0 });
      car.near = track.nearest(car.x, car.z);
      view.update(car, 0);
    },
    dispose() {
      running = false; offFrame(); offX(); removeEventListener('keydown', onKey); sound?.stop(); sound = null;
      input.dispose(); view.dispose(); lab.world.remove(car3d);
    },
  };
}
