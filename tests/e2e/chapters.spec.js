// The new chapters, each played by itself in ?auto: no errors, all text fits, nothing jumps, and the science state.
//   npx playwright test -g "chapter:"
import { test, expect } from '@playwright/test';

async function play(page, id, extra = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`/?test&only=${id}&auto&fresh&seed=42${extra}`);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 220_000 });
  const s = await page.evaluate(() => {
    const { game, ui, motionAudit, taskLog } = window.__ctx;
    return { s: JSON.parse(JSON.stringify(game.s)), text: ui.textAudit.map(v => `${v.name}: «${v.text}» ${v.overflow ? 'overflow' : ''}${v.small ? 'small' : ''}`), motion: motionAudit, tasks: taskLog };
  });
  expect(s.text).toEqual([]);
  expect(s.motion).toEqual([]);
  expect(errors).toEqual([]);
  return s;
}

test('chapter: belt — both dummy runs, the tyre zoom, "the road stops the car"', async ({ page }) => {
  test.setTimeout(240_000);
  const r = await play(page, 'belt');
  expect(r.s.flags.beltFirst).toBe('none');
  expect(r.s.flags.tyreTries).toBe(1);
  for (const id of ['belt_watch_none', 'belt_watch_belt', 'tyre_accel', 'tyre_brake', 'tyre_ice', 'tyre_q']) expect(r.tasks).toContain(id);
});

test('chapter: plan — hypothesis sentence, matching graph, variables sorted', async ({ page }) => {
  test.setTimeout(240_000);
  const r = await play(page, 'plan');
  expect(r.s.hypothesis).toEqual({ pred: 'x2', graph: 'line' });
  expect(r.s.flags.sortWrongs).toBe(0);
});

test('chapter: graph — ×2 → ×≈4 from their data, hypothesis verdict, energy cubes, the explanation', async ({ page }) => {
  test.setTimeout(240_000);
  const r = await play(page, 'graph');
  expect(r.s.flags.doublingRatios.length).toBeGreaterThanOrEqual(1);
  for (const x of r.s.flags.doublingRatios) { expect(x).toBeGreaterThan(3.4); expect(x).toBeLessThan(4.6); }
  expect(r.s.flags.hypothesisSupported).toBe(false);          // seeded hypothesis: ×2
});

test('chapter: surfaces — two by the student, 3 on each, ranked dry < wet < sand < oil', async ({ page }) => {
  test.setTimeout(240_000);
  const r = await play(page, 'surfaces');
  expect(r.s.flags.surfacePicks).toEqual(['wet', 'oil']);
  for (const sf of ['dry', 'wet', 'sand', 'oil']) expect(r.s.surfaceTrials[sf].length).toBeGreaterThanOrEqual(3);
  const m = sf => r.s.surfaceTrials[sf].reduce((a, t) => a + t.value, 0) / r.s.surfaceTrials[sf].length;
  expect(m('dry')).toBeLessThan(m('wet')); expect(m('wet')).toBeLessThan(m('sand')); expect(m('sand')).toBeLessThan(m('oil'));
  expect(r.s.flags.surfaceRankWrongs).toBe(0);
});

test('chapter: stunt — reaction + braking places the lamp; Roni stops on the line first time', async ({ page }) => {
  test.setTimeout(240_000);
  const r = await play(page, 'stunt');
  expect(r.s.flags.stuntDone).toBe(true);
  expect(r.s.flags.stuntAttempts).toBe(1);
  expect(Math.abs(r.s.flags.stuntLast.miss)).toBeLessThanOrEqual(2);
  expect(r.s.badges).toContain('צוק אחד');
});

test('chapter: road — four everyday scenes answered', async ({ page }) => {
  test.setTimeout(200_000);
  const r = await play(page, 'road');
  expect(r.s.flags.roadWrongs).toBe(0);
  for (const id of ['road_rain', 'road_phone', 'road_tyres', 'road_auto']) expect(r.tasks).toContain(id);
});
