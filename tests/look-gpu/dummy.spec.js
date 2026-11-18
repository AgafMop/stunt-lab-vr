// Bumper close up: standing (front 3/4, face, moods) and seated in the stunt car (through the driver's window, from the
// passenger seat, through the windshield). READ .superpowers/look-gpu/<TAG>-dummy-*.png
// Cameras are given in the subject's own frame (Bumper's or the car's) and turned into a world eye + yaw/pitch here.
import { test, expect } from '@playwright/test';
const TAG = process.env.LOOK_TAG || 'now';
test('look-gpu: dummy close-up', async ({ page }) => {
  test.setTimeout(200_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?test&world=full&quality=pc&fresh&nogame&mute');
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 120_000 });
  await page.click('#enter');
  await page.waitForTimeout(3000);
  const info = await page.evaluate(async () => {
    const ctx = window.__ctx; const { lab } = ctx;
    const kit = await import('/src/chapters/stripKit.js');
    const car = lab.makeCar(0xf07a1a); car.position.set(-20, 0, -12); car.rotation.y = Math.PI / 2; lab.world.add(car);
    const d = kit.makeDriver(ctx, 'bumper'); car.add(d);
    car.userData.setInterior?.(true);
    window.__dbgCar = car; window.__dbgDriver = d;
    // the 3-point belt routed like crashTest.js's seatBelt() (pillar loop, his anchors + 2 cm, buckle, floor anchor)
    const THREE = await import('three');
    const web = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85 });
    const pillar = new THREE.Vector3(0.80, 1.02, -0.78), floorOut = new THREE.Vector3(0.76, 0.36, -0.62), buckle = new THREE.Vector3(0.10, 0.42, -0.50);
    car.updateMatrixWorld(true);
    const A = {};
    for (const [k, o] of Object.entries(d.userData.parts.anchors)) { A[k] = car.worldToLocal(o.getWorldPosition(new THREE.Vector3())); A[k].z += 0.02; }
    for (const [p, q] of [[pillar, A.shoulder], [A.shoulder, A.chest], [A.chest, A.hip_R], [A.hip_R, buckle], [floorOut, A.hip_L], [A.hip_L, A.hip_R]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), web), dd = q.clone().sub(p);
      m.position.copy(p).addScaledVector(dd, 0.5); m.scale.set(0.05, 0.008, dd.length());
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dd.normalize()); car.add(m);
    }
    const b = ctx.bumper; b.position.set(-14, 0, -12); b.rotation.y = -Math.PI / 2; lab.world.add(b);
    let tris = 0, mats = new Set();
    b.traverse(o => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; mats.add(o.material.uuid); } });
    return { glb: !!b.getObjectByName('BUMPER'), tris, mats: mats.size, parts: Object.keys(b.userData.parts || {}), arms: b.userData.parts?.arms?.length };
  });
  console.log('bumper', JSON.stringify(info));
  // [name, subject ('car' | 'bumper'), eye (subject-local), target (subject-local), mood]
  const shots = [
    ['stand', 'bumper', [0.95, 0.85, 2.3], [0, 0.55, 0], 'normal'],
    ['face', 'bumper', [0.22, 0.95, 0.95], [0, 0.88, 0.1], 'normal'],
    ['worried', 'bumper', [0.0, 0.92, 0.9], [0, 0.88, 0.1], 'worried'],
    ['back', 'bumper', [-1.2, 1.0, -1.9], [0, 0.55, 0], 'normal'],
    ['side', 'car', [2.1, 1.12, -0.10], [0.38, 0.86, -0.18], 'normal'],
    ['seatP', 'car', [-0.38, 1.12, -0.35], [0.38, 0.9, -0.2], 'happy'],
    ['windshield', 'car', [0.9, 1.55, 1.9], [0.38, 0.85, -0.2], 'normal'],
    ['belt', 'car', [0.30, 1.16, 0.22], [0.38, 0.62, -0.45], 'normal'],
    ['lap', 'car', [0.12, 0.80, 0.30], [0.38, 0.55, -0.40], 'normal'],
  ];
  for (const [n, subj, eye, tgt, mood] of shots) {
    await page.evaluate(async ([n, subj, eye, tgt, mood]) => {
      const { loco, bumper } = window.__ctx, THREE = await import('three');
      const o = subj === 'car' ? window.__dbgCar : bumper;
      const wheel = window.__dbgCar.getObjectByName('wheel'); if (wheel) wheel.visible = n !== 'lap';   // the lap belt sits behind it
      o.updateMatrixWorld(true);
      const E = o.localToWorld(new THREE.Vector3(...eye));
      const T = o.localToWorld(new THREE.Vector3(...tgt));
      const yaw = Math.atan2(E.x - T.x, E.z - T.z), pitch = Math.atan2(T.y - E.y, Math.hypot(T.x - E.x, T.z - E.z));
      bumper.userData.setMood(mood); window.__dbgDriver.userData.setMood(mood);
      loco.follow(() => ({ pos: E, yaw })); loco.setPitch(pitch);
    }, [n, subj, eye, tgt, mood]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `.superpowers/look-gpu/${TAG}-dummy-${n}.png` });
  }
  expect(errors).toEqual([]);
});
