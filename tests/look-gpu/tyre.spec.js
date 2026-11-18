// The tyre zoom (READ .superpowers/look-gpu/<TAG>-tyre-*.png).
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
test('look-gpu: tyre zoom', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?test&world=full&quality=pc&fresh&auto&animspeed=1&mute&only=belt');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.taskLog?.includes('tyre_watch'), null, { timeout: 200_000 });
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(250); await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-tyre-${i}.png` }); }
});
