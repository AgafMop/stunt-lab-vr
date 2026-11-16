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
  test.setTimeout(240_000);
  const errors = await boot(page, '&auto&fresh&seed=42');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 220_000 });
  const log = await page.evaluate(() => window.__ctx.taskLog);
  const order = ['race_choose', 'race_drill', 'race_lap', 'strip_pick', 'strip_ride', 'strip_action', 'strip_watch', 'strip_read', 'end'];
  let at = -1;
  for (const id of order) { const i = log.indexOf(id, at + 1); expect(i, `${id} after index ${at} in ${log.join(',')}`).toBeGreaterThan(at); at = i; }
  expect(errors).toEqual([]);
});

test('clarity: the view cards glow until one is chosen, and the task banner says what to do', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await boot(page, '&only=race&fresh');
  await page.waitForFunction(() => !!window.__ctx.engine.scene.getObjectByName('viewChoice'), null, { timeout: 30_000 });
  await expect(page.locator('#task')).toBeVisible();
  await expect(page.locator('#task')).toContainText('איך');
  const glows = () => page.evaluate(() => { let n = 0; window.__ctx.engine.scene.getObjectByName('viewChoice').traverse(o => { if (o.name === 'attention') n++; }); return n; });
  expect(await glows()).toBe(2);
  await page.evaluate(() => { const g = window.__ctx.engine.scene.getObjectByName('viewChoice'); window.__ctx.input.select(g.children.find(c => c.isMesh)); });
  await page.waitForTimeout(300);
  expect(await glows()).toBe(0);
  expect(errors).toEqual([]);
});
