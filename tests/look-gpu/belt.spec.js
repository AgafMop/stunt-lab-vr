// The crash test on the real GPU, frame by frame (READ .superpowers/look-gpu/<TAG>-crash-*.png).
//   LOOK_RIDE=seat → from the passenger seat; default → the desktop high-speed camera.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
test('look-gpu: crash test', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const ride = process.env.LOOK_RIDE ? `&ride=${process.env.LOOK_RIDE}` : '';
  await page.goto('/?test&world=full&quality=pc&fresh&auto&animspeed=1&mute&only=belt' + ride);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.taskLog?.includes('belt_watch_none'), null, { timeout: 120_000 });
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(450); await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-crash-${String(i).padStart(2, '0')}.png` }); }
  expect(errors).toEqual([]);
});
