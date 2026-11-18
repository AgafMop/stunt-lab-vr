// Chapter 4 (id 'strip'): the main experiment — 3 student runs at 40, picked speeds run by the crew, the sprinkler
// outlier disqualified; every car stops exactly where the model says.
import { test, expect } from '@playwright/test';

async function playStrip(page, extra = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&only=strip&auto&fresh&seed=42' + extra);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 220_000 });
  const s = await page.evaluate(async () => {
    const { game, ui, motionAudit, stripRun } = window.__ctx;
    const { sampleRun, makeRng } = await import('/src/game/model.js');
    const { METER, TRIAL_COST } = await import('/src/game/config.js');
    return {
      trials: game.s.trials, expected: sampleRun(40, 'dry', makeRng(game.s.seed * 31 + 8)),
      meter: game.s.meter, meterWant: METER.start - 3 * TRIAL_COST, run: stripRun, plan: game.s.plan,
      flags: game.s.flags, text: ui.textAudit, motion: motionAudit, overlap: window.__ctx.boardOverlap || [], card: !!document.getElementById('resultsCard'),
    };
  });
  return { errors, s };
}

test('strip: the main experiment — 3 repeats at 40, picked speeds, the sprinkler run disqualified', async ({ page }) => {
  test.setTimeout(240_000);
  const { errors, s } = await playStrip(page);
  const runs = s.trials[40];
  expect(runs).toHaveLength(3);
  expect(runs[0].value).toBe(s.expected.distance);
  expect(s.plan).toEqual([30, 40, 60, 80, 110]);
  for (const v of [30, 60, 80, 110]) expect(s.trials[v]).toHaveLength(3);
  const bad = s.trials[60].filter(t => !t.valid);
  expect(bad).toHaveLength(1);
  expect(bad[0].sprinkler).toBe(true);
  expect(bad[0].reason).toContain('ממטרה');
  expect(s.flags.sprinkler).toBe(true);
  expect(Math.abs(s.run.frontX - s.expected.distance)).toBeLessThanOrEqual(0.05);
  expect(s.run.read).toBe(s.expected.distance);
  expect(s.overlap).toEqual([]);                                   // the results card never covers a run
  expect(s.meter).toBe(s.meterWant);
  expect(s.flags.rodeAlong).toBe(false);
  expect(s.text).toEqual([]);
  expect(s.motion).toEqual([]);
  expect(errors).toEqual([]);
});

test('strip: riding along moves the student with the car, level (no roll/pitch)', async ({ page }) => {
  test.setTimeout(180_000);
  const { errors, s } = await playStrip(page, '&ride=on');
  expect(s.flags.rodeAlong).toBe(true);
  expect(s.run.rigTravel).toBeGreaterThan(10);
  expect(s.run.maxTilt).toBeLessThan(1e-6);
  expect(errors).toEqual([]);
});

test('strip: reading screenshot (radar + drone zoom)', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?test&only=strip&auto&fresh&seed=42&animspeed=1');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 100_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.stripRun?.frontX != null, null, { timeout: 120_000 });
  await page.screenshot({ path: 'test-results/shots/strip-stopped.png' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/shots/ruler-read.png' });
});

test('strip: a teacher skip during the ride-along leaves the student back in the tower, free to move', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&only=strip&auto&fresh&seed=42&animspeed=1&ride=on&demo');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 100_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.loco.following === true, null, { timeout: 100_000 });
  await page.evaluate(() => window.__ctx.demoSkip());
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 60_000 });
  const s = await page.evaluate(() => {
    const { engine, loco } = window.__ctx;
    const h = engine.headPosition(), t = loco.stations.tower.pos;
    return { following: loco.following, locked: loco.locked, d: Math.hypot(h.x - t.x, h.z - t.z) };
  });
  expect(s.following).toBe(false);
  expect(s.locked).toBe(false);
  expect(s.d).toBeLessThan(0.3);
  expect(errors).toEqual([]);
});
