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
  for (const id of ['belt_watch_none', 'belt_watch_belt', 'tyre_cruise', 'tyre_accel', 'tyre_brake', 'tyre_ice', 'tyre_q']) expect(r.tasks).toContain(id);
});

test('chapter: plan — hypothesis sentence, matching graph, variables sorted', async ({ page }) => {
  test.setTimeout(240_000);
  const r = await play(page, 'plan');
  expect(r.s.hypothesis).toEqual({ pred: 'x2', graph: 'line' });
  expect(r.s.flags.sortWrongs).toBe(0);
});
