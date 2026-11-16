// The stunt set: desert ground, braking strip with ruler + gate, director's tower, race track, cars.
// Placeholder geometry in code with the node-name contract the Blender build will keep (milestone 5):
//   ST_tower, ST_pit (stations; userData.yaw = facing, yaw 0 looks toward -z), A_board, A_radar, A_clapper, A_table,
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

export const BUILT = { set: false };      // flip when blender/build_set.py has written assets/set.glb

export const DECK_Y = L.DECK_Y;           // tower deck height (layout: src/world/layout.js)
export const STRIP = L.STRIP;
export const TRACK_ORIGIN = new THREE.Vector3(L.TRACK_ORIGIN.x, L.TRACK_ORIGIN.y, L.TRACK_ORIGIN.z);   // where track.js (0,0) sits
export const TABLE = { scale: 1 / 70 };

const mat = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

export async function loadStuntSet(engine) {
  // light world for the browser tests (software GL renders the terrain shader at ~1.5 s/frame): flat ground + sky,
  // no shadow map, scatter or dust. ?test defaults to it; ?world=full forces the real world (art review: look.spec.js).
  const q = new URLSearchParams(location.search);
  const lite = q.get('world') === 'lite' || (q.has('test') && q.get('world') !== 'full');
  const { scene, renderer } = engine;
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
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
  const focusShadow = (x, z) => { sun.target.position.set(x, 0, z); sun.position.set(x + L.SUN_DIR[0] * 400, L.SUN_DIR[1] * 400, z + L.SUN_DIR[2] * 400); sun.target.updateMatrixWorld(); };
  focusShadow(25, -12);
  scene.add(sun, sun.target);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShadowMaterial({ color: 0x3a1206, opacity: 0.5,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.set(25, 0.003, -12); catcher.receiveShadow = true; catcher.name = 'shadowCatcher';

  const root = new THREE.Group(); root.name = 'set';
  const world = new THREE.Group(); world.name = 'world';            // hidden in the tabletop RC view
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

  // ground: the desert world (terrain + sky stay visible in every view, also the tabletop RC view)
  try {
    if (lite) throw new Error('light world');
    const terrain = await loadTerrain(engine);
    root.add(terrain);
    createSky(engine);
    if (!lite) { root.add(createScatter(engine)); root.add(catcher); createDust(engine); }
  } catch (e) {
    if (!lite) console.warn('terrain unavailable, flat ground', e);
    createSky(engine);
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
  const asphalt = mat(0x9a9aa2, 0.95);
  asphalt.map = new THREE.TextureLoader().load('assets/world/tex/asphalt_02_diff.jpg');
  asphalt.map.colorSpace = THREE.SRGBColorSpace; asphalt.map.wrapS = asphalt.map.wrapT = THREE.RepeatWrapping;
  asphalt.map.repeat.set(stripLen / 4, STRIP.width / 4); asphalt.map.anisotropy = 8;
  asphalt.polygonOffset = true; asphalt.polygonOffsetFactor = -2; asphalt.polygonOffsetUnits = -4;   // never flickers against the ground
  const strip = mesh(world, new THREE.PlaneGeometry(stripLen, STRIP.width), asphalt,
    [(STRIP.startX + STRIP.endX) / 2, 0.01, STRIP.z], 'STRIP_asphalt');
  strip.receiveShadow = true;
  strip.rotation.x = -Math.PI / 2;
  const ticks = [];
  for (let m = 0; m <= 120; m += 0.5) {
    const major = m % 5 === 0, mid = !major && m % 1 === 0;
    const g = new THREE.PlaneGeometry(major ? 0.12 : 0.05, major ? 2.2 : mid ? 1.2 : 0.6);
    g.rotateX(-Math.PI / 2); g.translate(STRIP.gateX + m, 0.02, STRIP.z + STRIP.width / 2 - (major ? 1.1 : mid ? 0.6 : 0.3));
    ticks.push(g);
  }
  const ruler = mesh(world, mergeGeometries(ticks), new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), [0, 0, 0], 'STRIP_ruler');
  ruler.userData.pickable = true;
  // number signs every 10 m on the far side, sized for the tower view (≈ 1.4° letter height)
  const towerEye = new THREE.Vector3(0, DECK_Y + 1.17, -1.4);
  for (let m = 0; m <= 120; m += 10) {
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
  empty(root, 'A_radar', [-0.9, DECK_Y + 1.15, -2.4], 0);
  empty(root, 'A_clapper', [0.35, DECK_Y + 0.65, -1.7]);
  empty(root, 'A_table', [0, DECK_Y + 0.35, -2.9]);

  // ---- race track ----
  const track = buildTrack(TRACK_DEF);
  const track3d = trackMesh(track);
  track3d.position.copy(TRACK_ORIGIN);
  world.add(track3d);
  const st = track.sample(0);
  empty(root, 'ST_pit', [TRACK_ORIGIN.x + st.x + 8, 0, TRACK_ORIGIN.z + st.z], Math.PI);   // beside the start, facing along +z

  // ---- tabletop copy of the track for the RC view (hidden until that view is on) ----
  const table = new THREE.Group(); table.name = 'table'; table.visible = false;
  anchors.A_table.add(table);
  mesh(table, new THREE.BoxGeometry(2.4, 0.04, 2.8), mat(0x6b4f36), [0, -0.02, 0], 'tableTop');
  const mini = trackMesh(track); mini.name = 'miniTrack';
  mini.scale.setScalar(TABLE.scale);
  // centre the loop on the table: track bounds x∈[-134,0], z∈[-34,134]
  mini.position.set(67 * TABLE.scale, 0.005, -50 * TABLE.scale);
  table.add(mini);

  scene.add(root);
  root.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.material.envMap = env; o.material.envMapIntensity = 0.3; } });

  return {
    root, world, tower, anchors, stationNodes, discs: {}, env, track, track3d, table, mini, focusShadow, sun,
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

/** The track as one ribbon mesh (vertex colours: wet section darker, white edge lines). Local to track.js coords. */
function trackMesh(track) {
  const half = track.def.width / 2, n = Math.ceil(track.length / 2);
  const pos = [], col = [], idx = [];
  const dry = new THREE.Color(0x45454c), wet = new THREE.Color(0x24303c), edge = new THREE.Color(0xeeeeee);
  const across = [-half - 0.4, -half, half, half + 0.4];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * track.length, p = track.sample(s);
    const isWet = s >= track.def.wet[0] && s <= track.def.wet[1];
    across.forEach((u, j) => {
      pos.push(p.x + p.tz * u, 0.015, p.z - p.tx * u);
      const c = j === 0 || j === 3 ? edge : isWet ? wet : dry;
      col.push(c.r, c.g, c.b);
    });
    if (i < n) for (let j = 0; j < 3; j++) {
      const a = i * 4 + j, b = a + 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  m.name = 'track';
  return m;
}

/** A stylised stunt car. Children: 'seat' (driver eye), 'seatP' (passenger eye), 'wheel' (steering wheel),
 *  'frontWheel' (front axle on the ground — what the student reads on the ruler). Faces +z at rotation.y = 0. */
export function makeCar(color = 0xf07a1a) {
  const car = new THREE.Group(); car.name = 'car';
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.2), mat(color, 0.35, 0.3)); body.position.y = 0.55; car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.9), mat(0x1c1c22, 0.2, 0.4)); cabin.position.set(0, 1.07, -0.3); car.add(cabin);
  const wheels = [];
  for (const x of [-0.85, 0.85]) for (const z of [-1.35, 1.35]) { const g = new THREE.CylinderGeometry(0.33, 0.33, 0.28, 14); g.rotateZ(Math.PI / 2); g.translate(x, 0.33, z); wheels.push(g); }
  car.add(new THREE.Mesh(mergeGeometries(wheels), mat(0x151515)));
  const seat = new THREE.Object3D(); seat.name = 'seat'; seat.position.set(0.38, 1.12, -0.35); car.add(seat);
  const seatP = new THREE.Object3D(); seatP.name = 'seatP'; seatP.position.set(-0.38, 1.12, -0.35); car.add(seatP);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 28), mat(0x111111, 0.5)); wheel.name = 'wheel';
  wheel.position.set(0.38, 0.8, 0.1); wheel.rotation.x = -0.45; car.add(wheel);   // faces the driver (-z side)
  const front = new THREE.Object3D(); front.name = 'frontWheel'; front.position.set(0, 0, 1.35); car.add(front);
  return car;
}
