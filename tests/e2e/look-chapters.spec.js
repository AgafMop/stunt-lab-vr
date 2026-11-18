// Art review of chapter props, composed directly (software GL is too slow to catch moments in real time).
import { test, expect } from '@playwright/test';
test('look: dummy in the car with the airbag; Roni; the tyre zoom', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?test&world=full&fresh&nogame');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 180_000 });
  await page.click('#enter');
  await page.waitForFunction(() => window.__ctx?.ready === true);
  await page.evaluate(async () => {
    const ctx = window.__ctx, THREE = await import('three');
    const { makeDriver } = await import('/src/chapters/stripKit.js');
    const car = ctx.lab.makeCar(0xf07a1a); car.position.set(-1, 0, -12.5); car.rotation.y = Math.PI / 2; ctx.lab.world.add(car);
    car.add(makeDriver(ctx, 'bumper'));                     // the crash itself: tests/look-gpu/belt.spec.js
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), new THREE.MeshStandardMaterial({ color: 0xf4f1ea })); bag.position.set(0.38, 0.95, 0.35); bag.scale.setScalar(1.2); car.add(bag);
    const car2 = ctx.lab.makeCar(0xf07a1a); car2.position.set(9, 0, -12.5); car2.rotation.y = Math.PI / 2; ctx.lab.world.add(car2);
    car2.add(makeDriver(ctx, 'roni'));
    ctx.loco.look(0, -0.62);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '.superpowers/look/drivers.png' });
  // from the passenger seat (ride-along) at the airbag moment
  await page.evaluate(async () => {
    const ctx = window.__ctx, THREE = await import('three');
    let car = null; ctx.lab.world.traverse(o => { if (!car && o.name === 'car' && Math.abs(o.position.x + 1) < 0.01) car = o; });
    const seat = car.getObjectByName('seatP'), eye = new THREE.Vector3();
    ctx.loco.lock(true); ctx.loco.follow(() => ({ pos: seat.getWorldPosition(eye), yaw: car.rotation.y + Math.PI }));
    ctx.loco.applyFollow(); ctx.loco.look(-0.75, -0.25);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.superpowers/look/dummy-ride.png' });
  expect(errors).toEqual([]);
});
