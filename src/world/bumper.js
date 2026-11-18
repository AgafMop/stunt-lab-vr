// Bumper, the crash-test robot from the opening film: glossy white shells, black accordion bellows, yellow-and-black
// crash-test targets, mitten hands and a dark glass screen face with big cyan cartoon eyes (expressions: normal,
// happy, worried, dizzy; blinks; a mouth that talks while he speaks). ≈ 1.05 m tall, feet at the origin, faces +z.
// The model is built in Blender (blender/build_bumper.py → assets/bumper.glb), loaded once by loadBumperModel() and
// cloned per Bumper; without it the old procedural build below stands in.
//
// createBumper(engine, audio) → group; group.userData = {
//   setMood(m), lookAt(target | () => target), point(on)  (his right arm), sit(on)  (driver pose: thighs forward, shins
//   down, hands on a steering wheel), dispose(),
//   parts: { body, head, hips, arms, forearms, thighs, shins, anchors }   arrays are [left, right] (his own; left = +x)
//          and also carry .L / .R; anchors = { shoulder, chest, hip_L, hip_R } (seat-belt points, Object3Ds),
//   seat: { pos: [x, y, z], scale }   where to put him in the stunt car (car-local) once seated,
// }
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const WHITE = 0xf1f1ee, BLACK = 0x161618, CYAN = '#46e6f0';

// ---------------------------------------------------------------------------------------------------------------
// the Blender model
// ---------------------------------------------------------------------------------------------------------------
let MODEL = null, ENV = null;
// the seated pose, solved in build_bumper.py against the car's seat and wheel (the GLB carries its own copy)
const SIT_DEFAULT = {
  thigh: -1.64, shin: 1.39, body: 0.24, head: -0.12, stretch: 1.3,
  arm: { L: [-1.8, 0, -0.1], R: [-1.8, 0, 0.1] }, forearm: { L: [-0.1, 0, 0], R: [-0.1, 0, 0] },
  seat: { pos: [0.38, 0.232, -0.47], scale: 0.92 },
};
const ENV_K = { M_white: 0.75, M_grey: 1.0, M_yellow: 0.35, M_dark: 0.5, M_rubber: 0.35 };

/** Load assets/bumper.glb once (at boot, after the set: env = its sky reflections). Safe to skip: the fallback stands in. */
export async function loadBumperModel({ env = null, url = 'assets/bumper.glb' } = {}) {
  ENV = env;
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const m = gltf.scene.getObjectByName('BUMPER');
    if (!m) throw new Error('no BUMPER node');
    m.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const mt = o.material;
      if (mt?.isMeshStandardMaterial && ENV_K[mt.name] != null && env) { mt.envMap = env; mt.envMapIntensity = ENV_K[mt.name]; }
    });
    MODEL = m;
  } catch (e) { console.warn('bumper.glb unavailable, procedural Bumper', e); MODEL = null; }
  return MODEL;
}

function sitPose(model) {
  try { return { ...SIT_DEFAULT, ...JSON.parse(model.userData.sit) }; } catch { return SIT_DEFAULT; }
}

