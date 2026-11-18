// Frames from the belt (dummy test + tyre zoom) and strip (results board) chapters on the real GPU.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
const OUT = n => `.superpowers/look-gpu/${TAG}-${n}.png`;

async function film(page, q, name, frames, every) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&world=full&quality=pc&fresh&auto&animspeed=1&mute&' + q);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  for (let i = 0; i < frames; i++) { await page.waitForTimeout(every); await page.screenshot({ path: OUT(`${name}-${String(i).padStart(2, '0')}`) }); }
  return errors;
}

test('look-gpu: belt', async ({ page }) => { test.setTimeout(400_000); await film(page, 'only=belt&ride=on', 'belt', 30, 3000); });
test('look-gpu: strip', async ({ page }) => { test.setTimeout(400_000); await film(page, 'only=strip', 'strip', 30, 3000); });
