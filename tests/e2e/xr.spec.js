// The game as the headset sees it: Meta's WebXR emulator (IWER, Quest 3) replaces navigator.xr, the student enters
// VR from the boot screen like on the real device (standing or seated, controllers), and we read where the head is and
// what is in front of it. Desktop-mode tests never caught the 2026-11-18 headset failure; these do.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const IWER = fs.readFileSync(path.resolve('node_modules/iwer/build/iwer.min.js'), 'utf8');
const SHOTS = '.superpowers/xr';   // test-results/ is wiped on every run

/** Install the emulated Quest 3 before any page script runs. eyeY = standing (1.65) or seated (1.2) head height. */
async function headset(page, { eyeY = 1.65 } = {}) {
  await page.addInitScript({ content: `${IWER}
    window.__xrd = new IWER.XRDevice(IWER.metaQuest3);
    window.__xrd.installRuntime({ forceInstall: true });
    window.__xrd.stereoEnabled = false;
    window.__xrd.position.set(0, ${eyeY}, 0);` });
}

/** Where the head is (world), which station, riding or not, what the player is looking at. */
function pose(page) {
  return page.evaluate(() => {
    const c = window.__ctx, e = c.engine, T = e.THREE;
    const h = e.headPosition(new T.Vector3()), d = e.camera.getWorldDirection(new T.Vector3());
    return { xr: e.isXR(), head: h.toArray().map(v => +v.toFixed(2)), dir: d.toArray().map(v => +v.toFixed(2)),
      rig: e.rig.position.toArray().map(v => +v.toFixed(2)), station: c.loco.current, following: c.loco.following,
      chapter: c.game.s.chapter, task: c.taskLog?.at(-1) ?? null, intro: c.introPhase ?? null };
  });
}

test.describe('xr:', () => {
  test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

  test('xr: standing student, film skipped → into the driver seat, the steering check in front', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await headset(page, { eyeY: 1.65 });
    await page.goto('/?test&fresh&seed=42');
    await expect(page.locator('#enterVR')).toBeVisible();
    await page.click('#enterVR');
    await page.waitForFunction(() => window.__ctx?.engine.isXR());
    const log = [];
    const snap = async tag => { const p = await pose(page); log.push({ tag, ...p }); await page.screenshot({ path: `${SHOTS}/${tag}.png` }); return p; };
    await page.waitForFunction(() => window.__ctx.introPhase === 'video', null, { timeout: 60_000 });
    await snap('1-film');
    await page.waitForFunction(() => window.__ctx.engine.scene.getObjectByName('skipIntro'), null, { timeout: 20_000 });
    await page.evaluate(() => window.__ctx.input.select(window.__ctx.engine.scene.getObjectByName('skipIntro')));
    await page.waitForFunction(() => window.__ctx.introPhase === 'done');
    await page.waitForTimeout(3000);
    await snap('2-after-skip');
    await page.waitForFunction(() => window.__ctx.taskLog?.at(-1) === 'race_steer_r', null, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const p = await snap('3-race-start');
    const seat = await page.evaluate(() => {
      const c = window.__ctx, T = c.engine.THREE, s = c.drive?.car3d.getObjectByName('seat');
      return s ? s.getWorldPosition(new T.Vector3()).toArray().map(v => +v.toFixed(2)) : null;
    });
    fs.writeFileSync(`${SHOTS}/log.json`, JSON.stringify({ log, seat, errors }, null, 2));
    console.log(JSON.stringify({ log, seat, errors }, null, 2));
    expect(p.task).toBe('race_steer_r');
    expect(p.following).toBe(true);                     // in the driver's seat
    expect(Math.hypot(p.head[0] - seat[0], p.head[2] - seat[2])).toBeLessThan(0.6);
    expect(Math.abs(await eyesDrawnAt(page) - p.head[1])).toBeLessThan(0.05); // ...and the frame is really DRAWN from there
  });

  test('xr: the eyes render where the rig puts the head (no render callback undoes the rig)', async ({ page }) => {
    await headset(page, { eyeY: 1.65 });
    await page.goto('/?test&fresh&seed=42&only=race');
    await page.click('#enterVR');
    await page.waitForFunction(() => window.__ctx?.taskLog?.at(-1) === 'race_steer_r', null, { timeout: 60_000 });
    const head = (await pose(page)).head[1];
    expect(Math.abs(await eyesDrawnAt(page) - head)).toBeLessThan(0.05);
    await page.screenshot({ path: `${SHOTS}/race-start-front.png` });
  });
});