function fromModel(faceMat) {
  const m = MODEL.clone(true);
  const n = name => m.getObjectByName(name);
  const LR = (f) => { const a = [f('L'), f('R')]; a.L = a[0]; a.R = a[1]; return a; };
  const face = n('BUMPER_face');
  face.material = faceMat;
  const P = {
    model: m, body: n('BUMPER_body'), head: n('BUMPER_head'), hips: n('BUMPER_hips'),
    arms: LR(k => n(`BUMPER_arm_${k}`)), forearms: LR(k => n(`BUMPER_forearm_${k}`)),
    uppers: LR(k => n(`BUMPER_upper_${k}`)),
    thighs: LR(k => n(`BUMPER_thigh_${k}`)), shins: LR(k => n(`BUMPER_shin_${k}`)),
    anchors: { shoulder: n('BUMPER_belt_shoulder'), chest: n('BUMPER_belt_chest'), hip_L: n('BUMPER_belt_hip_L'), hip_R: n('BUMPER_belt_hip_R') },
  };
  const S = sitPose(m);
  const foreY = P.forearms.map(f => f.position.y);
  const REST_Z = [0.09, -0.09], REST_FORE = -0.12;               // arms hang slightly out, elbows soft
  P.arms.forEach((a, i) => { a.rotation.z = REST_Z[i]; });
  P.forearms.forEach(f => { f.rotation.x = REST_FORE; });
  P.restZ = REST_Z; P.restFore = REST_FORE;
  P.seat = S.seat;
  P.sit = on => {
    P.body.rotation.x = on ? S.body : 0;
    P.head.rotation.x = on ? S.head : 0;
    ['L', 'R'].forEach((k, i) => {
      P.thighs[i].rotation.set(on ? S.thigh : 0, 0, 0);
      P.shins[i].rotation.set(on ? S.shin : 0, 0, 0);
      if (on) P.arms[i].rotation.set(...S.arm[k]); else P.arms[i].rotation.set(0, 0, REST_Z[i]);
      if (on) P.forearms[i].rotation.set(...S.forearm[k]); else P.forearms[i].rotation.set(REST_FORE, 0, 0);
      P.uppers[i].scale.y = on ? S.stretch : 1;                    // the bellows stretch to reach the wheel
      P.forearms[i].position.y = foreY[i] * (on ? S.stretch : 1);
    });
  };
  return P;
}

// ---------------------------------------------------------------------------------------------------------------
// the procedural fallback (the first Bumper)
// ---------------------------------------------------------------------------------------------------------------
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

