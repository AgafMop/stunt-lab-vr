// Browser tests (desktop mode, software WebGL). Run in SMALL GROUPS on a low-memory machine:
//   npx playwright test -g "boots"      npx playwright test -g "full game"
import { test, expect } from '@playwright/test';

const SHOTS = 'test-results/shots';

async function boot(page, query = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test' + query);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.ready === true);
  return errors;
}

// every string drawn on a 3D panel stayed inside its box at a readable size (ui.textAudit, ?test only)
const textProblems = page => page.evaluate(() => window.__ctx.ui.textAudit.map(v => `${v.name}: «${v.text}» ${v.overflow ? 'overflow' : ''}${v.small ? `small ${v.px}px<${v.need}` : ''}`));

test('boots and teleports between stations', async ({ page }) => {
  const errors = await boot(page, '&nogame');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/tower.png` });
  await page.evaluate(() => window.__ctx.loco.goTo('pit'));
  const d = await page.evaluate(() => {
    const { engine, loco } = window.__ctx;
    const head = engine.headPosition(), s = loco.stations.pit.pos;
    return Math.hypot(head.x - s.x, head.z - s.z);
  });
  expect(d).toBeLessThan(0.3);
  await page.screenshot({ path: `${SHOTS}/pit.png` });
  expect(errors).toEqual([]);
});

// look at every board you add: screenshot it and READ the image (hidden, clipped or tiny text shows up here first)
test('tour: screenshot every board', async ({ page }) => {
  const errors = await boot(page, '&auto&fresh&seed=7&tour');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 170_000 });
  const tour = await page.evaluate(() => window.__tour);
  const fs = await import('node:fs');
  fs.mkdirSync(SHOTS, { recursive: true });
  tour.forEach((t, i) => fs.writeFileSync(`${SHOTS}/tour-${String(i).padStart(2, '0')}-${t.chapter}.jpg`, Buffer.from(t.img.split(',')[1], 'base64')));
  expect(tour.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('full game plays itself to the end within budget, text fits, nothing jumps', async ({ page }) => {
  const errors = await boot(page, '&auto&fresh&seed=42');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 170_000 });
  await page.screenshot({ path: `${SHOTS}/end.png` });
  expect(await textProblems(page)).toEqual([]);
  expect(await page.evaluate(() => window.__ctx.motionAudit)).toEqual([]);
  const budget = await page.evaluate(() => window.__budget);
  for (const [ch, b] of Object.entries(budget)) {
    expect(b.calls, `${ch} draw calls`).toBeLessThanOrEqual(150);
    expect(b.tris, `${ch} triangles`).toBeLessThanOrEqual(400_000);
  }
  const s = await page.evaluate(() => window.__ctx.game.s);
  expect(s.trials[37].filter(t => t.valid).length).toBe(3);
  expect(errors).toEqual([]);
});
