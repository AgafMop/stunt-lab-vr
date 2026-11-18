// The race field on the real GPU, PC tier: the grid during the start lights, the pack pulling away, mid-lap traffic.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
test('look-gpu: rivals on the grid and in traffic', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&world=full&quality=pc&pcstay&fresh&only=race&auto&animspeed=1');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx.field && window.__ctx.drive?.view?.mode, null, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-grid.png` });
  await page.waitForFunction(() => window.__ctx.field.t > 0 && window.__ctx.drive.car.speed > 3, null, { timeout: 200_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-go.png` });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-traffic.png` });
  expect(errors).toEqual([]);
});
