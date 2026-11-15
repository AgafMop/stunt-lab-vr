// Loads the Blender-built room (assets/lab.glb + lab_lightmap.webp + props.glb) or, until those exist, builds a
// placeholder room in code with the SAME node-name contract, so chapters never care which one they got:
//   A_*  anchors (where boards/props go)      ST_*  station viewpoints (userData.yaw = facing)
//   TP_* teleport discs (one per station)     P_*   movable props (lab.props)
//   LAB_static  merged, lightmapped shell (UV1) — also the collision set for clearance.js
//   LAB_detail  small non-baked detail meshes  — also collision
import * as THREE from 'three';
import { glassify } from './looks.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const TUNE = {
  lightMapIntensity: 2 * Math.PI * 0.22,  // tune by eye against ACES; bakes are saved at 0.5 scale for headroom
  staticEnv: 0.08, detailEnv: 0.55, propEnv: 0.9,
};

// Which Blender outputs exist yet. Flip each to true once blender/build_*.py has written it to assets/
// (until then the placeholder below is used, and nothing 404s in the console — the e2e tests fail on console errors).
export const BUILT = { lab: false, props: false, lightmap: false };

// where each prop sits: [anchor, offset (three coords, m), yaw]
const PLACE = {
  P_beaker: ['A_beaker'], P_goggles: ['A_goggles'],
};

export async function loadLab(engine, base = 'assets/') {
  const { scene, renderer } = engine;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const tex = new THREE.TextureLoader();
  const [lab, props, lightmap] = await Promise.all([
    BUILT.lab ? loader.loadAsync(base + 'lab.glb') : null,
    BUILT.props ? loader.loadAsync(base + 'props.glb') : null,
    BUILT.lightmap ? tex.loadAsync(base + 'lab_lightmap.webp') : null,
  ]);

  // reflections: set envMap PER MATERIAL. With scene.environment, three r163+ ignores material.envMapIntensity and uses
  // scene.environmentIntensity for everything — the whole room then glows with the env map and looks washed out.
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const withEnv = (m, k) => { m.envMap = env; m.envMapIntensity = k; };
  scene.background = new THREE.Color(0x0b0f18);

  const root = lab ? lab.scene : placeholderRoom();
  const propRoot = props ? props.scene : placeholderProps();
  if (lightmap) { lightmap.flipY = false; lightmap.channel = 1; lightmap.colorSpace = THREE.SRGBColorSpace; }

  const anchors = {}, stationNodes = {}, discs = {};
  root.traverse(o => {
    if (o.name.startsWith('A_')) anchors[o.name] = o;
    else if (o.name.startsWith('ST_')) stationNodes[o.name.slice(3)] = o;
    else if (o.name.startsWith('TP_')) discs[o.name.slice(3)] = o;
    if (!o.isMesh) return;
    // multi-material meshes come out of glTF split as children (LAB_static_1, _2 …): walk up to the LAB_ parent,
    // or the lightmap is silently never applied
    let p = o; while (p && !p.name.startsWith('LAB_')) p = p.parent;
    const group = p?.name.replace(/_\d+$/, '');
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (group === 'LAB_static') { if (lightmap) { m.lightMap = lightmap; m.lightMapIntensity = TUNE.lightMapIntensity; } withEnv(m, TUNE.staticEnv); }
      else withEnv(m, TUNE.detailEnv);
    }
  });
  scene.add(root);
  if (!lightmap) {             // no bake yet: plain lights so the placeholder reads
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302820, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(2, 4, 3); scene.add(d);
  }

  const P = {};
  propRoot.traverse(o => { if (o.name.startsWith('P_')) P[o.name] = o; });
  for (const [name, o] of Object.entries(P)) {
    o.traverse(m => {
      if (!m.isMesh) return;
      withEnv(m.material, TUNE.propEnv);
      if (o.userData.glass) {
        Object.assign(m.material, { transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.8 });
        glassify(m.material); m.renderOrder = 2;
      }
    });
    const pl = PLACE[name], a = pl && anchors[pl[0]];
    if (!a) continue;
    o.position.copy(a.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...(pl[1] || [0, 0, 0])));
    o.rotation.set(0, pl[2] ?? 0, 0);
    o.userData.home = { pos: o.position.clone(), quat: o.quaternion.clone() };   // tools float back here when released
    scene.add(o);
  }
  return { root, anchors, stationNodes, discs, props: P, env };   // env: give it (envMap) to materials you create later
}

// ---------- placeholder (replace with blender/build_lab.py output) ----------
function placeholderRoom() {
  const root = new THREE.Group(); root.name = 'lab';
  const shell = new THREE.Group(); shell.name = 'LAB_static'; root.add(shell);
  const mat = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const box = (name, [sx, sy, sz], [x, y, z], m, parent = shell) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.name = name; o.position.set(x, y, z); parent.add(o); return o;
  };
  const W = 7, D = 5.4, H = 3;
  box('floor', [W, 0.02, D], [0, -0.01, 0], mat(0x2b3038));
  box('ceiling', [W, 0.02, D], [0, H, 0], mat(0x8a929c));
  box('wallN', [W, H, 0.1], [0, H / 2, -D / 2], mat(0x5d6875));
  box('wallS', [W, H, 0.1], [0, H / 2, D / 2], mat(0x5d6875));
  box('wallW', [0.1, H, D], [-W / 2, H / 2, 0], mat(0x55606c));
  box('wallE', [0.1, H, D], [W / 2, H / 2, 0], mat(0x55606c));
  // seated bench: top at 0.72 m (seated.js BENCH_TOP), in front of the bench station
  box('bench', [1.8, 0.06, 0.7], [0, 0.69, -1.4], mat(0xb9c2cc, 0.4));
  box('benchBase', [1.7, 0.66, 0.6], [0, 0.33, -1.4], mat(0x8d97a5, 0.6, 0.3));
  const empty = (name, [x, y, z], yaw) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); if (yaw != null) o.userData.yaw = yaw; root.add(o); return o; };
  // stations: the viewpoint (floor point under the seated head) and its facing (yaw 0 = looking toward -z)
  empty('ST_bench', [0, 0, -0.55], 0);
  empty('ST_entry', [0, 0, 1.6], 0);
  // anchors on the bench top
  empty('A_beaker', [0.2, 0.72, -1.35]);
  empty('A_goggles', [-0.55, 0.72, -1.3]);
  empty('A_board', [0, 1.3, -1.85], 0);
  // teleport discs
  for (const [id, x, z] of [['bench', 0, -0.55], ['entry', 0, 1.6]]) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshStandardMaterial({ color: 0x3cc4bc, emissive: 0x0e4844, transparent: true, opacity: 0.75 }));
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.01, z); d.name = 'TP_' + id; root.add(d);
  }
  return root;
}

function placeholderProps() {
  const root = new THREE.Group();
  const beaker = new THREE.Group(); beaker.name = 'P_beaker'; beaker.userData.glass = true;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.12, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  glass.position.y = 0.06; beaker.add(glass); root.add(beaker);
  const goggles = new THREE.Group(); goggles.name = 'P_goggles';
  const lens = new THREE.MeshStandardMaterial({ color: 0x6fd0ff, roughness: 0.1, transparent: true, opacity: 0.7 });
  for (const x of [-0.04, 0.04]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), lens); l.rotation.x = Math.PI / 2; l.position.set(x, 0.035, 0); goggles.add(l); }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 8, 32), new THREE.MeshStandardMaterial({ color: 0x222831 }));
  strap.rotation.x = Math.PI / 2; strap.position.y = 0.035; goggles.add(strap); root.add(goggles);
  return root;
}
