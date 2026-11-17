// The real (full) world in every chapter and view: within the Quest budget, no console errors, no set shadow on the
// strip's reading band. Software GL draws it at ~1 s/frame, so these tests only boot each chapter and sample.
//   npx playwright test -g "world:"      → screenshots in .superpowers/look/world-*.png
import { test, expect } from '@playwright/test';

// [name, query, page condition for "the view is really on screen"]
const CASES = [
  ['intro', '&film', "window.__ctx.introPhase === 'video'"],
  ['race-cockpit', '&ride=on', "window.__ctx.drive?.view?.mode === 'cockpit'"],
  ['race-table', '&ride=off', "window.__ctx.drive?.view?.mode === 'table'"],
  ['strip', '', 'true'],
];

for (const [name, extra, ready] of CASES) test(`world: ${name} within budget, no errors`, async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  const id = name.split('-')[0];
  await page.goto(`/?test&world=full&fresh&only=${id}${extra}`);
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  await page.click('#enter');
  await page.waitForFunction(new Function(`return window.__ctx?.ready && (${ready}) && window.__ctx.engine.fadeLevel() < 0.05`), null, { timeout: 200_000 });
  const b = await page.evaluate(() => {          // one frame of this view, counted like main.js's per-chapter budget
    const { renderer, scene, camera } = window.__ctx.engine;
    renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera);
    const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    renderer.info.autoReset = true; return r;
  });
  console.log('BUDGET', name, JSON.stringify(b));
  await page.screenshot({ path: `.superpowers/look/world-${name}.png` });
  expect(b.calls, 'draw calls').toBeLessThanOrEqual(150);
  expect(b.tris, 'triangles').toBeLessThanOrEqual(400_000);
  if (id === 'race') expect(await page.evaluate(() => ['tyreWall', 'trackAsphalt', 'trackKerbs', 'trackPaint'].filter(n => !window.__ctx.lab.root.getObjectByName(n)))).toEqual([]);
  expect(errors).toEqual([]);
});

test('world: no set shadow falls on the strip (the ruler is read there)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?test&world=full&fresh&nogame');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  const hits = await page.evaluate(async () => {
    const [{ SUN_DIR, STRIP }, THREE] = await Promise.all([import('/src/world/layout.js'), import('three')]);
    const set = window.__ctx.lab.root.getObjectByName('SET');
    const out = [], v = new THREE.Vector3(); let checked = 0;
    set.traverse(o => {
      if (!o.isMesh || !o.castShadow) return;
      checked++;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y < 0.05) continue;
        const t = v.y / SUN_DIR[1], x = v.x - SUN_DIR[0] * t, z = v.z - SUN_DIR[2] * t;     // where its shadow lands
        if (x > STRIP.startX && x < STRIP.endX && Math.abs(z - STRIP.z) < STRIP.width / 2) { out.push(`${o.name} (${v.x.toFixed(0)},${v.y.toFixed(1)},${v.z.toFixed(0)})`); return; }
      }
    });
    return { out, checked };
  });
  expect(hits.checked).toBeGreaterThanOrEqual(6);
  expect(hits.out).toEqual([]);
});