/** Height of the XR eye cameras' matrixWorld right after a rendered frame — what the headset actually draws from. */
function eyesDrawnAt(page) {
  return page.evaluate(() => new Promise(res => {
    const e = window.__ctx.engine;
    const off = e.onAfterRender(() => { off(); res(Math.min(...e.renderer.xr.getCamera().cameras.map(k => k.matrixWorld.elements[13]))); });
  }));
}


// The whole game in the emulated headset (standing student, self-play): a screenshot from the eyes at every new task,
// and where the glowing click target and the task card are relative to the gaze (deg: + = left / up).
test('xr: full game in the headset — every task in view', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await headset(page, { eyeY: 1.65 });
  await page.goto('/?test&auto&fresh&seed=42');
  await page.click('#enterVR');
  await page.waitForFunction(() => window.__ctx?.engine.isXR());
  const report = [];
  let seen = 0;
  for (let t = 0; t < 1500; t++) {
    const st = await page.evaluate(() => ({ n: window.__ctx.taskLog.length, done: !!window.__gameDone }));
    if (st.n > seen) {
      seen = st.n;
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const c = window.__ctx, e = c.engine, T = e.THREE;
        const head = e.headPosition(new T.Vector3()), q = e.headQuaternion(new T.Quaternion());
        const inv = q.clone().invert();
        const ang = o => { const p = o.getWorldPosition(new T.Vector3()).sub(head).applyQuaternion(inv);
          return [+(Math.atan2(-p.x, -p.z) * 57.3).toFixed(0), +(Math.atan2(p.y, Math.hypot(p.x, p.z)) * 57.3).toFixed(0), +p.length().toFixed(1)]; };
        const vis = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
        const targets = []; e.scene.traverse(o => { if (o.name === 'attention' && vis(o)) targets.push([o.parent?.name || '?', ...ang(o)]); });
        const card = e.scene.getObjectByName('taskCard');
        return { task: c.taskLog.at(-1), chapter: c.game.s.chapter, head: head.toArray().map(v => +v.toFixed(1)),
          riding: c.loco.following, view: c.drive?.view?.mode ?? null,
          card: card && vis(card) ? ang(card) : null, targets };
      });
      report.push(r);
      await page.screenshot({ path: `${SHOTS}/full-${String(seen).padStart(2, '0')}-${r.task}.png` });
    }
    if (st.done) break;
    await page.waitForTimeout(300);
  }
  fs.writeFileSync(`${SHOTS}/full.json`, JSON.stringify({ report, errors }, null, 1));
  expect(errors).toEqual([]);
  for (const r of report) for (const [name, yaw, pitch, dist] of r.targets) {
    if (dist < 3) continue;                              // the tower view's boards and cards
    throw new Error(`${r.task}: a glow ${dist} m away (${name}) — glows belong on the card being chosen`);
  }
  for (const r of report) if (r.card && !r.riding) for (const [, yaw, pitch] of r.targets)   // the task card never covers a choice
    expect(Math.abs(r.card[0] - yaw) > 22 || Math.abs(r.card[1] - pitch) > 14, `${r.task}: task card over a target`).toBe(true);
  expect(await page.evaluate(() => window.__gameDone)).toBe(true);
});

// Round 4 (2026-11-19, third headset check): the student drives to the cliff line. The REAL input path (no ?auto): a
// trigger already held when the car starts does not brake; letting go and pressing does. Eye screenshots ≈ 40 m out
// (is the line findable?). Holding Y is the lap's skip.
test('xr: cliff test — a held trigger does not brake, a fresh press does; the line is visible from the seat', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await headset(page, { eyeY: 1.2 });
  await page.goto('/?test&fresh&seed=42&only=cliff');
  await page.click('#enterVR');
  await page.waitForFunction(() => window.__ctx?.engine.isXR());
  await page.evaluate(() => window.__xrd.controllers.right.setButtonValueImmediate('trigger', 1));   // held from the start
  await page.waitForFunction(() => window.__ctx.cliffState?.v > 15, null, { timeout: 300_000 });
  expect(await page.evaluate(() => window.__ctx.cliffState.brakeX)).toBeNull();
  await page.evaluate(() => window.__xrd.controllers.right.setButtonValueImmediate('trigger', 0));
  await page.waitForFunction(() => window.__ctx.cliffState?.x > -42, null, { timeout: 300_000 });
  await page.screenshot({ path: `${SHOTS}/cliff-40m.png` });
  await page.evaluate(() => window.__xrd.controllers.right.setButtonValueImmediate('trigger', 1));
  await page.waitForFunction(() => { const s = window.__ctx.cliffState; return !s || s.brakeX != null; }, null, { timeout: 60_000 });
  const s = await page.evaluate(() => window.__ctx.cliffState && { brakeX: window.__ctx.cliffState.brakeX, phase: window.__ctx.cliffState.phase });
  console.log(JSON.stringify(s));
  expect(s.brakeX).toBeGreaterThan(-45);
  expect(s.brakeX).toBeLessThan(0);
  expect(errors).toEqual([]);
});

