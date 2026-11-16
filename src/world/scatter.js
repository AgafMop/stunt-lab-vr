// Desert dressing from scatterFn.js as instanced meshes: faceted sandstone rocks and boulders, sage scrub and dry
// grass that sway in the wind, and a long soft shadow under each one pointing away from the low sun (the terrain's
// baked light is too coarse for small things). ≈ 9 draw calls.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { scatter } from './scatterFn.js';
import { SUN_DIR } from './layout.js';

function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function paint(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, g, b] = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function rockGeo(seed, flat = 0.62) {
  const r = rand(seed);
  let g = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.72 + r() * 0.5;
    p.setXYZ(i, p.getX(i) * k * (1 + r() * 0.25), p.getY(i) * k * flat, p.getZ(i) * k);
  }
  g = g.toNonIndexed(); g.computeVertexNormals();                    // faceted, like the film's stylised rocks
  g.translate(0, 0.25, 0);
  const base = [[0.86, 0.46, 0.27], [0.95, 0.60, 0.36], [0.78, 0.40, 0.25]][seed % 3];
  const f = rand(seed + 9);
  let face = 1;
  return paint(g, (x, y, z, i) => {
    if (i % 3 === 0) face = 0.85 + f() * 0.3;
    const ao = 0.62 + 0.38 * THREE.MathUtils.smoothstep(y, -0.1, 0.8);
    return base.map(v => v * face * ao);
  });
}

function shrubGeo(seed) {
  const r = rand(seed), parts = [];
  const tint = [[0.40, 0.42, 0.27], [0.48, 0.44, 0.28], [0.36, 0.38, 0.30]][seed % 3];
  for (let k = 0; k < 5; k++) {
    const s = 0.28 + r() * 0.22, a = r() * Math.PI * 2, d = r() * 0.35;
    const g = new THREE.IcosahedronGeometry(s, 0); g.deleteAttribute('uv');
    g.scale(1, 0.8, 1); g.translate(Math.cos(a) * d, s * 0.7 + r() * 0.2, Math.sin(a) * d);
    const k2 = 0.85 + r() * 0.3;
    parts.push(paint(g.toNonIndexed(), (x, y) => tint.map(v => v * k2 * (0.55 + 0.45 * Math.min(1, y / 0.7)))));
  }
  const g = mergeGeometries(parts); g.computeVertexNormals();
  return g;
}

function grassGeo(seed) {
  const r = rand(seed), pos = [];
  for (let k = 0; k < 7; k++) {
    const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.25, h = 0.35 + r() * 0.35, w = 0.035;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w;
    pos.push(px, 0, pz, -px, 0, -pz, dx * lean, h, dz * lean);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, (x, y) => [0.55 + y * 0.6, 0.40 + y * 0.45, 0.22 + y * 0.2]);
}

/** Soft elongated shadow: a quad from the object's foot along +x (rotated to the shadow direction per instance). */
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    const u = x / 127, v = (y - 31.5) / 31.5;
    const along = Math.pow(1 - u, 1.3), across = Math.max(0, 1 - v * v / (0.35 + 0.65 * (1 - u * 0.6)));
    img.data[(y * 128 + x) * 4 + 3] = Math.round(255 * along * across);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); return t;
}

function swayMaterial(mat, amount) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.time = mat.userData.time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      #else
        float ph = 0.0;
      #endif
      float sw = sin(time * 1.6 + ph) * 0.6 + sin(time * 3.7 + ph * 2.1) * 0.25;
      transformed.x += sw * ${amount.toFixed(3)} * transformed.y * transformed.y;
      transformed.z += sw * ${(amount * 0.6).toFixed(3)} * transformed.y * transformed.y;`);
  };
  mat.userData.time = { value: 0 };
  return mat;
}

export function createScatter(engine) {
  const group = new THREE.Group(); group.name = 'scatter';
  const items = scatter();
  const kinds = {
    rock: [0, 1, 2].map(v => rockGeo(11 + v)),
    boulder: [0, 1, 2].map(v => rockGeo(31 + v, 0.75)),
    slab: [0, 1, 2].map(v => rockGeo(41 + v, 0.22)),
    shrub: [0, 1, 2].map(v => shrubGeo(51 + v)),
    grass: [0, 1, 2].map(v => grassGeo(71 + v)),
  };
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const shrubMat = swayMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 0.06);
  const grassMat = swayMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.12);
  const mats = { rock: rockMat, boulder: rockMat, slab: rockMat, shrub: shrubMat, grass: grassMat };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  // one InstancedMesh per kind (variants merged into one geometry would need a group; keep 3 per kind, all small)
  for (const [kind, geos] of Object.entries(kinds)) {
    geos.forEach((geo, v) => {
      const list = items.filter(i => i.kind === kind && i.v === v);
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mats[kind], list.length);
      im.name = `scatter_${kind}${v}`;
      list.forEach((it, k) => {
        q.setFromAxisAngle(Y, it.rot); s.setScalar(it.s); p.set(it.x, it.y - 0.05 * it.s, it.z);
        im.setMatrixAt(k, m4.compose(p, q, s));
      });
      im.computeBoundingSphere();
      group.add(im);
    });
  }

  // long sunset shadows (rocks, boulders, shrubs)
  const sdir = Math.atan2(SUN_DIR[2], -SUN_DIR[0]);                     // rotation that turns local +x away from the sun
  const elev = Math.asin(SUN_DIR[1]), stretch = Math.min(3.2, 1 / Math.tan(elev));
  const casters = items.filter(i => i.kind !== 'grass');
  const sgeo = new THREE.PlaneGeometry(1, 1); sgeo.rotateX(-Math.PI / 2); sgeo.translate(0.5, 0, 0);
  const smat = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x2a0f08, transparent: true, opacity: 0.55, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const sh = new THREE.InstancedMesh(sgeo, smat, casters.length);
  sh.name = 'scatter_shadows'; sh.renderOrder = 1;
  casters.forEach((it, k) => {
    const h = it.kind === 'shrub' ? 1.0 : it.kind === 'boulder' ? 0.9 : it.kind === 'slab' ? 0.3 : 0.7;
    q.setFromAxisAngle(Y, sdir);
    s.set(it.s * (0.6 + h * stretch), 1, it.s * (it.kind === 'shrub' ? 1.4 : 1.7));
    p.set(it.x, it.y + 0.03, it.z);
    sh.setMatrixAt(k, m4.compose(p, q, s));
  });
  sh.computeBoundingSphere();
  group.add(sh);

  let time = 0;
  const off = engine.onFrame(dt => { time += dt; shrubMat.userData.time.value = grassMat.userData.time.value = time; });
  group.userData.dispose = off;
  return group;
}
