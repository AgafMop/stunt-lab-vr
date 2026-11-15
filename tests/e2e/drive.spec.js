// Drive sandbox (?fx=drive): both views, the toggle, comfort (no roll/pitch), budget, no errors.
import { test, expect } from '@playwright/test';

const SHOTS = 'test-results/shots';

async function boot(page, query) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test' + query);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.drive?.car);
  return errors;
}

test('drive sandbox: both views, toggle, no errors', async ({ page }) => {
  const errors = await boot(page, '&fx=drive&ride=on');
  expect(await page.evaluate(() => window.__ctx.drive.view.mode)).toBe('cockpit');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyW');
  const s = await page.evaluate(() => {
    const { engine, drive } = window.__ctx;
    const head = engine.headPosition(), seat = drive.car3d.getObjectByName('seat').getWorldPosition(head.clone());
    const r = engine.rig.rotation;
    return { speed: drive.car.speed, dSeat: head.distanceTo(seat), rx: r.x, rz: r.z, calls: engine.renderer.info.render.calls };
  });
  expect(s.speed).toBeGreaterThan(2);       // software GL runs at a few fps; the stepper caps sim time per frame (by design)
  expect(s.dSeat).toBeLessThan(0.3);
  expect(Math.abs(s.rx)).toBeLessThan(1e-6);
  expect(Math.abs(s.rz)).toBeLessThan(1e-6);
  expect(s.calls).toBeLessThanOrEqual(150);
  await page.screenshot({ path: `${SHOTS}/cockpit.png` });

  await page.keyboard.press('KeyV');
  await page.waitForFunction(() => window.__ctx.drive.view.mode === 'table' && window.__ctx.engine.fadeLevel() === 0);
  const t = await page.evaluate(() => {
    const { engine, loco, drive } = window.__ctx;
    const head = engine.headPosition(), st = loco.stations.tower.pos;
    return { d: Math.hypot(head.x - st.x, head.z - st.z), controllers: drive.input.read().controllers, calls: engine.renderer.info.render.calls };
  });
  expect(t.d).toBeLessThan(0.3);
  expect(t.controllers).toBe(false);
  expect(t.calls).toBeLessThanOrEqual(150);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  const still = await page.evaluate(() => { const h = window.__ctx.engine.headPosition(), st = window.__ctx.loco.stations.tower.pos; return Math.hypot(h.x - st.x, h.z - st.z); });
  expect(still).toBeLessThan(0.3);            // W drives the car, it doesn't walk the student around the deck
  await page.screenshot({ path: `${SHOTS}/table.png` });
  expect(errors).toEqual([]);
});

test('drive sandbox: ?ride=off forces the tabletop view and V cannot switch it', async ({ page }) => {
  const errors = await boot(page, '&fx=drive&ride=off');
  expect(await page.evaluate(() => window.__ctx.drive.view.mode)).toBe('table');
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__ctx.drive.view.mode)).toBe('table');
  expect(errors).toEqual([]);
});
