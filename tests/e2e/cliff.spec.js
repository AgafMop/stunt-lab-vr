// The 2026-11-19 headset check: "an option to skip the race", and "the film promises stopping on the cliff edge — the
// lab never asks for it". The lap can be skipped (the reaction times stay); the cliff test puts the student in the
// driver's seat of the film's car, braking by eye; the big shot is driven by the student too.
import { test, expect } from '@playwright/test';

async function play(page, q) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`/?test&auto&fresh&seed=42&${q}`);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  return errors;
}

test('race: "skip the race" after the start lights — the reaction times are kept, no lap', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await play(page, 'only=race&lap=skip');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 220_000 });
  const s = await page.evaluate(() => ({ s: window.__ctx.game.s, log: window.__ctx.taskLog, text: window.__ctx.ui.textAudit }));
  expect(s.s.flags.lapSkipped).toBe(true);
  expect(s.s.flags.lapDone).toBeFalsy();
  expect(s.s.race).toEqual({ skipped: true });
  expect(s.s.reaction.simple).toHaveLength(3);                 // the stunt still has the student's reaction time
  expect(s.log).not.toContain('race_lap');
  expect(s.text).toEqual([]);
  expect(errors).toEqual([]);
});

test('cliff test: in the driver seat, the car runs to the line, a late press goes over the edge (no daylight lost)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await play(page, 'only=cliff');
  await page.waitForFunction(() => window.__ctx?.rideCar && window.__ctx.loco.following, null, { timeout: 120_000 });
  const seat = await page.evaluate(() => {
    const c = window.__ctx, T = c.engine.THREE, s = c.rideCar.getObjectByName('seat').getWorldPosition(new T.Vector3());
    const h = c.engine.headPosition(new T.Vector3());
    return { d: h.distanceTo(s), task: c.taskLog.at(-1) };
  });
  expect(seat.d).toBeLessThan(0.3);                            // the student sits in the driver's seat
  expect(seat.task).toBe('cliff_drive');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 200_000 });
  const r = await page.evaluate(() => ({ t: window.__ctx.game.s.cliffTest, meter: window.__ctx.game.s.meter, text: window.__ctx.ui.textAudit,
    following: window.__ctx.loco.following, log: window.__ctx.taskLog }));
  expect(r.t.verdict).toBe('cliff');                           // ?auto brakes 7 m late on purpose
  expect(r.t.fell).toBe(true);
  expect(r.t.brakeAt).toBeLessThan(0);
  expect(r.meter).toBe(180);                                   // the miss is the lesson, not a penalty
  expect(r.following).toBe(false);                             // back in the tower
  expect(r.log).toContain('cliff_done');
  expect(r.text).toEqual([]);
  expect(errors).toEqual([]);
});

test('big shot retry: the right lamp but a late press → "slower than in the race", no daylight lost, take 2 starts clean', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&auto&fresh&seed=42&only=stunt&stuntpress=late');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.evaluate(() => {                                   // which lines were said, and how many strip cars at once
    const c = window.__ctx; window.__said = []; window.__maxCars = 0;
    const say = c.audio.say.bind(c.audio); c.audio.say = id => { window.__said.push(id); return say(id); };
    c.engine.onFrame(() => { let n = 0; c.lab.world.traverse(o => { if (o.name === 'lineGantry') n++; }); window.__maxCars = Math.max(window.__maxCars, n); });
  });
  await page.click('#enter');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 380_000 });
  const r = await page.evaluate(() => ({ f: window.__ctx.game.s.flags, meter: window.__ctx.game.s.meter, said: window.__said,
    maxCars: window.__maxCars, text: window.__ctx.ui.textAudit }));
  expect(r.said).toContain('stunt_late');
  expect(r.said).not.toContain('stunt_cliff');                 // the lamp was right: the press is blamed, not the calculation
  expect(r.f.stuntAttempts).toBe(2);
  expect(r.meter).toBe(180);                                   // a late press costs no daylight
  expect(r.maxCars).toBe(1);                                   // take 1's car, signal and wet layer are gone for take 2
  expect(r.text).toEqual([]);                                  // incl. the "last take" card above the lamp choice
  expect(errors).toEqual([]);
});

test('big shot: the student drives it, braking at the lamp placed from their own reaction time', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await play(page, 'only=stunt');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 280_000 });
  const r = await page.evaluate(() => ({ f: window.__ctx.game.s.flags, tr: window.__ctx.game.s.reaction.mean, text: window.__ctx.ui.textAudit }));
  expect(r.f.stuntDone).toBe(true);
  expect(r.f.stuntAttempts).toBe(1);
  expect(Math.abs(r.f.stuntLast.miss)).toBeLessThanOrEqual(2);
  expect(r.f.stuntLast.reaction).toBeCloseTo(r.tr, 1);        // pressed one race-reaction after the lamp
  expect(r.text).toEqual([]);
  expect(errors).toEqual([]);
});