test('xr: holding Y on the left controller is the lap skip', async ({ page }) => {
  await headset(page, { eyeY: 1.2 });
  await page.goto('/?test&fresh&fx=drive');
  await page.click('#enterVR');
  await page.waitForFunction(() => window.__ctx?.drive?.view?.mode === 'cockpit' && window.__ctx.engine.isXR(), null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__ctx.drive.input.skipHeld())).toBe(false);
  await page.evaluate(() => window.__xrd.controllers.left.setButtonValueImmediate('y-button', 1));
  await page.waitForFunction(() => window.__ctx.drive.input.skipHeld(), null, { timeout: 20_000 });
});

// The 2026-11-19 headset check: "my hands should sit on the wheel and turn it — that does not happen". The controllers
// ARE the wheel now: tilt the line between them. Real (emulated) controller poses, no ?auto, no setDriver.
const hold = (page, deg, { cy = 1.0, z = -0.35 } = {}) => page.evaluate(([deg, cy, z]) => {
  const a = -deg * Math.PI / 180, r = 0.22, d = window.__xrd.controllers;
  d.left.position.set(-r * Math.cos(a), cy - r * Math.sin(a), z);
  d.right.position.set(r * Math.cos(a), cy + r * Math.sin(a), z);
}, [deg, cy, z]);
const trigger = (page, side, v) => page.evaluate(([side, v]) => window.__xrd.controllers[side].setButtonValueImmediate('trigger', v), [side, v]);
const wheelState = page => page.evaluate(() => {
  const d = window.__ctx.drive, w = d.car3d.getObjectByName('wheel'), h = d.car3d.getObjectByName('driverHands');
  return { steerIn: +d.steerIn.toFixed(2), carSteer: +d.car.steer.toFixed(2), speed: +d.car.speed.toFixed(1),
    wheelZ: +w.rotation.z.toFixed(2), hands: !!h?.visible, view: d.view.mode, task: window.__ctx.taskLog?.at(-1) ?? null };
});

test('xr: the controllers are the steering wheel — tilt right steers right, the gloves turn, triggers drive', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await headset(page, { eyeY: 1.2 });                                   // seated
  await page.goto('/?test&fresh&fx=drive');
  await page.click('#enterVR');
  await page.waitForFunction(() => window.__ctx?.drive?.view?.mode === 'cockpit' && window.__ctx.engine.isXR(), null, { timeout: 60_000 });
  await hold(page, 0);
  await page.waitForTimeout(600);
  const level = await wheelState(page);
  expect(level.hands).toBe(true);
  expect(Math.abs(level.steerIn)).toBeLessThan(0.05);
  expect(await page.evaluate(() => window.__ctx.drive.view.modes())).toEqual(['cockpit']);   // no tower table any more
  await trigger(page, 'right', 1);
  await page.waitForFunction(() => window.__ctx.drive.car.speed > 6, null, { timeout: 60_000 });
  await hold(page, 40);                                                 // right hand down: clockwise
  await page.waitForTimeout(800);
  const right = await wheelState(page);
  await page.screenshot({ path: `${SHOTS}/wheel-right.png` });
  await hold(page, -40, { cy: 0.75 });                                  // counter-clockwise, hands lower (in the lap)
  await page.waitForTimeout(800);
  const left = await wheelState(page);
  await page.screenshot({ path: `${SHOTS}/wheel-left.png` });
  await trigger(page, 'right', 0); await trigger(page, 'left', 1);
  await hold(page, 0);
  // software GL draws ~1–2 XR frames a second: wait for the effect, not a clock
  await page.waitForFunction(v => window.__ctx.drive.car.speed < v - 3, left.speed, { timeout: 60_000 }).catch(() => {});
  const braked = await wheelState(page);
  console.log(JSON.stringify({ level, right, left, braked }));
  expect(right.steerIn).toBeGreaterThan(0.4);
  expect(right.carSteer).toBeGreaterThan(0.2);                          // the sim's wheels follow
  expect(right.wheelZ).toBeGreaterThan(level.wheelZ + 0.4);             // the drawn wheel (and gloves) turn clockwise
  expect(left.steerIn).toBeLessThan(-0.4);
  expect(left.carSteer).toBeLessThan(-0.2);
  expect(braked.speed).toBeLessThan(left.speed);
  expect(errors).toEqual([]);
});

