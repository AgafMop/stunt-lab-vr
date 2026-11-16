// Art review: Bumper on the tower deck (READ the image in .superpowers/look/).
import { test, expect } from '@playwright/test';
test('look: Bumper on the tower (screenshot)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test&world=full&fresh&nogame');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.ready === true);
  await page.evaluate(() => { window.__ctx.loco.look(-2.0, -0.2); window.__ctx.audio.say('race_reaction1'); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '.superpowers/look/bumper.png' });
  await page.evaluate(() => { window.__ctx.bumper.userData.setMood('dizzy'); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '.superpowers/look/bumper-dizzy.png' });
  expect(errors).toEqual([]);
});
