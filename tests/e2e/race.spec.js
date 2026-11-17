// Race chapter: view choice, three valid start-light reactions (a false start never counts), one lap.
import { test, expect } from '@playwright/test';

async function playRace(page, extra = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&only=race&auto&fresh&seed=42' + extra);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 330_000 });   // 1.9 km lap, chase view on software GL
  const s = await page.evaluate(() => {
    const { game, ui, motionAudit } = window.__ctx;
    return { flags: game.s.flags, reaction: game.s.reaction, text: ui.textAudit, motion: motionAudit, budget: window.__budget };
  });
  return { errors, s };
}

test('race: choice, three valid starts, lap completes', async ({ page }) => {
  test.setTimeout(360_000);
  const { errors, s } = await playRace(page);
  expect(s.flags.view).toBe('chase');                      // desktop: straight into the racing camera
  expect(s.reaction.simple).toHaveLength(3);
  for (const r of s.reaction.simple) { expect(r).toBeGreaterThanOrEqual(0.2); expect(r).toBeLessThanOrEqual(0.4); }
  expect(s.reaction.falseStarts).toBe(0);
  expect(s.flags.lapDone).toBe(true);
  // the reaction time is explained with the student's own mean and what it costs at 50 km/h (spec: d_r = v·t_r)
  expect(s.reaction.mean).toBeCloseTo(s.reaction.simple.reduce((a, b) => a + b) / 3, 3);
  expect(s.flags.reactionExplained).toBeCloseTo(50 / 3.6 * s.reaction.mean, 2);
  expect(s.flags.assist).toBe('off');                      // desktop: the student steers (no blended help)
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

test('race: on desktop the race opens in the chase camera — behind and above the car, the car in view', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?test&only=race&fresh');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.drive?.view?.mode === 'chase' && window.__ctx.engine.fadeLevel() < 0.05, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const { engine, drive } = window.__ctx;
    engine.camera.updateMatrixWorld();
    const car = drive.car3d.getWorldPosition(drive.car3d.position.clone());
    const eye = engine.camera.getWorldPosition(car.clone());
    const p = car.clone().project(engine.camera);
    const fwd = { x: Math.sin(drive.car3d.rotation.y), z: Math.cos(drive.car3d.rotation.y) };
    return { x: p.x, y: p.y, z: p.z, behind: (eye.x - car.x) * fwd.x + (eye.z - car.z) * fwd.z, up: eye.y - car.y, rx: engine.rig.rotation.x, rz: engine.rig.rotation.z };
  });
  expect(Math.abs(r.x)).toBeLessThan(0.3);
  expect(r.y).toBeLessThan(0.2); expect(r.y).toBeGreaterThan(-0.8);
  expect(r.z).toBeLessThan(1);
  expect(r.behind).toBeLessThan(-5);
  expect(r.up).toBeGreaterThan(2);
  expect(Math.abs(r.rx) + Math.abs(r.rz)).toBeLessThan(1e-6);           // the rig never rolls or pitches (the camera pitches)
  await page.screenshot({ path: 'test-results/shots/race-chase.png' });
});
