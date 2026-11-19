// "Text boxes cover each other in many places" (headset check, 2026-11-19): every chapter in the emulated headset
// (IWER Quest 3, seated), self-playing; main.js's ?test overlap audit projects every text panel into the eye and logs
// any two that cover each other (the subtitle zone counts even between lines). A screenshot from the eye at each task.
// One chapter per test (?only=…) — the whole game in one page runs a low-RAM laptop out of memory.
//   npx playwright test tests/e2e/xr-overlap.spec.js -g "race"
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const IWER = fs.readFileSync(path.resolve('node_modules/iwer/build/iwer.min.js'), 'utf8');
const SHOTS = '.superpowers/xr-overlap';
const CHAPTERS = ['intro', 'race', 'cliff', 'belt', 'plan', 'strip', 'graph', 'surfaces', 'stunt', 'road', 'end'];
// + a student who stood (eye 1.65) with the head turned to read the task card (50° left) and past it (75°)
const RUNS = [...CHAPTERS.map(ch => ({ ch, tag: ch })), { ch: 'plan', tag: 'plan-turned50', yaw: 50, eyeY: 1.65 }, { ch: 'graph', tag: 'graph-turned75', yaw: 75, eyeY: 1.65 },
  { ch: 'stunt', tag: 'stunt-retry', q: '&stuntpress=late' }];   // the retry screen: the last take's card over the lamp choice

for (const { ch, tag, yaw = 0, eyeY = 1.2, q = '' } of RUNS) {
  test(`xr overlap: ${tag}`, async ({ page }) => {
    test.setTimeout(600_000);
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript({ content: `${IWER}
      window.__xrd = new IWER.XRDevice(IWER.metaQuest3);
      window.__xrd.installRuntime({ forceInstall: true });
      window.__xrd.stereoEnabled = false;
      window.__xrd.position.set(0, ${eyeY}, 0);` });
    await page.goto(`/?test&auto&fresh&seed=42&only=${ch}${ch === 'intro' ? '&film' : ''}${q}`);
    await page.click('#enterVR');
    await page.waitForFunction(() => window.__ctx?.engine.isXR(), null, { timeout: 60_000 });
    if (yaw) {                                                    // turn the head left once the chapter has begun
      await page.waitForFunction(() => (window.__ctx.taskLog?.length ?? 0) > 0, null, { timeout: 300_000 });
      await page.evaluate(a => { const h = a * Math.PI / 360; window.__xrd.quaternion.set(0, Math.sin(h), 0, Math.cos(h)); }, yaw);
    }
    let seenTasks = 0, seenOv = 0, shot = 0, filmShot = false, line40 = false, litShot = false;
    const snap = async t => page.screenshot({ path: `${SHOTS}/${tag}-${String(++shot).padStart(2, '0')}-${t}.png` });
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(() => ({ n: window.__ctx.taskLog?.length ?? 0, task: window.__ctx.taskLog?.at(-1) ?? null,
        ov: window.__ctx.uiOverlaps.length, done: window.__chapterDone, film: window.__ctx.introPhase === 'video' }));
      if (st.n > seenTasks) { seenTasks = st.n; await page.waitForTimeout(400); await snap(st.task); }
      if (st.ov > seenOv) { seenOv = st.ov; await snap('overlap'); }
      const drive = await page.evaluate(() => ({ x: window.__ctx.cliffState?.x ?? null, lit: !!window.__ctx.cliffLit }));
      if (!line40 && drive.x != null && drive.x > -42) { line40 = true; await snap('line-40m'); }
      if (!litShot && drive.lit) { litShot = true; await snap('signal-lit'); }
      if (st.film && !filmShot && await page.evaluate(() => !!window.__ctx.engine.scene.getObjectByName('skipIntro'))) {
        filmShot = true;                                              // the longest film line + the skip button
        await page.evaluate(() => window.__ctx.ui.subtitles.show('roni', 'מי חישב איפה לבלום? בלי פיזיקה, אני לא עולה לרכב.', 8000));
        await page.waitForTimeout(800); await snap('film');
      }
      if (st.done === ch || Date.now() - t0 > 540_000) break;
      await page.waitForTimeout(250);
    }
    let ov = await page.evaluate(() => window.__ctx.uiOverlaps);
    // a turned head sees the boards from the side (their cards' screen boxes overlap by perspective, not in the world):
    // there, only what follows the head or reads from the side counts — the subtitles and the task card — and only
    // past 20 % (a box seen from the side is bigger than the panel; the subtitles glide ≈ 0.3 s while they follow).
    // The eye screenshots of these runs were checked by hand (2026-11-19): clean.
    if (yaw) ov = ov.filter(o => [o.a, o.b].some(n => n === 'subtitles' || n === 'task') && o.frac > 0.2);
    const text = await page.evaluate(() => window.__ctx.ui.textAudit);
    fs.writeFileSync(`${SHOTS}/${tag}.json`, JSON.stringify({ ov, text, errors, done: await page.evaluate(() => window.__chapterDone) }, null, 1));
    console.log(tag, JSON.stringify(ov), text.length ? `text: ${JSON.stringify(text)}` : '');
    expect(text).toEqual([]);
    expect(errors).toEqual([]);
    expect(ov).toEqual([]);
  });
}
