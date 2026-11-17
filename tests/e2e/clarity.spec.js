// "I have no idea what to do" (user, 2026-11-16): every waiting moment names the task, and what to click glows.
//   npx playwright test -g "clarity:"
import { test, expect } from '@playwright/test';

async function boot(page, query) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test' + query);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.ready === true);
  return errors;
}

test('clarity: the whole game names each task in order', async ({ page }) => {
  test.setTimeout(620_000);                                         // the 1.9 km lap made the game longer
  const errors = await boot(page, '&auto&fresh&seed=42');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 600_000 });
  const log = await page.evaluate(() => window.__ctx.taskLog);
  const order = ['race_drill',                                       // desktop: no view choice (straight into the chase camera)
    'race_reaction', 'race_lap', 'belt_choose', 'tyre_q', 'plan_iv', 'plan_sort', 'strip_ride',
    'strip_action', 'strip_read', 'main_pick', 'main_decide', 'graph_pair', 'graph_explain', 'surf_pick', 'surf_rank', 'stunt_react', 'stunt_lamp',
    'road_rain', 'road_auto', 'end'];
  let at = -1;
  for (const id of order) { const i = log.indexOf(id, at + 1); expect(i, `${id} after index ${at} in ${log.join(',')}`).toBeGreaterThan(at); at = i; }
  expect(errors).toEqual([]);
});

test('clarity: on desktop the race opens on the start drill, and the task banner says what to do and which keys', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await boot(page, '&only=race&fresh');
  await page.waitForFunction(() => window.__ctx.taskLog?.includes('race_drill'), null, { timeout: 60_000 });
  await expect(page.locator('#task')).toBeVisible();
  await expect(page.locator('#task')).toContainText('זינוק');
  await expect(page.locator('#task small')).toContainText('W');
  expect(await page.evaluate(() => window.__ctx.taskLog.includes('race_choose'))).toBe(false);
  expect(errors).toEqual([]);
});

test('clarity: in the cockpit the task card sits on the dash face, below the driver\'s line of sight', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await boot(page, '&only=race&ride=on&fresh');
  await page.waitForFunction(() => window.__ctx.drive?.view?.mode === 'cockpit' && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 200_000 });
  await page.evaluate(() => { window.__ctx.engine.isXR = () => true; });          // the card only lives in 3D in the headset
  await page.waitForFunction(() => window.__ctx.task.panel.mesh.parent === window.__ctx.drive.car3d, null, { timeout: 20_000 });
  const r = await page.evaluate(async () => {
    const THREE = await import('three');
    const { drive, task } = window.__ctx;
    const car = drive.car3d, m = task.panel.mesh, eye = car.getObjectByName('seat').position;
    const p = m.geometry.attributes.position, below = [];
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrix);    // car-local
      below.push(Math.atan2(v.y - eye.y, Math.hypot(v.x - eye.x, v.z - eye.z)) * 180 / Math.PI);
    }
    const dashTop = Math.atan2(0.98 - eye.y, 0.41 - eye.z) * 180 / Math.PI;
    return { maxDeg: Math.max(...below), dashTop };
  });
  expect(r.maxDeg, `card top ${r.maxDeg.toFixed(1)}° vs dash top ${r.dashTop.toFixed(1)}°`).toBeLessThan(r.dashTop);
  await page.screenshot({ path: '.superpowers/look/task-dash.png' });
  expect(errors).toEqual([]);
});
