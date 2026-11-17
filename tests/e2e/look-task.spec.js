// Art review of the clarity UI: the desktop task banner, the 3D task card at its tower home, the glow on the choices.
import { test, expect } from '@playwright/test';
test('look: task card and glow (screenshots)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test&world=full&fresh&only=race&ride=off' + (process.env.LOOK_Q ? '&quality=' + process.env.LOOK_Q : ''));   // the tower view: the 3D card's home
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx.taskLog?.includes('race_drill') && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '.superpowers/look/task-race.png' });
  // the 3D card at its tower home (what the headset shows): look left at it
  await page.evaluate(() => { window.__ctx.engine.isXR = () => true; window.__ctx.loco.look(0.62, -0.15); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/task-card-3d.png' });
});

test('look: the clapper glows at "Action!" (screenshots)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test&world=full&fresh&only=strip&ride=off');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx.taskLog?.includes('strip_pick'), null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { let c; window.__ctx.engine.scene.traverse(o => { if (!c && o.userData.choice) c = o; }); window.__ctx.input.select(c); });
  await page.waitForFunction(() => window.__ctx.taskLog.includes('strip_action'), null, { timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '.superpowers/look/clapper-glow.png' });
});
