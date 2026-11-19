// Art review of the car and the race world (full world). READ the images in .superpowers/look/.
import { test, expect } from '@playwright/test';
test('look: car, cockpit and race track (screenshots)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test&world=full&fresh&only=race&ride=on');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx.drive?.view?.mode === 'cockpit' && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 200_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/car-cockpit.png' });
  // outside: a car parked on the strip seen from the pit-side ground
  await page.evaluate(async () => {
    const { lab, loco, engine } = window.__ctx;
    const c = lab.makeCar(0xf07a1a); c.position.set(10, 0, -14); c.rotation.y = 2.3; lab.world.add(c);
    window.__ctx.drive.view.dispose(); await loco.goTo('tower', { fade: false });
  });
  await page.evaluate(() => window.__ctx.loco.look(0.0, -0.5));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/car-outside.png' });
  // the track from the pit (corner 1 with kerbs and tyres)
  await page.evaluate(async () => { const { loco } = window.__ctx; loco.lock(false); await loco.goTo('pit', { fade: false }); loco.look(-0.5, -0.12); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/track-pit.png' });
  await page.evaluate(() => window.__ctx.loco.look(2.6, -0.1));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/track-pit-back.png' });
  // fly over the wet corner (look test only): put the rig high above it
  await page.evaluate(() => { window.__ctx.loco.follow(() => ({ pos: { x: 40, y: 22, z: -150, clone() { return this; } }, yaw: 2.6 })); window.__ctx.loco.look(0, -0.5); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/track-wet.png' });
  expect(errors).toEqual([]);
});
