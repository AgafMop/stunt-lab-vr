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
  // software GL draws a few fps and the stepper caps sim time per frame (by design): wait for the speed, not a clock
  await page.waitForFunction(() => window.__ctx.drive.car.speed > 2.2, null, { timeout: 20_000 }).catch(() => {});
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

  await page.keyboard.press('KeyV');                                  // desktop: V switches the driver's seat ↔ the chase camera
  await page.waitForFunction(() => window.__ctx.drive.view.mode === 'chase' && window.__ctx.engine.fadeLevel() === 0);
  const t = await page.evaluate(() => {
    const { engine, drive } = window.__ctx;
    const head = engine.headPosition(), car = drive.car3d.position;
    return { d: Math.hypot(head.x - car.x, head.z - car.z), up: head.y - car.y, controllers: drive.input.read().controllers, calls: engine.renderer.info.render.calls, rx: engine.rig.rotation.x, rz: engine.rig.rotation.z };
  });
  expect(t.d).toBeGreaterThan(5); expect(t.d).toBeLessThan(10);       // behind the car…
  expect(t.up).toBeGreaterThan(2);                                     // …and above it
  expect(Math.abs(t.rx) + Math.abs(t.rz)).toBeLessThan(1e-6);
  expect(t.controllers).toBe(false);
  expect(t.calls).toBeLessThanOrEqual(150);
  await page.screenshot({ path: `${SHOTS}/chase.png` });
  expect(errors).toEqual([]);
});
