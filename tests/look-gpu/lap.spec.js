// The lap in motion (autopilot, real time), chase view, PC tier on the real GPU. READ the images.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
test('look-gpu: lap in motion', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&world=full&quality=pc&fresh&only=race&auto&animspeed=1&fps' + (process.env.LOOK_Q || ''));
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx.drive?.view?.mode, null, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-lap-start.png` });
  const marks = (process.env.LOOK_MARKS || '120,400,560,820,1290,1560').split(',').map(Number);
  for (const m of marks) {
    await page.waitForFunction(m => (window.__ctx.drive?.car?.near?.s ?? 0) > m && (window.__ctx.drive?.car?.near?.s ?? 0) < m + 200, m, { timeout: 200_000 });
    await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-lap-${m}.png` });
  }
  expect(errors).toEqual([]);
});
