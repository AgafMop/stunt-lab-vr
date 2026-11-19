// The stunt set: desert ground, braking strip with ruler + gate, director's tower, race track, cars.
// Placeholder geometry in code with the node-name contract the Blender build will keep (milestone 5):
//   ST_tower, ST_pit (stations; userData.yaw = facing, yaw 0 looks toward -z), A_board, A_radar, A_clapper,
//   STRIP_gate, STRIP_ruler. Coordinates: three.js, metres, y up. Cars: heading 0 faces +z (see carSim.js).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { TRACK_DEF, buildTrack } from '../game/track.js';
import * as L from '../world/layout.js';
import { loadTerrain } from '../world/terrain.js';
import { createSky } from '../world/sky.js';
import { createScatter } from '../world/scatter.js';
import { createDust } from '../world/dust.js';
import { createTrack3d } from '../world/track3d.js';

export const BUILT = { set: false };      // flip when blender/build_set.py has written assets/set.glb

export const DECK_Y = L.DECK_Y;           // tower deck height (layout: src/world/layout.js)
export const STRIP = L.STRIP;
export const TRACK_ORIGIN = new THREE.Vector3(L.TRACK_ORIGIN.x, L.TRACK_ORIGIN.y, L.TRACK_ORIGIN.z);   // where track.js (0,0) sits

const mat = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

