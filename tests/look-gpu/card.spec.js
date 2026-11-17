// The reaction card as the student sees it, chase and cockpit (real GPU). READ the images.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
for (const ride of ['chase', 'on']) {
  test(`look-gpu: reaction card (${ride})`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(`/?test&world=full&quality=pc&pcstay&fresh&only=race&auto&ride=${ride}`);
    await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
    await page.click('#enter');
    await page.waitForFunction(() => { const c = window.__ctx; if (c.game.s.flags.reactionExplained) { c.auto = false; return true; } return false; }, null, { timeout: 200_000, polling: 50 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-card-${ride}.png` });
  });
}
