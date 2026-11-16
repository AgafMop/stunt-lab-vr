// Race chapter: view choice, three valid start-light reactions (a false start never counts), one lap.
import { test, expect } from '@playwright/test';

async function playRace(page, extra = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&only=race&auto&fresh&seed=42' + extra);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 170_000 });
  const s = await page.evaluate(() => {
    const { game, ui, motionAudit } = window.__ctx;
    return { flags: game.s.flags, reaction: game.s.reaction, text: ui.textAudit, motion: motionAudit, budget: window.__budget };
  });
  return { errors, s };
}

test('race: choice, three valid starts, lap completes', async ({ page }) => {
  test.setTimeout(200_000);
  const { errors, s } = await playRace(page);
  expect(s.flags.view).toBe('cockpit');
  expect(s.reaction.simple).toHaveLength(3);
  for (const r of s.reaction.simple) { expect(r).toBeGreaterThanOrEqual(0.2); expect(r).toBeLessThanOrEqual(0.4); }
  expect(s.reaction.falseStarts).toBe(0);
  expect(s.flags.lapDone).toBe(true);
  expect(s.text).toEqual([]);
  expect(s.motion).toEqual([]);
  for (const [ch, b] of Object.entries(s.budget)) expect(b.calls, `${ch} draw calls`).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});

test('race: a held trigger at lights-out is a false start and does not count', async ({ page }) => {
  test.setTimeout(200_000);
  const { errors, s } = await playRace(page, '&forcefalse&ride=off');
  expect(s.flags.view).toBe('table');
  expect(s.reaction.falseStarts).toBe(1);
  expect(s.reaction.simple).toHaveLength(3);
  expect(errors).toEqual([]);
});

// look at the start lights in both views (screenshots to READ, not just assertions)
for (const ride of ['on', 'off']) {
  test(`race: start lights screenshot (${ride === 'on' ? 'cockpit' : 'table'})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test&only=race&auto&fresh&seed=42&animspeed=1&ride=${ride}`);
    await expect(page.locator('#enter')).toBeEnabled({ timeout: 100_000 });
    await page.click('#enter');
    await page.waitForFunction(() => {
      const l = window.__ctx?.engine.scene.getObjectByName('startLights');
      return l && l.children.filter(c => c.material?.color?.r > 0.9).length >= 3;
    }, null, { timeout: 100_000 });
    await page.screenshot({ path: `test-results/shots/lights-${ride === 'on' ? 'cockpit' : 'table'}.png` });
  });
}

test('race: in the headset without controllers (hand tracking) the student is told to pick them up', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&only=race&auto&fresh&seed=42&ride=off&nocontrollers');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 100_000 });
  await page.click('#enter');
  await page.waitForFunction(() => document.getElementById('sub')?.textContent.includes('בקרים'), null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__ctx.game.s.reaction.simple.length)).toBe(0);   // no drill runs without controllers
  expect(errors).toEqual([]);
});

test('race: on desktop the view-choice cards open inside the camera view', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?test&only=race&fresh');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => !!window.__ctx?.engine.scene.getObjectByName('viewChoice'), null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  const ndc = await page.evaluate(() => {
    const { engine } = window.__ctx;
    const g = engine.scene.getObjectByName('viewChoice');
    engine.camera.updateMatrixWorld();
    const p = g.getWorldPosition(g.position.clone()).project(engine.camera);
    return { x: p.x, y: p.y, z: p.z };
  });
  expect(Math.abs(ndc.x)).toBeLessThan(0.6);
  expect(Math.abs(ndc.y)).toBeLessThan(0.6);
  expect(ndc.z).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/shots/race-choice.png' });
});
