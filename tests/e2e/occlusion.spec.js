// Every button the student must click is visible: from the chase camera, in the car (cockpit) and from the tower
// (table). The audit in kit.waitSelect (?test) logs a console error when a target is hidden behind the world or off
// screen — the user once got stuck in the cockpit behind the dashboard.
import { test, expect } from '@playwright/test';
for (const ride of ['chase', 'on', 'off']) {
  test(`occlusion: race buttons visible (${ride === 'on' ? 'cockpit' : ride === 'off' ? 'table' : 'chase'})`, async ({ page }) => {
    test.setTimeout(400_000);
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/?test&only=race&auto&fresh&seed=42&ride=${ride}${process.env.NOONTOP ? '&noontop' : ''}`);
    await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
    await page.click('#enter');
    await page.waitForFunction(() => !!window.__ctx.game.s.flags.reactionExplained && !window.__ctx.engine.scene.getObjectByName('reactionCard')?.visible, null, { timeout: 300_000 });
    await page.waitForTimeout(400);
    expect(errors).toEqual([]);
  });
}

// A real mouse click on "הבנתי! להקפה" (no auto-select): the button can be hit through the car (chase and cockpit).
for (const ride of ['chase', 'on']) {
  test(`occlusion: a real click on the reaction card's button starts the lap (${ride === 'on' ? 'cockpit' : 'chase'})`, async ({ page }) => {
    test.setTimeout(400_000);
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/?test&only=race&auto&fresh&seed=42&ride=${ride}`);
    await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
    await page.click('#enter');
    // the drills run by themselves; the moment the card is about to open, hand the clicking back to "the student"
    await page.waitForFunction(() => { const c = window.__ctx; if (c.game.s.flags.reactionExplained) { c.auto = false; return true; } return false; }, null, { timeout: 300_000, polling: 50 });
    await page.waitForFunction(() => window.__ctx.engine.scene.getObjectByName('reactionCard')?.visible, null, { timeout: 60_000 });
    await page.waitForTimeout(6000);                                        // the two narration lines, then the button waits
    const pt = await page.evaluate(() => {
      const { engine } = window.__ctx, g = engine.scene.getObjectByName('reactionCard');
      const btn = g.children[g.children.length - 1];
      const p = btn.getWorldPosition(btn.position.clone()).project(engine.camera);
      return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
    });
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(2500);                                        // a few frames: the pointer ray finds the button (hover)
    await page.mouse.click(pt.x, pt.y);
    await page.waitForFunction(() => window.__ctx.engine.scene.getObjectByName('reactionCard')?.visible === false, null, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
}