export async function loadStuntSet(engine) {
  // light world for the browser tests (software GL renders the terrain shader at ~1.5 s/frame): flat ground + sky,
  // no shadow map, scatter or dust. ?test defaults to it; ?world=full forces the real world (art review: look.spec.js).
  const q = new URLSearchParams(location.search);
  const lite = q.get('world') === 'lite' || (q.has('test') && q.get('world') !== 'full');
  const { scene, renderer } = engine;
  let env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;   // replaced by the sky below
  const hazeCol = new THREE.Color(...L.PALETTE.haze);
  scene.background = hazeCol.clone();
  scene.fog = new THREE.Fog(hazeCol, 300, 4200);                   // props only; the terrain has its own haze
  engine.camera.far = 8000; engine.camera.near = 0.04; engine.camera.updateProjectionMatrix();
  scene.add(new THREE.HemisphereLight(0xe8c0b8, 0xa05a34, 1.7));      // warm sky + red-sand bounce on the shaded sides
  const sun = new THREE.DirectionalLight(new THREE.Color(...L.PALETTE.sun), 2.6);
  // long low-sun shadows of the set on the flat play area: one 2048 map around the tower and the strip
  // (lab.focusShadow(x, z) moves it, e.g. to follow the race car)
  renderer.shadowMap.enabled = !lite; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = !lite; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 1, far: 900 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  const focusShadow = (x, z) => { x = Math.round(x / 8) * 8; z = Math.round(z / 8) * 8;   // snapped: no shimmer while following
    if (sun.target.position.x === x && sun.target.position.z === z) return;
    sun.target.position.set(x, 0, z); sun.position.set(x + L.SUN_DIR[0] * 400, L.SUN_DIR[1] * 400, z + L.SUN_DIR[2] * 400); sun.target.updateMatrixWorld(); };
  focusShadow(25, -12);
  scene.add(sun, sun.target);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(640, 730), new THREE.ShadowMaterial({ color: 0x3a1206, opacity: 0.5,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.set(-160, 0.003, -315); catcher.receiveShadow = true; catcher.name = 'shadowCatcher';

  const root = new THREE.Group(); root.name = 'set';
  const world = new THREE.Group(); world.name = 'world';
  root.add(world);
  const anchors = {}, stationNodes = {};
  const empty = (parent, name, [x, y, z], yaw) => {
    const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z);
    if (yaw != null) o.userData.yaw = yaw;
    parent.add(o);
    if (name.startsWith('ST_')) stationNodes[name.slice(3)] = o; else anchors[name] = o;
    return o;
  };
  const mesh = (parent, geo, m, [x, y, z] = [0, 0, 0], name) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (name) o.name = name; parent.add(o); return o;
  };

  // ground: the desert world (terrain + sky)
  try {
    if (lite) throw new Error('light world');
    const terrain = await loadTerrain(engine);
    root.add(terrain);
    createSky(engine, root);
    if (!lite) { root.add(createScatter(engine)); root.add(catcher); createDust(engine, root); }
  } catch (e) {
    if (!lite) console.warn('terrain unavailable, flat ground', e);
    createSky(engine, root);
    const ground = mesh(world, new THREE.PlaneGeometry(1400, 1400), mat(0xc98a52), [0, 0, 0], 'ground');
    ground.rotation.x = -Math.PI / 2;
  }
  const paint = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const stopLine = mesh(world, new THREE.PlaneGeometry(0.45, STRIP.width - 0.4), paint, [STRIP.endX - 3, 0.012, STRIP.z], 'stopLineEnd');
  stopLine.rotation.x = -Math.PI / 2; stopLine.receiveShadow = true;
  const stop = mesh(world, new THREE.PlaneGeometry(5.2, 2.2), new THREE.MeshStandardMaterial({ map: paintedText('STOP'), transparent: true, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), [STRIP.endX - 7, 0.012, STRIP.z], 'stopPaint');
  stop.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); stop.receiveShadow = true;   // reads from a car driving toward the cliff (+x), like the film

  // ---- braking strip + ruler + gate ----
  const stripLen = STRIP.endX - STRIP.startX;
  const asphalt = mat(0xffffff, 0.92); asphalt.color.setRGB(1.75, 1.72, 1.66);   // sun-bleached, like the circuit
  asphalt.map = new THREE.TextureLoader().load('assets/world/tex/asphalt_02_diff.jpg');
  asphalt.map.colorSpace = THREE.SRGBColorSpace; asphalt.map.wrapS = asphalt.map.wrapT = THREE.RepeatWrapping;
  asphalt.map.repeat.set(stripLen / 4, STRIP.width / 4); asphalt.map.anisotropy = 8;
  asphalt.polygonOffset = true; asphalt.polygonOffsetFactor = -2; asphalt.polygonOffsetUnits = -4;   // never flickers against the ground
  const strip = mesh(world, new THREE.PlaneGeometry(stripLen, STRIP.width), asphalt,
    [(STRIP.startX + STRIP.endX) / 2, 0.01, STRIP.z], 'STRIP_asphalt');
  strip.receiveShadow = true;
  { // road paint like the film: white edge lines, dashed yellow centre line (the ruler ticks stay on the near edge)
    const lines = [], dash = [];
    for (const side of [-1, 1]) { const g = new THREE.PlaneGeometry(stripLen, 0.12); g.rotateX(-Math.PI / 2); g.translate((STRIP.startX + STRIP.endX) / 2, 0.014, STRIP.z + side * (STRIP.width / 2 - 0.15)); lines.push(g); }
    for (let x = STRIP.startX + 2; x < STRIP.endX - 12; x += 6) { const g = new THREE.PlaneGeometry(3, 0.12); g.rotateX(-Math.PI / 2); g.translate(x + 1.5, 0.014, STRIP.z - 0.9); dash.push(g); }
    const pm = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    mesh(world, mergeGeometries(lines), pm(0xefe9dd), [0, 0, 0], 'stripEdges').receiveShadow = true;
    mesh(world, mergeGeometries(dash), pm(0xe3b23c), [0, 0, 0], 'stripCentre').receiveShadow = true;
  }
  strip.rotation.x = -Math.PI / 2;
  const ticks = [];
  for (let m = 0; m <= STRIP.rulerM; m += 0.5) {
    const major = m % 5 === 0, mid = !major && m % 1 === 0;
    const g = new THREE.PlaneGeometry(major ? 0.12 : 0.05, major ? 2.2 : mid ? 1.2 : 0.6);
    g.rotateX(-Math.PI / 2); g.translate(STRIP.gateX + m, 0.02, STRIP.z + STRIP.width / 2 - (major ? 1.1 : mid ? 0.6 : 0.3));
    ticks.push(g);
  }
  const ruler = mesh(world, mergeGeometries(ticks), new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), [0, 0, 0], 'STRIP_ruler');
  ruler.userData.pickable = true;
  // number signs every 10 m on the far side, sized for the tower view (≈ 1.4° letter height)
  const towerEye = new THREE.Vector3(0, DECK_Y + 1.17, -1.4);
  for (let m = 0; m <= STRIP.rulerM; m += 10) {
    const pos = new THREE.Vector3(STRIP.gateX + m, 0, STRIP.z - STRIP.width / 2 - 1.5);
    const d = pos.distanceTo(towerEye), h = Math.max(0.9, 0.0244 * d * 2.2);
    const sign = numberSign(String(m), h);
    sign.position.copy(pos).setY(h / 2 + 0.6);
    sign.lookAt(towerEye.x, sign.position.y, towerEye.z);
    world.add(sign);
  }
  const gate = new THREE.Group(); gate.name = 'STRIP_gate'; gate.position.set(STRIP.gateX, 0, STRIP.z); world.add(gate);
  for (const s of [-1, 1]) mesh(gate, new THREE.BoxGeometry(0.2, 2.4, 0.2), mat(0x222222), [0, 1.2, s * (STRIP.width / 2 + 0.4)]);
  const laser = mesh(gate, new THREE.BoxGeometry(0.04, 0.04, STRIP.width + 0.8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }), [0, 0.6, 0]);
  laser.name = 'laser';

  // ---- director's tower (deck at DECK_Y, facing the strip = -z) ----
  await loadCarModel();
  const tower = new THREE.Group(); tower.name = 'tower'; root.add(tower);   // stays visible in the RC view
  mesh(tower, new THREE.BoxGeometry(4, 0.2, 4), mat(0x8b6b4a), [0, DECK_Y - 0.1, 0], 'deck');
  const legs = [];
  for (const x of [-1.8, 1.8]) for (const z of [-1.8, 1.8]) { const g = new THREE.BoxGeometry(0.2, DECK_Y, 0.2); g.translate(x, DECK_Y / 2 - 0.2, z); legs.push(g); }
  { const g = new THREE.BoxGeometry(4, 0.08, 0.06); g.translate(0, DECK_Y + 0.95, 1.95); legs.push(g); }          // back rail
  { const g = new THREE.BoxGeometry(4, 0.06, 0.06); g.translate(0, DECK_Y + 0.4, -1.95); legs.push(g); }           // low front rail: below the sightline to the strip
  mesh(tower, mergeGeometries(legs), mat(0x5b4430), [0, 0, 0], 'towerFrame');
  const chair = new THREE.Group(); chair.name = 'chair'; chair.position.set(0, DECK_Y, -1.25); tower.add(chair);
  mesh(chair, new THREE.BoxGeometry(0.5, 0.05, 0.45), mat(0x2d2d2d), [0, 0.45, 0]);
  mesh(chair, new THREE.BoxGeometry(0.5, 0.45, 0.04), mat(0x2d2d2d), [0, 0.7, 0.23]);
  const desk = mesh(tower, new THREE.BoxGeometry(1.2, 0.05, 0.3), mat(0x6b4f36), [0, DECK_Y + 0.62, -1.7], 'desk');   // narrow & low: never hides the strip
  void desk;
  // the Blender-built set (blender/build_set.py → assets/set.glb) replaces the placeholder tower when it loads
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/set.glb');
    for (const name of ['deck', 'towerFrame', 'desk']) tower.getObjectByName(name)?.removeFromParent();
    chair.clear();
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material.name === 'M_lamp') o.material.toneMapped = false; } });
    gltf.scene.name = 'SET'; tower.add(gltf.scene);
  } catch (e) { console.warn('set.glb unavailable, placeholder tower', e); }
  empty(root, 'ST_tower', [0, DECK_Y, -1.4], 0).userData.pitch = -0.42;   // desktop: look down at the strip
  empty(root, 'A_board', [0, DECK_Y + 1.02, -2.6], 0);
  empty(root, 'A_radar', [-0.9, DECK_Y + 0.93, -2.4], 0);         // under the task card (9° up, 44° left)
  empty(root, 'A_clapper', [0.35, DECK_Y + 0.65, -1.7]);

  // ---- race track ----
  const track = buildTrack(TRACK_DEF);
  const track3d = createTrack3d(track, { full: true });
  track3d.position.copy(TRACK_ORIGIN);
  world.add(track3d);
  const st = track.sample(0);
  empty(root, 'ST_pit', [TRACK_ORIGIN.x + st.x + st.tz * 8.5, 0, TRACK_ORIGIN.z + st.z - st.tx * 8.5], 0);   // beside the start line (inside the banner wall), facing the track

  // reflections of THIS sky (sunset gold, violet zenith) instead of a grey studio: car paint, glass, the wet corner
  const dome = root.getObjectByName('sky');
  if (dome) {
    const m = dome.material.clone();                                   // the sun disc clamped: no Inf in the half-float env (it blacked out the bloom)
    m.uniforms = dome.material.uniforms;
    m.fragmentShader = m.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = vec4(min(c, vec3(1.6)), 1.0);');
    if (m.fragmentShader === dome.material.fragmentShader) console.warn('sky env: clamp not applied');
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(dome.geometry, m));
    env = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.02, 0.1, 1000).texture;
  }
  SKY_ENV = env;
  scene.add(root);
  root.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.material.envMap = env; o.material.envMapIntensity = o.name === 'trackAsphalt' ? 0.7 : 0.45; } });

  return {
    root, world, tower, anchors, stationNodes, discs: {}, env, track, track3d, focusShadow, sun,
    strip: {
      gate, ruler,
      rulerZero: new THREE.Vector3(STRIP.gateX, 0, STRIP.z),
      dir: new THREE.Vector3(1, 0, 0),
      markAt(m) { const o = new THREE.Object3D(); o.position.set(STRIP.gateX + m, 0, STRIP.z); return o; },
    },
    makeCar,
  };
}

