// Opening film: plays on the big screen with subtitles (8× in ?auto&film), then the set comes back.
//   npx playwright test -g "intro:"
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

test('intro: the film plays with subtitles, then the set is back', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await boot(page, '&only=intro&auto&film&fresh');
  await page.waitForFunction(() => window.__ctx.introPhase === 'video', null, { timeout: 30_000 });
  await page.waitForFunction(() => (window.__introCues || []).length >= 2, null, { timeout: 30_000 });
  await page.waitForFunction(() => !!window.__ctx.engine.scene.getObjectByName('cinema')?.getObjectByName('skipIntro'), null, { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/intro-film.png` });
  const text = await page.evaluate(() => window.__ctx.ui.textAudit.map(v => `${v.name}: «${v.text}» ${v.overflow ? 'overflow' : ''}${v.small ? `small ${v.px}px<${v.need}` : ''}`));
  expect(text).toEqual([]);
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 60_000 });
  const r = await page.evaluate(() => ({
    flag: window.__ctx.game.s.flags.intro,
    cues: window.__introCues,
    setVisible: window.__ctx.lab.root.visible,
    cinema: !!window.__ctx.engine.scene.getObjectByName('cinema'),
    fade: window.__ctx.engine.fadeLevel(),
  }));
  expect(r.flag).toBe('ended');
  expect(r.cues.length).toBeGreaterThanOrEqual(5);
  expect(r.setVisible).toBe(true);
  expect(r.cinema).toBe(false);
  expect(r.fade).toBeLessThan(0.1);
  expect(errors).toEqual([]);
});

test('intro: ?auto without ?film skips the film and never loads it', async ({ page }) => {
  const errors = await boot(page, '&only=intro&auto&fresh');
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ctx.introVideo ?? null)).toBeNull();
  expect(errors).toEqual([]);
});

test('intro: the skip button appears after a few seconds and ends the film', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await boot(page, '&only=intro&film&fresh');
  await page.waitForFunction(() => window.__ctx.introPhase === 'video', null, { timeout: 30_000 });
  const early = await page.evaluate(() => !!window.__ctx.engine.scene.getObjectByName('skipIntro'));
  expect(early).toBe(false);
  await page.waitForFunction(() => !!window.__ctx.engine.scene.getObjectByName('skipIntro'), null, { timeout: 15_000 });
  await page.evaluate(() => window.__ctx.input.select(window.__ctx.engine.scene.getObjectByName('skipIntro')));
  await page.waitForFunction(() => window.__gameDone === true, null, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__ctx.game.s.flags.intro)).toBe('skipped');
  expect(await page.evaluate(() => window.__ctx.introVideo.el.paused)).toBe(true);
  expect(errors).toEqual([]);
});
