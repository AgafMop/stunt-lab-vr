// Fixed viewpoints for art reviews (no assertions on looks — READ the images, side by side with the film frames).
//   npx playwright test -g "look:"      → test-results/look/*.png
import { test, expect } from '@playwright/test';

const VIEWS = [
  // name, station, yaw (rad, 0 = -z, + = left), pitch
  ['tower-strip', 'tower', 0, -0.42],
  ['tower-canyon', 'tower', -1.25, -0.18],
  ['tower-sun', 'tower', 0.75, 0.02],
  ['tower-back', 'tower', 3.0, -0.1],
  ['pit', 'pit', 0, -0.05],
];

test('look: fixed viewpoints of the world', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test&nogame&fresh');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.ready === true);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  for (const [name, st, yaw, pitch] of VIEWS) {
    await page.evaluate(async ([st, yaw, pitch]) => {
      const { loco, engine } = window.__ctx;
      await loco.goTo(st, { fade: false });
      loco.look(yaw, pitch); void engine;
    }, [st, yaw, pitch]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/look/${name}.png` });
  }
  expect(errors).toEqual([]);
});
