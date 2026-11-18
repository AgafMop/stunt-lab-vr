// Link-preview candidates (1200×630, no HUD) → .superpowers/look-gpu/og-*.png; the chosen one becomes assets/og.jpg.
//   npx playwright test -c playwright.gpu.config.js og.spec
import { test, expect } from '@playwright/test';

const hideHud = page => page.addStyleTag({ content: 'body > *:not(canvas){visibility:hidden !important}' });

test('og: the crash, close', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto('/?test&world=full&quality=pc&pcstay&fresh&auto&animspeed=1&mute&only=belt');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.taskLog?.includes('belt_watch_none'), null, { timeout: 120_000 });
  await hideHud(page);
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(400); await page.screenshot({ path: `.superpowers/look-gpu/og-crash-${String(i).padStart(2, '0')}.png` }); }
});

test('og: Bumper and the car', async ({ page }) => {
  test.setTimeout(200_000);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto('/?test&world=full&quality=pc&pcstay&fresh&nogame&mute');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForTimeout(3000);
  await hideHud(page);
  await page.evaluate(() => {
    const ctx = window.__ctx, { lab, loco } = ctx;
    const car = lab.makeCar(0xf07a1a); car.position.set(-20, 0, -14); car.rotation.y = 2.2; lab.world.add(car);
    const b = ctx.bumper; b.removeFromParent(); b.position.set(-17.6, 0, -11.6); b.rotation.y = 0.6; lab.world.add(b);
    b.userData.setMood?.('happy');
    loco.follow(() => ({ pos: { x: -16.15, y: 0.85, z: -9.95 }, yaw: 0.9 })); loco.setPitch(0.0);
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const t = document.createElement('div');
    t.innerHTML = '<b>פעלול אחרון</b><span>מעבדת פיזיקה וירטואלית · מרחק בלימה וחוקי ניוטון</span>';
    t.style.cssText = 'position:fixed;right:44px;top:40px;z-index:99;visibility:visible !important;direction:rtl;font-family:Heebo,sans-serif;color:#fff;text-shadow:0 3px 18px rgba(0,0,0,.55);display:flex;flex-direction:column;gap:4px';
    t.firstChild.style.cssText = 'visibility:visible !important;font-size:78px;font-weight:800;line-height:1;color:#FFB347';
    t.lastChild.style.cssText = 'visibility:visible !important;font-size:27px;font-weight:600';
    document.body.appendChild(t);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.superpowers/look-gpu/og-hero.png' });
});
