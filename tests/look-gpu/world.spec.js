// Fixed viewpoints of the set on the real GPU (tower, strip, pit) + the RC table view. READ the images.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
const VIEWS = [
  ['tower-strip', 'tower', 0, -0.42], ['tower-canyon', 'tower', -1.25, -0.18], ['tower-track', 'tower', 0.4, -0.12],
  ['tower-back', 'tower', 3.0, -0.1], ['pit', 'pit', 0, -0.05],
];
test('look-gpu: world viewpoints', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&nogame&fresh&world=full&quality=pc&pcstay');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.ready === true);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  for (const [name, st, yaw, pitch] of VIEWS) {
    await page.evaluate(async ([st, yaw, pitch]) => { const { loco } = window.__ctx; await loco.goTo(st, { fade: false }); loco.look(yaw, pitch); }, [st, yaw, pitch]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-${name}.png` });
  }
  expect(errors).toEqual([]);
});

