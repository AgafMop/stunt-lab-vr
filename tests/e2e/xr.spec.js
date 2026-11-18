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
      chapter: c.game.s.chapter, task: c.task?.current ?? null, intro: c.introPhase ?? null };
  });
}

test.describe('xr:', () => {
  test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

  test('xr: standing student, film skipped → on the tower deck, the view choice in front', async ({ page }) => {
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
    await page.waitForFunction(() => window.__ctx.engine.scene.getObjectByName('viewChoice')?.visible, null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const p = await snap('3-race-start');
    const board = await page.evaluate(() => {
      const c = window.__ctx, T = c.engine.THREE, b = c.engine.scene.getObjectByName('viewChoice');
      return b ? b.getWorldPosition(new T.Vector3()).toArray().map(v => +v.toFixed(2)) : null;
    });
    fs.writeFileSync(`${SHOTS}/log.json`, JSON.stringify({ log, board, errors }, null, 2));
    console.log(JSON.stringify({ log, board, errors }, null, 2));
    expect(p.head[1]).toBeGreaterThan(6.5);             // eyes on the tower deck (deck at 6 m)
    expect(board).not.toBeNull();
    expect(await eyesDrawnAt(page)).toBeGreaterThan(6.5); // ...and the frame is really DRAWN from there
  });

  test('xr: the eyes render where the rig puts the head (no render callback undoes the rig)', async ({ page }) => {
    await headset(page, { eyeY: 1.65 });
    await page.goto('/?test&fresh&seed=42&only=race');
    await page.click('#enterVR');
    await page.waitForFunction(() => window.__ctx?.engine.scene.getObjectByName('viewChoice')?.visible, null, { timeout: 60_000 });
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