function procedural(faceMat) {
  const m = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.35, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: BLACK, roughness: 0.7 });
  const decal = new THREE.MeshBasicMaterial({ map: targetTexture(), transparent: true, toneMapped: true });
  const body = new THREE.Group(); m.add(body);

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
  const face = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.19, 0.02, 3, 0.03), [black, black, black, black, faceMat, black]);
  face.position.set(0, 0.14, 0.137); head.add(face);

  // arms (bellows) with mitten hands; legs (bellows) with boots
  const arms = [], legs = [];
  for (const s of [1, -1]) {                      // [left (+x), right (−x)]
    const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.7, 0); body.add(sh);
    const upper = new THREE.Mesh(accordion(0.3, 0.05, 5), black); upper.rotation.z = Math.PI; sh.add(upper);
    const hand = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.11, 0.08, 3, 0.035), white); hand.position.y = -0.34; sh.add(hand);
    sh.rotation.z = s * 0.12;
    arms.push(sh);
    const leg = new THREE.Mesh(accordion(0.22, 0.065, 4), black); leg.position.set(s * 0.1, 0.06, 0); body.add(leg);
    const boot = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.08, 0.2, 3, 0.035), white); boot.position.set(s * 0.1, 0.04, 0.03); body.add(boot);
    legs.push(leg, boot);
  }
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  arms.L = arms[0]; arms.R = arms[1];
  const none = () => { const a = []; a.L = a.R = undefined; return a; };
  const REST_Z = [0.12, -0.12];
  return {
    model: m, body, head, hips: null, arms, forearms: none(), uppers: none(), thighs: none(), shins: none(), anchors: {},
    restZ: REST_Z, restFore: 0, seat: { pos: [0.38, 0.28, -0.45], scale: 0.72 },
    sit(on) {                                     // legs hide in the footwell, hands forward to the wheel
      legs.forEach(o => { o.visible = !on; });
      arms.forEach((a, i) => a.rotation.set(on ? -1.2 : 0, 0, on ? -REST_Z[i] * 0.5 : REST_Z[i]));
    },
    dispose() {
      m.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      white.dispose(); black.dispose(); decal.map.dispose(); decal.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
export function createBumper(engine, audio) {
  const root = new THREE.Group(); root.name = 'bumper';

  // the face: a 256×192 canvas on dark glass (glossy: it reflects the sky; the eyes glow)
  const faceC = document.createElement('canvas'); faceC.width = 256; faceC.height = 192;
  const faceT = new THREE.CanvasTexture(faceC); faceT.colorSpace = THREE.SRGBColorSpace;
  let faceMat;
  if (MODEL) {
    faceT.flipY = false;                                           // glTF UVs: v = 0 at the top of the screen
    faceMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: faceT, roughness: 0.14,
      metalness: 0, envMap: ENV, envMapIntensity: 0.9, toneMapped: false });
  } else faceMat = new THREE.MeshBasicMaterial({ map: faceT, toneMapped: false });
  const P = MODEL ? fromModel(faceMat) : procedural(faceMat);
  root.add(P.model);
  const { body, head, arms, forearms } = P;
  const bodyY = body.position.y;

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

  let lookTarget = null, pointing = false, seated = false, faceT0 = 0, lastKey = '';
  const tmp = new THREE.Vector3();
  const [L, R] = [0, 1];
  const off = engine.onFrame(dt => {
    t += dt;
    nextBlink -= dt;
    if (nextBlink <= 0) { blink = Math.min(1, blink + dt * 14); if (blink >= 1) nextBlink = -0.08; }
    if (nextBlink < -0.07) { blink = Math.max(0, blink - dt * 14); if (blink === 0) nextBlink = 2 + Math.random() * 3; }
    talk = audio?.speaking?.speaker === 'bumper' ? 1 : 0;
    body.position.y = bodyY + Math.sin(t * 1.6) * (seated ? 0.005 : 0.012);   // idle breathing bob
    head.rotation.z = Math.sin(t * 0.9) * 0.04 + (mood === 'worried' ? 0.12 : 0);
    if (lookTarget) {                                                          // turn the head toward the student
      root.updateMatrixWorld();
      head.parent.worldToLocal(tmp.copy(typeof lookTarget === 'function' ? lookTarget() : lookTarget));
      const yaw = Math.atan2(tmp.x - head.position.x, tmp.z - head.position.z);
      head.rotation.y += (Math.max(-0.9, Math.min(0.9, yaw)) - head.rotation.y) * Math.min(1, dt * 3);
    }
    if (!seated) {                                                             // seated, the arms belong to the wheel (and the crash scene)
      const k = Math.min(1, dt * 4);
      arms[R].rotation.x += ((pointing ? -1.45 : 0) - arms[R].rotation.x) * k;           // his right arm points
      if (forearms[R]) forearms[R].rotation.x += ((pointing ? 0 : P.restFore) - forearms[R].rotation.x) * k;
      arms[L].rotation.x = Math.sin(t * 1.6 + 1) * 0.05;
      const z = talk ? P.restZ[L] + Math.abs(Math.sin(t * 3)) * 0.18 : P.restZ[L];     // talking: the left hand gestures
      arms[L].rotation.z += (z - arms[L].rotation.z) * Math.min(1, dt * 8);
    }
    // redraw the face only when it changes (a canvas upload per frame is costly on the headset)
    faceT0 += dt;
    const key = `${mood}|${blink.toFixed(1)}|${talk}`;
    if (key !== lastKey || ((talk || mood === 'dizzy') && faceT0 > 0.06)) { lastKey = key; faceT0 = 0; drawFace(); }
  });

  root.userData = {
    setMood(m) { mood = m; },
    lookAt(v) { lookTarget = v; },
    point(on) { pointing = on; },
    sit(on) { seated = !!on; P.sit(seated); },
    parts: { body, head, hips: P.hips, arms, forearms, thighs: P.thighs, shins: P.shins, anchors: P.anchors },
    seat: P.seat,
    dispose() { off(); faceT.dispose(); faceMat.dispose(); P.dispose?.(); },
  };
  return root;
}
