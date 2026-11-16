// The race track as built geometry (track.js coordinates; the caller places it at TRACK_ORIGIN or on the table):
// textured asphalt (darker and bluish on the wet corner), white edge lines, red-and-white kerbs on every corner,
// a chequered start line, and (full size only) painted tyre stacks on the outside of each corner.
// Right-hand loop: a positive offset u is the driver's left = the outside of every corner.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const OFF = (f, u) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });

/** Arc-length ranges [s0, s1] of the corners. */
export function cornerRanges(def) {
  const out = []; let s = 0;
  for (const [type, a, deg] of def.segments) {
    const len = type === 'S' ? a : a * deg * Math.PI / 180;
    if (type === 'R') out.push([s, s + len]);
    s += len;
  }
  return out;
}

function ribbon(track, u0, u1, y, step, colorAt, uvScale = 0) {
  const n = Math.ceil(track.length / step), pos = [], col = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * track.length, p = track.sample(s);
    for (const [j, u] of [u0, u1].entries()) {
      pos.push(p.x + p.tz * u, y, p.z - p.tx * u);
      const c = colorAt(s, j); col.push(c.r, c.g, c.b);
      uv.push(j, s * uvScale);
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function checker() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f2efe8'; g.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}

export function createTrack3d(track, { full = true } = {}) {
  const g = new THREE.Group(); g.name = full ? 'track' : 'miniTrack';
  const half = track.def.width / 2, [w0, w1] = track.def.wet, corners = cornerRanges(track.def);
  const inCorner = s => corners.some(([a, b]) => s >= a && s <= b);
  const dry = new THREE.Color(1, 1, 1), wet = new THREE.Color(0.42, 0.5, 0.62), white = new THREE.Color(0.95, 0.94, 0.9);
  const red = new THREE.Color(0.78, 0.08, 0.06);

  // asphalt
  const tex = new THREE.TextureLoader().load('assets/world/tex/asphalt_track_diff.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.repeat.set(2.5, 1);
  const asphalt = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.92, color: 0xb4b0ac, side: THREE.DoubleSide, ...OFF(-2, -4) });
  const road = new THREE.Mesh(ribbon(track, -half, half, 0.015, 2, s => (s >= w0 && s <= w1 ? wet : dry), 1 / 4), asphalt);
  road.name = full ? 'trackAsphalt' : 'miniAsphalt'; road.receiveShadow = true; g.add(road);
  // wet corner: a glossy film of water on top (reflects the sky a little)
  const sheen = new THREE.MeshStandardMaterial({ color: 0x8aa4c8, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.35, ...OFF(-3, -6) });
  const wetG = ribbon({ ...track, length: w1 - w0, sample: s => track.sample(w0 + s) }, -half + 0.6, half - 0.6, 0.017, 2, () => dry);
  const wetM = new THREE.Mesh(wetG, sheen); wetM.name = 'wetSheen'; g.add(wetM);

  // white edge lines + kerbs on the corners
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, ...OFF(-4, -8) });
  const lines = [ribbon(track, -half + 0.2, -half + 0.35, 0.018, 2, () => white), ribbon(track, half - 0.35, half - 0.2, 0.018, 2, () => white)];
  const kerbCol = s => (inCorner(s) ? (Math.floor(s / 1.5) % 2 ? red : white) : null);
  for (const [u0, u1] of [[-half - 1.0, -half], [half, half + 1.0]]) {
    const geo = ribbon(track, u0, u1, 0.03, 0.75, s => kerbCol(s) ?? new THREE.Color(0, 0, 0));
    // drop the straight parts (black) by collapsing them under the ground
    const p = geo.attributes.position, c = geo.attributes.color;
    for (let i = 0; i < p.count; i++) if (c.getX(i) + c.getY(i) + c.getZ(i) === 0) p.setY(i, -0.5);
    lines.push(geo);
  }
  const marks = new THREE.Mesh(mergeGeometries(lines), paint); marks.name = 'trackPaint'; marks.receiveShadow = true; g.add(marks);

  // chequered start/finish line
  const st = track.sample(0.6);
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(track.def.width, 1.2), new THREE.MeshStandardMaterial({ map: checker(), roughness: 0.7, ...OFF(-4, -8) }));
  sl.rotation.set(-Math.PI / 2, 0, Math.atan2(st.tx, st.tz)); sl.position.set(st.x, 0.02, st.z); sl.name = 'startLine'; g.add(sl);

  if (full) {
    // painted tyre stacks on the outside of the corners (red/white, 3 high), 22 m out — past the run-off sand
    // one tyre of a stack: an open 8-sided band (bottom/middle covers are never seen); the top tyre gets a cap.
    // All pieces non-indexed: mergeGeometries needs them alike.
    const ring = (r, h, y, c, top = false) => {
      let t = new THREE.CylinderGeometry(r, r, h, 8, 1, true).toNonIndexed();
      if (top) {
        const cap = new THREE.CircleGeometry(r, 8); cap.rotateX(-Math.PI / 2); cap.translate(0, h / 2, 0);
        t = mergeGeometries([t, cap.toNonIndexed()]);
      }
      t.translate(0, y, 0);
      const n = t.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      t.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return t;
    };
    const black = new THREE.Color(0.04, 0.04, 0.045);
    const stackA = mergeGeometries([ring(0.36, 0.26, 0.13, black), ring(0.36, 0.26, 0.39, red), ring(0.36, 0.26, 0.65, black, true)]);
    const stackB = mergeGeometries([ring(0.36, 0.26, 0.13, black), ring(0.36, 0.26, 0.39, white), ring(0.36, 0.26, 0.65, black, true)]);
    const tyreMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const spots = [];
    for (const [a, b] of corners) for (let s = a - 6; s <= b + 6; s += 0.8) { const p = track.sample(s); spots.push([p.x + p.tz * (half + 22), p.z - p.tx * (half + 22)]); }
    for (const [k, geo] of [[0, stackA], [1, stackB]]) {
      const list = spots.filter((_, i) => i % 2 === k);
      const im = new THREE.InstancedMesh(geo, tyreMat, list.length);
      const m4 = new THREE.Matrix4();
      list.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
      im.name = `tyres${k}`; im.computeBoundingSphere(); g.add(im);   // no shadow pass: ~375 stacks would double their cost
    }
  }
  return g;
}