/** Worn road paint lettering on transparent canvas. */
function paintedText(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 216;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(244,239,230,0.95)'; g.font = 'bold 190px Heebo, "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 116);
  g.globalCompositeOperation = 'destination-out';                       // wear
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * 512, Math.random() * 216, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function numberSign(text, h) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#1d1d1d'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
  g.fillStyle = '#1d1d1d'; g.font = 'bold 150px Heebo, "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 138);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.name = 'sign_' + text;
  return m;
}

// the Blender-built car (blender/build_car.py → assets/car.glb), loaded once by loadCarModel(); makeCar() clones it
// + its far version for the race opponents (blender/build_car_lo.py → assets/car_lo.glb: no interior, ≈ 4 K triangles)
let CAR_MODEL = null, CAR_LO = null, SKY_ENV = null;
export const CAR_LOD_DIST = 12;        // m: nearer than this an opponent shows the full car (desktop only)
export async function loadCarModel() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  try { CAR_MODEL = (await loader.loadAsync('assets/car.glb')).scene; }
  catch (e) { console.warn('car.glb unavailable, box car', e); }
  try { CAR_LO = (await loader.loadAsync('assets/car_lo.glb')).scene; }
  catch (e) { console.warn('car_lo.glb unavailable, opponents use the full car', e); }
}

