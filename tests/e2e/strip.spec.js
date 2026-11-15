// Strip chapter: one brake run decided by the science model; the car stops exactly where the model says.
import { test, expect } from '@playwright/test';

async function playStrip(page, extra = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&only=strip&auto&fresh&seed=42' + extra);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 150_000 });
  const s = await page.evaluate(async () => {
    const { game, ui, motionAudit, stripRun } = window.__ctx;
    const { sampleRun, makeRng } = await import('/src/game/model.js');
    const { METER, TRIAL_COST } = await import('/src/game/config.js');
    return {
      trials: game.s.trials, expected: sampleRun(60, 'dry', makeRng(game.s.seed * 31 + 8)),
      meter: game.s.meter, meterWant: METER.start - TRIAL_COST, run: stripRun,
      flags: game.s.flags, text: ui.textAudit, motion: motionAudit,
    };
  });
  return { errors, s };
}

test('strip: brake run stops where the model says', async ({ page }) => {
  test.setTimeout(180_000);
  const { errors, s } = await playStrip(page);
  const runs = s.trials[s.expected.kmh];
  expect(runs).toHaveLength(1);
  expect(runs[0].value).toBe(s.expected.distance);
  expect(Math.abs(s.run.frontX - s.expected.distance)).toBeLessThanOrEqual(0.05);
  expect(s.run.read).toBe(s.expected.distance);
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
