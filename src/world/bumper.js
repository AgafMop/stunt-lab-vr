// Bumper, the crash-test robot from the opening film, built from scratch: a white rounded body with yellow-and-black
// crash-test targets, black accordion arms and legs, mitten hands, and a screen face with big cyan cartoon eyes
// (expressions: normal, happy, worried, dizzy; blinks; a mouth line that talks while he speaks). ≈ 1.05 m tall.
// createBumper(engine, audio) → group with .setMood(m), .lookAt(target), .point(on), .dispose().
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const WHITE = 0xf1f1ee, BLACK = 0x161618, CYAN = '#46e6f0';

function targetTexture() {                       // the crash-test target decal: quartered yellow / black disc
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 58, k * Math.PI / 2, (k + 1) * Math.PI / 2); g.fillStyle = k % 2 ? '#111' : '#f2c21b'; g.fill(); }
  g.lineWidth = 5; g.strokeStyle = '#111'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function accordion(len, r, rings = 6) {          // black rubber bellows along +y
  const pts = [];
  for (let i = 0; i <= rings * 2; i++) pts.push(new THREE.Vector2(i % 2 ? r * 0.78 : r, (i / (rings * 2)) * len));
  return new THREE.LatheGeometry(pts, 14);
}

export function createBumper(engine, audio) {
  const root = new THREE.Group(); root.name = 'bumper';
  const white = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.35, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: BLACK, roughness: 0.7 });
  const decal = new THREE.MeshBasicMaterial({ map: targetTexture(), transparent: true, toneMapped: true });
  const body = new THREE.Group(); root.add(body);

  // torso: a soft rounded box, chest target
  const torso = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.38, 0.3, 4, 0.1), white); torso.position.y = 0.58; body.add(torso);
  const waist = new THREE.Mesh(accordion(0.1, 0.13, 3), black); waist.position.y = 0.36; body.add(waist);
  const hips = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.12, 0.24, 3, 0.05), white); hips.position.y = 0.33; body.add(hips);
  const chest = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), decal); chest.position.set(0, 0.6, 0.151); body.add(chest);

  // head on a bellows neck: rounded block, screen face, targets on the sides
  const neck = new THREE.Mesh(accordion(0.08, 0.06, 2), black); neck.position.y = 0.77; body.add(neck);
  const head = new THREE.Group(); head.position.y = 0.84; body.add(head);
  const skull = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.28, 0.28, 4, 0.08), white); skull.position.y = 0.14; head.add(skull);
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), decal); d.position.set(s * 0.171, 0.15, 0); d.rotation.y = s * Math.PI / 2; head.add(d); }
  const faceC = document.createElement('canvas'); faceC.width = 256; faceC.height = 192;
  const faceT = new THREE.CanvasTexture(faceC); faceT.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.19, 0.02, 3, 0.03), [black, black, black, black, new THREE.MeshBasicMaterial({ map: faceT, toneMapped: false }), black]);
  face.position.set(0, 0.14, 0.137); head.add(face);

  // arms (bellows) with mitten hands; legs (bellows) with boots
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.7, 0); body.add(sh);
    const upper = new THREE.Mesh(accordion(0.3, 0.05, 5), black); upper.rotation.z = Math.PI; sh.add(upper);
    const hand = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.11, 0.08, 3, 0.035), white); hand.position.y = -0.34; sh.add(hand);
    sh.rotation.z = s * 0.12;
    arms.push(sh);
    const leg = new THREE.Mesh(accordion(0.22, 0.065, 4), black); leg.position.set(s * 0.1, 0.06, 0); body.add(leg);
    const boot = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.08, 0.2, 3, 0.035), white); boot.position.set(s * 0.1, 0.04, 0.03); body.add(boot);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- the face: eyes, blinks, moods, a talking mouth ----
  let mood = 'normal', blink = 0, nextBlink = 2, talk = 0, t = 0;
  function drawFace() {
    const g = faceC.getContext('2d'), W = 256, H = 192;
    g.fillStyle = '#0b1416'; g.fillRect(0, 0, W, H);
    g.strokeStyle = CYAN; g.fillStyle = CYAN; g.lineWidth = 10; g.lineCap = 'round';
    g.shadowColor = CYAN; g.shadowBlur = 14;
    const eye = (x, y) => {
      if (mood === 'dizzy') { g.beginPath(); for (let a = 0; a < 14; a += 0.2) { const r = a * 2.3; g.lineTo(x + Math.cos(a + t * 6) * r, y + Math.sin(a + t * 6) * r); } g.stroke(); return; }
      const open = 1 - blink;
      if (mood === 'happy') { g.beginPath(); g.arc(x, y + 10, 26, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); return; }
      g.beginPath(); g.ellipse(x, y, 24, Math.max(3, 30 * open), 0, 0, 7); g.fill();
      if (open > 0.4) { g.fillStyle = '#0b1416'; g.beginPath(); g.arc(x + 7, y - 8, 7, 0, 7); g.fill(); g.fillStyle = CYAN; }
      if (mood === 'worried') { g.beginPath(); g.moveTo(x - 26, y - 44 + (x < 128 ? 10 : 0)); g.lineTo(x + 26, y - 44 + (x < 128 ? 0 : 10)); g.stroke(); }
    };
    eye(80, 84); eye(176, 84);
    const m = talk > 0 ? 6 + Math.abs(Math.sin(t * 18)) * 16 : 0;
    g.beginPath();
    if (m) g.ellipse(128, 150, 22, m * 0.6, 0, 0, 7);
    else if (mood === 'worried') { g.moveTo(104, 156); g.quadraticCurveTo(128, 144, 152, 156); }
    else { g.moveTo(104, 146); g.quadraticCurveTo(128, 160, 152, 146); }
    m ? g.fill() : g.stroke();
    g.shadowBlur = 0;
    faceT.needsUpdate = true;
  }
  drawFace();

  let lookTarget = null, pointing = false, faceT0 = 0, lastKey = '';
  const tmp = new THREE.Vector3();
  const off = engine.onFrame(dt => {
    t += dt;
    nextBlink -= dt;
    if (nextBlink <= 0) { blink = Math.min(1, blink + dt * 14); if (blink >= 1) nextBlink = -0.08; }
    if (nextBlink < -0.07) { blink = Math.max(0, blink - dt * 14); if (blink === 0) nextBlink = 2 + Math.random() * 3; }
    talk = audio?.speaking?.speaker === 'bumper' ? 1 : 0;
    body.position.y = Math.sin(t * 1.6) * 0.012;                                // idle breathing bob
    head.rotation.z = Math.sin(t * 0.9) * 0.04 + (mood === 'worried' ? 0.12 : 0);
    if (lookTarget) {                                                          // turn the head toward the student
      root.updateMatrixWorld();
      head.parent.worldToLocal(tmp.copy(typeof lookTarget === 'function' ? lookTarget() : lookTarget));
      const yaw = Math.atan2(tmp.x - head.position.x, tmp.z - head.position.z);
      head.rotation.y += (Math.max(-0.9, Math.min(0.9, yaw)) - head.rotation.y) * Math.min(1, dt * 3);
    }
    arms[1].rotation.x += ((pointing ? -1.45 : 0) - arms[1].rotation.x) * Math.min(1, dt * 4);
    arms[0].rotation.x = Math.sin(t * 1.6 + 1) * 0.05;
    if (talk) arms[0].rotation.z = -0.12 - Math.abs(Math.sin(t * 3)) * 0.18;
    // redraw the face only when it changes (a canvas upload per frame is costly on the headset)
    faceT0 += dt;
    const key = `${mood}|${blink.toFixed(1)}|${talk}`;
    if (key !== lastKey || ((talk || mood === 'dizzy') && faceT0 > 0.06)) { lastKey = key; faceT0 = 0; drawFace(); }
  });

  root.userData = {
    setMood(m) { mood = m; },
    lookAt(v) { lookTarget = v; },
    point(on) { pointing = on; },
    dispose() { off(); },
  };
  return root;
}