/** Car paint (the black racing stripes are their own material in the model: M_stripe). */
function paintMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.3, envMap: SKY_ENV, envMapIntensity: 0.9 });
}

/** A stunt car. Children: 'seat' (driver eye), 'seatP' (passenger eye), 'wheel' (steering wheel),
 *  'frontWheel' (front axle on the ground — what the student reads on the ruler). Faces +z at rotation.y = 0.
 *  Its wheels roll by the distance it moves (whoever moves it). */
export function makeCar(color = 0xf07a1a, { lod = false, lo = false } = {}) {
  const car = new THREE.Group(); car.name = 'car';
  if (CAR_MODEL) {
    const paint = paintMaterial(color), wheels = [];
    // lod: an opponent — THREE.LOD shows the full car near the viewer and the light one beyond CAR_LOD_DIST
    // lo: always the light car (headset rivals)
    const m = lo && CAR_LO ? CAR_LO.clone(true) : lod && CAR_LO ? new THREE.LOD() : CAR_MODEL.clone(true);
    if (m.isLOD) { m.addLevel(CAR_MODEL.clone(true), 0); m.addLevel(CAR_LO.clone(true), CAR_LOD_DIST); }
    m.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const mn = o.material.name;
      if (mn === 'M_paint') o.material = paint;
      else if (SKY_ENV && o.material.isMeshStandardMaterial && !o.material.envMap) { o.material.envMap = SKY_ENV; o.material.envMapIntensity = mn === 'M_chrome' ? 1.2 : 0.6; }
      if (mn === 'M_lamp' || mn === 'M_tail') o.material.toneMapped = false;
      if (mn === 'M_glass') { o.castShadow = false; o.material.roughness = 0.05; o.material.opacity = 0.3; }
    });
    // the far car has no interior: darker glass so it never reads as an empty shell
    const loObj = m.isLOD ? m.levels[1].object : lo && CAR_LO ? m : null;
    if (loObj) loObj.traverse(o => { if (o.isMesh && o.material.name === 'M_glass') { o.material.opacity = 0.88; o.material.color.set(0x0c1016); } });
    // in the driver's seat the tinted glass would darken the whole view: hidden there (the view is through it anyway)
    const glass = m.getObjectByName('CAR_glass');
    car.userData.setInterior = inside => { if (glass) glass.visible = !inside; };
    m.traverse(o => { if (/^CAR_wheel_(FL|FR|RL|RR)$/.test(o.name)) wheels.push(o); });   // both levels' wheels roll
    car.add(m); car.userData.built = true;
    // roll the wheels: once per rendered frame, by the distance moved along the car's heading
    const last = new THREE.Vector3(), p = new THREE.Vector3(), fwd = new THREE.Vector3();
    let frame = -1, init = false;
    const roll = renderer => {
      if (renderer.info.render.frame === frame) return; frame = renderer.info.render.frame;
      car.getWorldPosition(p);
      if (init) {
        fwd.set(0, 0, 1).applyQuaternion(car.getWorldQuaternion(new THREE.Quaternion()));
        const d = p.clone().sub(last).dot(fwd) / (car.getWorldScale(new THREE.Vector3()).x || 1);
        if (Math.abs(d) < 5) for (const w of wheels) w.rotation.x += d / 0.37;
      }
      last.copy(p); init = true;
    };
    m.traverse(o => { if (o.isMesh && o.name.startsWith('CAR_paint')) o.onBeforeRender = roll; });
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), mat(color, 0.35, 0.3)); body.position.y = 0.55; car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.9), mat(0x1c1c22, 0.2, 0.4)); cabin.position.set(0, 1.07, -0.3); car.add(cabin);
    const wheels = [];
    for (const x of [-0.85, 0.85]) for (const z of [-1.35, 1.35]) { const g = new THREE.CylinderGeometry(0.33, 0.33, 0.28, 14); g.rotateZ(Math.PI / 2); g.translate(x, 0.33, z); wheels.push(g); }
    car.add(new THREE.Mesh(mergeGeometries(wheels), mat(0x151515)));
  }
  const seat = new THREE.Object3D(); seat.name = 'seat'; seat.position.set(0.38, 1.12, -0.35); car.add(seat);
  const seatP = new THREE.Object3D(); seatP.name = 'seatP'; seatP.position.set(-0.38, 1.12, -0.35); car.add(seatP);
  const steer = car.getObjectByName('CAR_steer');                     // the model's own steering wheel (same pose)
  if (steer) steer.name = 'wheel';
  else {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 28), mat(0x111111, 0.5)); wheel.name = 'wheel';
    wheel.position.set(0.38, 0.8, 0.1); wheel.rotation.x = -0.45; car.add(wheel);   // faces the driver (-z side)
  }
  const front = new THREE.Object3D(); front.name = 'frontWheel'; front.position.set(0, 0, 1.35); car.add(front);
  return car;
}
