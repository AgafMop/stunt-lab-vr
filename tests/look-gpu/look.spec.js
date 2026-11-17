// Hero shots on the real GPU, PC tier on. READ the images in .superpowers/look-gpu/ (LOOK_TAG prefixes the names).
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
const OUT = n => `.superpowers/look-gpu/${TAG}-${n}.png`;

async function boot(page, q) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&world=full&quality=pc&fresh&' + q);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  return errors;
}

test('look-gpu: race', async ({ page }) => {
  const errors = await boot(page, 'only=race&ride=on');
  await page.waitForFunction(() => window.__ctx.drive?.view?.mode && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 200_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT('drive-view') });
  // free cameras: behind/above the car, a low side shot, the track from high above
  const shots = [
    ['chase', 'back', 7.5, 3.0, -0.22],
    ['side', 'side', 6, 1.2, -0.05],
    ['front', 'front', 7, 1.0, -0.02],
  ];
  for (const [name, where, d, h, pitch] of shots) {
    await page.evaluate(([where, d, h, pitch]) => {
      const { loco, drive } = window.__ctx; const c = drive.car3d;
      const yaw = c.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const off = where === 'back' ? [-fx * d, -fz * d] : where === 'front' ? [fx * d, fz * d] : [fz * d, -fx * d];
      const look = where === 'back' ? yaw + Math.PI : where === 'front' ? yaw : yaw - Math.PI / 2;
      const p = c.position;
      loco.follow(() => ({ pos: { x: p.x + off[0], y: h + 1.2, z: p.z + off[1] }, yaw: look }));
      loco.setPitch(pitch);
    }, [where, d, h, pitch]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT(name) });
  }
  await page.evaluate(() => { const { loco, lab } = window.__ctx; const t = lab.track3d.position; loco.follow(() => ({ pos: { x: t.x - 60, y: 70, z: t.z + 120 }, yaw: 2.4 })); loco.setPitch(-0.55); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT('aerial') });
  expect(errors).toEqual([]);
});
