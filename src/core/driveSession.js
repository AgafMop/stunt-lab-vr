// A drivable car on the race track: sim (fixed step) + input + view + off-track respawn.
// Used by the ?fx=drive sandbox and by the race chapter.
import { createCar, stepCar, createStepper } from '../game/carSim.js';
import { surfaceAt, respawn, OFFTRACK_RESPAWN_S } from '../game/track.js';
import { createDriveInput } from './driveInput.js';
import { createDriveView } from './driveView.js';

const ZERO = { throttle: 0, brake: 0, steer: 0, controllers: false };

export function createDriveSession(ctx, { forced = false } = {}) {
  const { engine, lab } = ctx;
  const track = lab.track;
  const car3d = lab.makeCar(0xf07a1a);
  lab.world.add(car3d);
  const st = track.sample(0);
  const car = createCar({ x: st.x, z: st.z, heading: Math.atan2(st.tx, st.tz) });
  const input = createDriveInput(engine, ctx.input, { car3d });
  const view = createDriveView(ctx, { car3d, forced });
  let running = false, frozen = false, respawning = false, cur = ZERO, driver = null;
  const stepListeners = new Set();

  const stepper = createStepper(h => {
    const surface = surfaceAt(track, car.x, car.z);
    stepCar(car, frozen ? { throttle: 0, brake: 1, steer: 0 } : cur, h, surface);
    car.offTrack = surface === 'sand' ? car.offTrack + h : 0;
    car.surface = surface;
    for (const fn of stepListeners) fn(car, h);
  });

  async function doRespawn() {
    respawning = true;
    await engine.fade(1, 250);
    const r = respawn(track, car.x, car.z);
    Object.assign(car, { x: r.x, z: r.z, heading: r.heading, speed: 0, offTrack: 0 });
    view.update(car, 0);
    await engine.fade(0, 300);
    respawning = false;
  }

  const offFrame = engine.onFrame(dt => {
    if (!running) return;
    cur = driver ? driver(car) : input.read();
    stepper(dt);
    view.update(car, dt);
    if (car.offTrack >= OFFTRACK_RESPAWN_S && !respawning) doRespawn();
  });

  const onKey = e => { if (e.code === 'KeyV' && running) view.toggle(); };
  addEventListener('keydown', onKey);
  let xLatch = false;
  const offX = engine.onFrame(() => {                 // left X button toggles the view in XR
    if (!running) return;
    const left = ctx.input.pointers.find(p => p.handedness === 'left');
    const down = !!left?.source?.gamepad?.buttons?.[4]?.pressed;
    if (down && !xLatch) view.toggle();
    xLatch = down;
  });

  return {
    car, car3d, view, input, track,
    start() { running = true; view.update(car, 0); },
    stop() { running = false; },
    /** Hold the car still (brakes on) — e.g. before the start lights. */
    freeze(v) { frozen = v; },
    /** Replace the student's input by a function car → input (?auto self-play), or null. */
    setDriver(fn) { driver = fn; },
    onStep(fn) { stepListeners.add(fn); return () => stepListeners.delete(fn); },
    placeAt(s) { const p = track.sample(s); Object.assign(car, { x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz), speed: 0, offTrack: 0 }); view.update(car, 0); },
    dispose() {
      running = false; offFrame(); offX(); removeEventListener('keydown', onKey);
      input.dispose(); view.dispose(); lab.world.remove(car3d);
    },
  };
}
