// The start lights overlay during the drill (desktop, chase view). READ the image.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
test('look-gpu: start lights overlay', async ({ page }) => {
  test.setTimeout(200_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test&world=full&quality=pc&pcstay&fresh&only=race&auto&animspeed=1');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => (window.__ctx.game.s.reaction?.simple?.length ?? 0) >= 1 && document.querySelectorAll('#startLights .bar i.on').length >= 3, null, { timeout: 150_000, polling: 30 });
  await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-lights.png` });
  expect(errors).toEqual([]);
});
