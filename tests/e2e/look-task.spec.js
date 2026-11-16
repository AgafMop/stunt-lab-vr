// Art review of the clarity UI: the desktop task banner, the 3D task card at its tower home, the glow on the choices.
import { test, expect } from '@playwright/test';
test('look: task card and glow (screenshots)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test&world=full&fresh&only=race');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  await page.click('#enter');
  await page.waitForFunction(() => !!window.__ctx.engine.scene.getObjectByName('viewChoice') && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '.superpowers/look/task-race.png' });
  // the 3D card at its tower home (what the headset shows): look left at it
  await page.evaluate(() => { window.__ctx.engine.isXR = () => true; window.__ctx.loco.look(0.62, -0.15); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/task-card-3d.png' });
});