test('xr: the race starts in the driver\'s seat with a steering check (right, then left), then the lights', async ({ page }) => {
  await headset(page, { eyeY: 1.2 });
  await page.goto('/?test&fresh&seed=42&only=race');
  await page.click('#enterVR');
  await page.waitForFunction(() => window.__ctx?.taskLog?.at(-1) === 'race_steer_r', null, { timeout: 90_000 });
  const s0 = await wheelState(page);
  expect(s0.view).toBe('cockpit');
  expect(await page.evaluate(() => !!window.__ctx.engine.scene.getObjectByName('viewChoice'))).toBe(false);
  expect(Math.abs((await pose(page)).head[1] - await eyesDrawnAt(page))).toBeLessThan(0.05);   // drawn where the rig puts the head
  await page.screenshot({ path: `${SHOTS}/race-steer-check.png` });
  await hold(page, 45);
  await page.waitForFunction(() => window.__ctx.taskLog?.at(-1) === 'race_steer_l', null, { timeout: 30_000 });
  await hold(page, -45);
  await page.waitForFunction(() => window.__ctx.taskLog?.at(-1) === 'race_drill', null, { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/race-lights.png` });
});

test('xr: the race cockpit within the Quest budget (full world, five rivals on the grid, the gloves)', async ({ page }) => {
  test.setTimeout(240_000);
  await headset(page, { eyeY: 1.2 });
  await page.goto('/?test&fresh&seed=42&only=race&world=full');
  await page.click('#enterVR');
  await page.waitForFunction(() => window.__ctx?.taskLog?.at(-1) === 'race_steer_r' && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 200_000 });
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => new Promise(res => {             // a real XR frame, per eye (the guideline's unit)
    const e = window.__ctx.engine, i = e.renderer.info.render;
    const off = e.onAfterRender(() => { off(); const n = e.renderer.xr.getCamera().cameras.length;
      res({ eyes: n, calls: Math.round(i.calls / n), tris: Math.round(i.triangles / n) }); });
  }));
  console.log('BUDGET xr race-cockpit', JSON.stringify(b));
  await page.screenshot({ path: `${SHOTS}/budget-cockpit.png` });
  expect(b.calls).toBeLessThanOrEqual(150);
  expect(b.tris).toBeLessThanOrEqual(400_000);
});

// Round 4: the student drives the strip car in the rain (the big shot), Roni beside them, the line gantry ahead.
test('xr: the big shot cockpit (rain, Roni, the gantry) within the Quest budget', async ({ page }) => {
  test.setTimeout(300_000);
  await headset(page, { eyeY: 1.2 });
  await page.goto('/?test&fresh&seed=42&only=stunt&world=full&auto&animspeed=1');
  await page.click('#enterVR');
  await page.waitForFunction(() => window.__ctx?.cliffState && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 280_000 });
  await page.waitForTimeout(1000);
  const b = await page.evaluate(() => new Promise(res => {
    const e = window.__ctx.engine, i = e.renderer.info.render;
    const off = e.onAfterRender(() => { off(); const n = e.renderer.xr.getCamera().cameras.length;
      res({ eyes: n, calls: Math.round(i.calls / n), tris: Math.round(i.triangles / n) }); });
  }));
  console.log('BUDGET xr stunt-cockpit', JSON.stringify(b));
  await page.screenshot({ path: `${SHOTS}/budget-stunt-cockpit.png` });
  expect(b.calls).toBeLessThanOrEqual(150);
  expect(b.tris).toBeLessThanOrEqual(400_000);
});
