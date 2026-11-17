// The race circuit as built geometry (track.js coordinates = world metres; the table map reuses it at 1:90).
//   full: asphalt (worn, dusty edges, tyre marks into the corners, a glossy wet corner), white edge lines, raised
//         red/white kerbs through every corner, dirt shoulders melting into the sand, gravel traps and tyre walls on
//         the outside of the tight corners, a guardrail along the canyon, brake-marker boards (150/100/50) before the
//         big stops, chevrons round the hairpin and the wet corner, a start gantry + grandstand + banner wall, telegraph
//         poles down the long straight, the water tanker and cones at the wet corner.
//   mini: asphalt + paint + kerbs only.
// Offsets: u > 0 is the driver's left (track.sample → (tz, −tx)). Draw calls are merged per material (Quest budget).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tightCorners, railSide, BARRIER } from '../game/barriers.js';

const OFF = (f, u) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });
const TEX = 'assets/world/tex/';

/** Corner ranges [s0, s1, sign] (sign > 0 = left-hander), from the track's curvature. */
export function cornerRanges(track) { return track.corners(); }

function texture(url, srgb, rep = 1) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(rep, rep);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A strip along the track between offsets u0..u1 (functions of s allowed), sampled every `step` m.
 *  attrs(s, j) → { color?, a? } per vertex (j = 0 at u0, 1 at u1); y(s, j) height. UV: x = j, y = s / vScale. */
function ribbon(track, { u0, u1, y = 0.02, step = 2, s0 = 0, s1 = track.length, vScale = 4, color, alpha, cols = 1, prof }) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step)), pos = [], col = [], uv = [], idx = [], al = [];
  const U0 = typeof u0 === 'function' ? u0 : () => u0, U1 = typeof u1 === 'function' ? u1 : () => u1;
  const per = cols + 1;
  for (let i = 0; i <= n; i++) {
    const s = s0 + (i / n) * (s1 - s0), p = track.sample(s);
    for (let j = 0; j <= cols; j++) {
      const t = j / cols, u = U0(s) + (U1(s) - U0(s)) * t;
      const yy = prof ? prof(t, s) : typeof y === 'function' ? y(s, t) : y;
      pos.push(p.x + p.tz * u, yy, p.z - p.tx * u);
      uv.push(t, s / vScale);
      if (color) { const c = color(s, t); col.push(c.r, c.g, c.b); }
      if (alpha) al.push(alpha(s, t));
    }
    if (i < n) for (let j = 0; j < cols; j++) { const a = i * per + j; idx.push(a, a + per, a + 1, a + 1, a + per, a + per + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (alpha) g.setAttribute('fade', new THREE.Float32BufferAttribute(al, 1));
  g.setIndex(idx); g.computeVertexNormals();
  // ribbons wound one way face down when u1 < u0 — make every top face point up
  const nrm = g.attributes.normal; if (nrm.count && nrm.getY(0) < 0) { g.setIndex(idx.map((_, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]])); g.computeVertexNormals(); }
  return g;
}

function canvasTex(w, h, draw, { srgb = true, nearest = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (nearest) t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tyre marks: dark curved streaks, transparent elsewhere (one tile = 64 m of road). */
function marksTexture() {
  return canvasTex(128, 1024, (g, W, H) => {
    let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 26; k++) {
      const x0 = W * (0.18 + r() * 0.64), len = H * (0.06 + r() * 0.2), y0 = r() * H, bend = (r() - 0.5) * W * 0.25;
      for (const dx of [-W * 0.11, W * 0.11]) {
        g.strokeStyle = `rgba(8,8,8,${0.18 + r() * 0.35})`; g.lineWidth = 5 + r() * 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0 + dx, y0); g.quadraticCurveTo(x0 + dx + bend, y0 + len / 2, x0 + dx + bend * 1.8, y0 + len); g.stroke();
      }
    }
  }, { srgb: false });
}

function kerbTexture() {
  return canvasTex(64, 128, (g, W, H) => {
    g.fillStyle = '#c8261b'; g.fillRect(0, 0, W, H / 2); g.fillStyle = '#f1eee6'; g.fillRect(0, H / 2, W, H / 2);
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 60; i++) g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }, { nearest: true });
}

/** Sign atlas: 0 = "150", 1 = "100", 2 = "50", 3 = chevron →, 4 = banner "פעלול אחרון", 5 = banner "STUNT LAB · 01", 6 = "wet road" warning, 7 = plain grey back */
function signAtlas() {
  const cell = 256;
  return canvasTex(cell * 8, cell, (g) => {
    const font = n => `800 ${n}px Heebo, "Segoe UI", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    ['150', '100', '50'].forEach((t, i) => {
      const x = i * cell; g.fillStyle = '#f5f2ea'; g.fillRect(x, 0, cell, cell);
      g.fillStyle = '#16181d'; g.fillRect(x + 10, 10, cell - 20, cell - 20); g.fillStyle = '#f5f2ea'; g.fillRect(x + 22, 22, cell - 44, cell - 44);
      g.fillStyle = '#16181d'; g.font = font(t.length > 2 ? 104 : 130); g.fillText(t, x + cell / 2, cell / 2 + 8);
    });
    { const x = 3 * cell; g.fillStyle = '#d42a1e'; g.fillRect(x, 0, cell, cell); g.fillStyle = '#ffffff';
      for (const o of [-70, 30]) { g.beginPath(); g.moveTo(x + cell / 2 + o - 20, 30); g.lineTo(x + cell / 2 + o + 50, cell / 2); g.lineTo(x + cell / 2 + o - 20, cell - 30); g.lineTo(x + cell / 2 + o + 10, cell - 30); g.lineTo(x + cell / 2 + o + 80, cell / 2); g.lineTo(x + cell / 2 + o + 10, 30); g.closePath(); g.fill(); } }
    { const x = 4 * cell, gr = g.createLinearGradient(x, 0, x + cell, 0); gr.addColorStop(0, '#e8643a'); gr.addColorStop(1, '#f39a3c'); g.fillStyle = gr; g.fillRect(x, 0, cell, cell);
      g.fillStyle = '#1b1210'; g.font = font(64); g.fillText('פעלול', x + cell / 2, cell * 0.36); g.fillText('אחרון', x + cell / 2, cell * 0.7); }
    { const x = 5 * cell; g.fillStyle = '#121620'; g.fillRect(x, 0, cell, cell); g.fillStyle = '#ffb347'; g.font = font(58); g.fillText('STUNT', x + cell / 2, cell * 0.36);
      g.fillStyle = '#3cc4bc'; g.font = font(50); g.fillText('LAB · 01', x + cell / 2, cell * 0.7); }
    { const x = 6 * cell; g.fillStyle = '#ffcc33'; g.fillRect(x, 0, cell, cell); g.fillStyle = '#16181d'; g.fillRect(x + 8, 8, cell - 16, cell - 16); g.fillStyle = '#ffcc33'; g.fillRect(x + 18, 18, cell - 36, cell - 36);
      g.fillStyle = '#16181d'; g.font = font(70); g.fillText('!', x + cell / 2, cell * 0.28); g.font = font(46); g.fillText('כביש', x + cell / 2, cell * 0.56); g.fillText('רטוב', x + cell / 2, cell * 0.78); }
    { const x = 7 * cell; g.fillStyle = '#4a4f58'; g.fillRect(x, 0, cell, cell); g.fillStyle = '#3c4048'; for (let i = 0; i < 8; i++) g.fillRect(x, i * 32 + 14, cell, 4); }   // plain back of every sign
  });
}

/** A sign (w × h) standing at (x, z), base at y, facing yaw (normal = (sin yaw, cos yaw)), UV cell k of 8 (flip mirrors);
 *  its back is the plain grey panel (cell 7) — never mirrored text. */
function signQuad(x, z, y, w, h, yaw, k, flip = false) {
  return mergeGeometries([signFace(x, z, y, w, h, yaw, k, flip), signFace(x, z, y, w, h, yaw + Math.PI, 7)]);
}
function signFace(x, z, y, w, h, yaw, k, flip = false) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { let u = uv.getX(i); if (flip) u = 1 - u; uv.setX(i, (k + u) / 8); }
  g.rotateY(yaw); g.translate(x, y + h / 2, z);
  return g;
}

function colored(geo, c) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
const box = (w, h, d, x, y, z, c, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); return colored(g, c); };
const cyl = (r0, r1, h, x, y, z, c, seg = 8) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return colored(g, c); };

export function createTrack3d(track, { full = true } = {}) {
  const g = new THREE.Group(); g.name = full ? 'track' : 'miniTrack';
  const half = track.def.width / 2, [w0, w1] = track.def.wet, L = track.length;
  const corners = track.corners();
  const near = (s, list, pad) => list.some(([a, b]) => { const d = Math.min(Math.abs(s - a), Math.abs(s - b), Math.abs(s - a - L), Math.abs(s - b + L)); return (s >= a && s <= b) || d < pad; });
  const wetAmt = s => Math.max(0, Math.min(1, (s - w0) / 12, (w1 - s) / 12));
  const tight = tightCorners(track);                                   // same list the car collides with (barriers.js)

  // ---- asphalt: worn texture, dusty edges, tyre marks into the corners, the wet corner glossy and dark ----
  const map = texture(TEX + 'asphalt_track_diff.jpg', true), nor = texture(TEX + 'asphalt_track_nor.jpg', false);
  map.repeat.set(2, 1); nor.repeat.set(2, 1);
  const marks = marksTexture();
  const asphalt = new THREE.MeshStandardMaterial({ map, normalMap: full ? nor : null, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.88, ...OFF(-2, -4) });
  asphalt.color.setRGB(2.3, 2.24, 2.15);                                 // the texture is fresh black tarmac: this road is sun-bleached
  asphalt.onBeforeCompile = sh => {
    sh.uniforms.marks = { value: marks };
    sh.vertexShader = 'attribute float fade; varying float vWet; varying vec2 vRoad;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWet = fade; vRoad = uv;');
    sh.fragmentShader = 'uniform sampler2D marks; varying float vWet; varying vec2 vRoad;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float edge = smoothstep(0.36, 0.5, abs(vRoad.x - 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.42, 0.30), edge * 0.55);                  // sand blown onto the edges
        float patchy = texture2D(map, vRoad * vec2(0.13, 0.021)).r;
        diffuseColor.rgb *= mix(0.86, 1.1, smoothstep(0.25, 0.75, patchy));                              // repairs and sun-bleached patches
        float lane = 1.0 - smoothstep(0.08, 0.26, abs(vRoad.x - 0.5));
        diffuseColor.rgb *= mix(1.0, 0.9, lane * 0.6);                                                   // rubbered-in racing line
        float m = texture2D(marks, vec2(vRoad.x, vRoad.y / 16.0)).a;
        diffuseColor.rgb *= 1.0 - m * 0.75;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.47, 0.55), vWet);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.2, vWet);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.35, vWet);');
  };
  asphalt.customProgramCacheKey = () => 'asphalt-v2';
  const road = new THREE.Mesh(ribbon(track, { u0: half, u1: -half, y: 0.015, step: full ? 1.5 : 3, vScale: 4, alpha: s => wetAmt(s) }), asphalt);
  road.name = full ? 'trackAsphalt' : 'miniAsphalt'; road.receiveShadow = true; g.add(road);

  // ---- paint: white edge lines; kerbs (raised profile) through every corner ----
  const white = new THREE.Color(0.93, 0.92, 0.88);
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, ...OFF(-4, -8) });
  const lines = [ribbon(track, { u0: half - 0.18, u1: half - 0.36, y: 0.02, color: () => white }), ribbon(track, { u0: -half + 0.36, u1: -half + 0.18, y: 0.02, color: () => white })];
  // start/finish: a chequered band (two rows of 0.6 m squares)
  for (let row = 0; row < 2; row++) for (let i = 0; i < Math.round(track.def.width / 0.6); i++) {
    const u = -half + i * 0.6, p = track.sample(0.6 * row);
    if ((i + row) % 2) continue;
    lines.push(ribbon({ sample: s => track.sample(s), length: L }, { u0: u + 0.6, u1: u, y: 0.022, s0: 0.6 * row, s1: 0.6 * row + 0.6, step: 0.6, color: () => new THREE.Color(0.06, 0.06, 0.07) }));
    void p;
  }
  lines.push(ribbon(track, { u0: half, u1: -half, y: 0.019, s0: -0.6, s1: 1.8, step: 2.4, color: () => white }));
  g.add(Object.assign(new THREE.Mesh(mergeGeometries(lines), paint), { name: 'trackPaint', receiveShadow: true }));

  const kerbTex = kerbTexture();
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6, ...OFF(-3, -6) });
  const kerbs = [];
  for (const [a, b] of corners) for (const side of [1, -1]) {
    const inner = side * half, outer = side * (half + 1.1);
    kerbs.push(ribbon(track, { u0: inner, u1: outer, s0: a - 10, s1: b + 10, step: 1.0, vScale: 3, cols: 3, prof: t => 0.02 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.25)) }));
  }
  if (kerbs.length) g.add(Object.assign(new THREE.Mesh(mergeGeometries(kerbs), kerbMat), { name: 'trackKerbs', receiveShadow: true }));
  if (!full) return g;

  // ---- dirt shoulders (fade into the sand) and gravel traps on the outside of tight corners ----
  const gravD = texture(TEX + 'gravelly_sand_diff.jpg', true);
  const dirtMat = new THREE.MeshStandardMaterial({ map: gravD, color: 0xd8b49a, roughness: 1, transparent: true, depthWrite: false, ...OFF(-1, -2) });
  dirtMat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float fade; varying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFade = fade;');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float n = texture2D(map, vMapUv * 0.37).g;
      diffuseColor.a *= smoothstep(0.0, 1.0, vFade * (0.75 + 0.5 * n));`);
  };
  dirtMat.customProgramCacheKey = () => 'dirt-v1';
  const dirt = [];
  for (const side of [1, -1]) dirt.push(ribbon(track, { u0: side * (half - 0.05), u1: side * (half + 3.2), y: 0.008, step: 2, vScale: 3, alpha: (s, t) => 1 - t }));
  for (const [a, b, sg] of tight) {                                     // outside of the corner = against the turn
    const side = -sg, len = b - a;
    dirt.push(ribbon(track, { u0: side * (half + 1.1), u1: side * (half + 15), y: 0.01, s0: a - 15, s1: b + 25, step: 1.5, vScale: 2.5,
      alpha: (s, t) => Math.min(1, (1 - t) * 3) * Math.min(1, (s - a + 15) / 10, (b + 25 - s) / 14) }));
    void len;
  }
  g.add(Object.assign(new THREE.Mesh(mergeGeometries(dirt), dirtMat), { name: 'trackShoulders', receiveShadow: true, renderOrder: -1 }));

  // ---- props (vertex-coloured, merged) ----
  const red = new THREE.Color(0.78, 0.1, 0.07), wht = new THREE.Color(0.92, 0.91, 0.87), blk = new THREE.Color(0.04, 0.04, 0.045);
  const grey = new THREE.Color(0.55, 0.56, 0.58), steel = new THREE.Color(0.7, 0.71, 0.73), wood = new THREE.Color(0.32, 0.22, 0.15);
  const orange = new THREE.Color(0.95, 0.42, 0.08), yellow = new THREE.Color(0.95, 0.75, 0.15), teal = new THREE.Color(0.2, 0.62, 0.6);
  const props = [], at = (s, u) => { const p = track.sample(s); return [p.x + p.tz * u, p.z - p.tx * u, Math.atan2(p.tx, p.tz)]; };

  // tyre walls outside the tight corners, behind the gravel: a painted wall of stacked tyres (two quads per 1.5 m —
  // ~45k triangles cheaper than modelled stacks, which matters in the headset), front, back and a dark top
  const tyreTex = canvasTex(256, 128, (c, W, H) => {
    for (let col = 0; col < 2; col++) for (let r = 0; r < 3; r++) {
      const x = col * 128, y = r * (H / 3), mid = r === 1 ? (col ? '#e9e6de' : '#c8261b') : '#121214';
      const gr = c.createLinearGradient(x, 0, x + 128, 0);                 // a rounded tyre: dark edges, lit middle
      gr.addColorStop(0, '#050506'); gr.addColorStop(0.18, mid); gr.addColorStop(0.55, mid); gr.addColorStop(1, '#050506');
      c.fillStyle = gr; c.fillRect(x, y + 2, 128, H / 3 - 4);
      c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(x, y, 128, 3); c.fillRect(x, y + H / 3 - 3, 128, 3);
    }
  });
  const wall = [];
  for (const [a, b, sg] of tight) {
    const u = -sg * (half + BARRIER.tyres), pts = [];
    for (let s = a - 12; s <= b + 22; s += 1.5) pts.push([...at(s, u), s]);
    const pos = [], uv = [], idx = [];
    pts.forEach(([x, z, , s], i) => {
      pos.push(x, 0, z, x, 0.78, z); uv.push(s / 1.44, 0, s / 1.44, 1);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    });
    const gw = new THREE.BufferGeometry(); gw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gw.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gw.setIndex(idx); gw.computeVertexNormals();
    wall.push(gw);
  }
  if (wall.length) {
    const tw = new THREE.Mesh(mergeGeometries(wall), new THREE.MeshLambertMaterial({ map: tyreTex, side: THREE.DoubleSide }));
    tw.name = 'tyreWall'; tw.castShadow = true; tw.receiveShadow = true; g.add(tw);
    for (const [a, b, sg] of tight) props.push(...[0].map(() => colored(ribbon(track, { u0: -sg * (half + BARRIER.tyres - 0.36), u1: -sg * (half + BARRIER.tyres + 0.36), y: 0.79, s0: a - 12, s1: b + 22, step: 1.5 }), blk)));
  }

  // guardrail on the canyon side wherever the rim is within 70 m
  const rail = [];
  let prevPost = -99;
  for (let s = 0; s < L; s += 2) {
    const p = track.sample(s), side = railSide(track, s);
    if (!side) continue;
    const u = side * (half + BARRIER.rail), x = p.x + p.tz * u, z = p.z - p.tx * u;
    const q = track.sample(s + 2), x2 = q.x + q.tz * u, z2 = q.z - q.tx * u;
    const len = Math.hypot(x2 - x, z2 - z), yaw = Math.atan2(x2 - x, z2 - z);
    rail.push(box(0.05, 0.32, len + 0.02, (x + x2) / 2, 0.62, (z + z2) / 2, steel, yaw));
    if (s - prevPost >= 4) { rail.push(box(0.12, 0.8, 0.12, x, 0.4, z, grey, yaw)); prevPost = s; }
  }

  // brake boards 150 / 100 / 50 m before the corners that need a real stop, on the outside of the approach
  const prof = [];
  for (const [a, , sg] of tight) {
    for (const [d, k] of [[150, 0], [100, 1], [50, 2]]) {
      const s = a - d, [x, z, h] = at(s, -sg * (half + 3.2));
      if (near(s, corners.filter(c => c[0] !== a), 8)) continue;
      prof.push(signQuad(x, z, 0.9, 1.25, 1.25, h + Math.PI, k));
      props.push(box(0.1, 0.95, 0.1, x, 0.47, z, grey));
    }
  }
  // chevrons on the outside of the hairpin and the wet corner
  const hairpin = tight.reduce((m, c) => (c[1] - c[0] > m[1] - m[0] ? c : m), tight[0]);
  const wetC = corners.find(([a, b]) => a < w1 && b > w0);
  for (const c of [hairpin, wetC].filter(Boolean)) {
    const [a, b, sg] = c;
    for (let s = a; s <= b; s += 9) {
      const [x, z, h] = at(s, -sg * (half + 7));
      prof.push(signQuad(x, z, 0.5, 1.4, 1.1, h + Math.PI, 3, sg > 0));
      props.push(box(0.08, 0.55, 0.08, x - Math.sin(h) * 0.05, 0.27, z - Math.cos(h) * 0.05, grey));
    }
  }
  // wet corner: a warning sign, cones along the inside, the water tanker that spilled
  if (wetC) {
    const [a, b, sg] = wetC;
    for (const d of [120, 60]) { const [x, z, h] = at(a - d, -sg * (half + 3.5)); prof.push(signQuad(x, z, 1.0, 1.3, 1.3, h + Math.PI, 6)); props.push(box(0.1, 1.05, 0.1, x, 0.52, z, grey)); }
    for (let s = a - 20; s <= b + 10; s += 7) {
      const [x, z] = at(s, sg * (half + 1.8));
      props.push(cyl(0.02, 0.2, 0.55, x, 0.3, z, orange, 10), cyl(0.12, 0.15, 0.1, x, 0.33, z, wht, 10), box(0.4, 0.04, 0.4, x, 0.02, z, blk));
    }
    const [tx, tz, th] = at(a - 35, -sg * (half + 9));
    props.push(box(2.4, 1.1, 2.3, tx + Math.sin(th) * 3.4, 1.35, tz + Math.cos(th) * 3.4, wht, th));      // cab
    props.push(box(2.3, 0.9, 1.0, tx + Math.sin(th) * 3.7, 1.9, tz + Math.cos(th) * 3.7, new THREE.Color(0.15, 0.2, 0.28), th));
    const tank = new THREE.CylinderGeometry(1.15, 1.15, 5.4, 16); tank.rotateX(Math.PI / 2); tank.rotateY(th); tank.translate(tx - Math.sin(th) * 0.8, 1.75, tz - Math.cos(th) * 0.8);
    props.push(colored(tank, new THREE.Color(0.82, 0.84, 0.86)));
    props.push(box(2.3, 0.35, 8.6, tx + Math.sin(th) * 0.4, 0.75, tz + Math.cos(th) * 0.4, new THREE.Color(0.2, 0.2, 0.22), th));
    for (const [f, sx] of [[2.9, 1], [2.9, -1], [-1.6, 1], [-1.6, -1], [-3.0, 1], [-3.0, -1]]) {
      const w = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12); w.rotateZ(Math.PI / 2); w.rotateY(th);
      w.translate(tx + Math.sin(th) * f + Math.cos(th) * sx * 1.05, 0.5, tz + Math.cos(th) * f - Math.sin(th) * sx * 1.05);
      props.push(colored(w, blk));
    }
  }
  // start: gantry over the line, banner wall along the straight, a grandstand on the outside, flags
  {
    const [x0, z0, h] = at(-2, 0), cs = Math.cos(h), sn = Math.sin(h);
    for (const side of [1, -1]) {
      const [x, z] = at(BARRIER.gantryS, side * (half + BARRIER.gantry));
      props.push(box(0.32, 7.0, 0.32, x, 3.5, z, new THREE.Color(0.2, 0.21, 0.24), h), box(0.9, 0.12, 0.9, x, 0.06, z, new THREE.Color(0.3, 0.3, 0.32), h));
    }
    { // a ladder truss over the road (two chords, rungs every metre) carrying the banners
      const W = track.def.width + 3.4, dark = new THREE.Color(0.2, 0.21, 0.24), ax = Math.cos(h), az = -Math.sin(h);   // across the road
      for (const y of [6.0, 6.85]) for (const d of [-0.3, 0.3]) props.push(box(W, 0.1, 0.1, x0 + Math.sin(h) * d, y, z0 + Math.cos(h) * d, dark, h));
      for (let o = -W / 2; o <= W / 2 + 0.01; o += 1) props.push(box(0.07, 0.85, 0.66, x0 + ax * o, 6.42, z0 + az * o, dark, h));
    }
    for (const dir of [1, -1]) prof.push(signQuad(x0 - sn * 0.36 * dir, z0 - cs * 0.36 * dir, 5.95, 5.2, 0.9, h + (dir > 0 ? Math.PI : 0), dir > 0 ? 4 : 5));
    // banner wall on the left (tower side) of the start straight
    for (let s = BARRIER.bannerS[0]; s <= BARRIER.bannerS[1]; s += 4) {
      const [x, z, hh] = at(s, half + BARRIER.banner);
      prof.push(signQuad(x, z, 0.1, 3.9, 1.0, hh - Math.PI / 2, [4, 5, 4, 5][Math.floor((s + 110) / 4) % 4]));
      props.push(box(3.9, 0.12, 0.25, x, 1.15, z, new THREE.Color(0.15, 0.16, 0.18), hh + Math.PI / 2));
    }
    // grandstand on the right (outside), 5 rows, a roof, the crowd as coloured blocks
    const [gx, gz] = at(BARRIER.standS, -(half + BARRIER.stand));
    const rows = [], crowd = [];
    const pal = [orange, teal, wht, yellow, red, new THREE.Color(0.25, 0.35, 0.75), new THREE.Color(0.2, 0.2, 0.22)];
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const stand = new THREE.Group();
    for (let r = 0; r < 5; r++) {
      rows.push(box(30, 0.25, 1.1, 0, 0.45 + r * 0.55, -r * 1.1, grey));
      rows.push(box(30, 0.45 + r * 0.55, 0.12, 0, (0.45 + r * 0.55) / 2, -r * 1.1 + 0.5, new THREE.Color(0.3, 0.31, 0.33)));
      for (let i = -14; i <= 14; i += 0.55) if (rnd() < 0.72) {
        const c = pal[Math.floor(rnd() * pal.length)];
        crowd.push(box(0.36, 0.5 + rnd() * 0.12, 0.3, i + (rnd() - 0.5) * 0.15, 0.85 + r * 0.55, -r * 1.1 - 0.1, c));
        crowd.push(box(0.2, 0.2, 0.2, i, 1.22 + r * 0.55, -r * 1.1 - 0.1, new THREE.Color(0.55 + rnd() * 0.3, 0.38 + rnd() * 0.2, 0.28 + rnd() * 0.12)));
      }
    }
    rows.push(box(31, 0.15, 7.5, 0, 5.6, -2.4, wht), box(0.25, 5.6, 0.25, -15, 2.8, -5.6, grey), box(0.25, 5.6, 0.25, 15, 2.8, -5.6, grey));
    const sg = mergeGeometries([...rows, ...crowd]);
    stand.add(new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true })));
    stand.position.set(gx, 0, gz); stand.rotation.y = h + Math.PI / 2; stand.name = 'grandstand';
    stand.children[0].castShadow = true; stand.children[0].receiveShadow = true;
    g.add(stand);
    void x0;
  }
  // telegraph poles down the long straight before the wet corner (sense of speed), with wires
  const wires = [];
  if (wetC) {
    let last = null;
    for (let s = wetC[0] - 380; s < wetC[0] - 20; s += 32) {
      const [x, z, h] = at(s, -(half + 11) * Math.sign(wetC[2] || 1));
      props.push(cyl(0.13, 0.17, 8.5, x, 4.25, z, wood, 6), box(1.8, 0.14, 0.14, x, 7.9, z, wood, h));
      const tips = [-0.8, 0, 0.8].map(o => [x + Math.cos(h) * o, 7.98, z - Math.sin(h) * o]);
      if (last) tips.forEach((t, i) => { const a = last[i]; for (let k = 0; k < 8; k++) { const f0 = k / 8, f1 = (k + 1) / 8, sag = f => -0.55 * Math.sin(Math.PI * f); wires.push(a[0] + (t[0] - a[0]) * f0, t[1] + sag(f0), a[2] + (t[2] - a[2]) * f0, a[0] + (t[0] - a[0]) * f1, t[1] + sag(f1), a[2] + (t[2] - a[2]) * f1); } });
      last = tips;
    }
  }
  if (wires.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    g.add(Object.assign(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1412 })), { name: 'wires' }));
  }

  const propMesh = new THREE.Mesh(mergeGeometries([...props, ...rail].map(x => (x.index ? x.toNonIndexed() : x))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  propMesh.name = 'trackProps'; propMesh.castShadow = true; propMesh.receiveShadow = true; g.add(propMesh);
  if (prof.length) {
    const sm = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.7 });
    const signs = new THREE.Mesh(mergeGeometries(prof), sm); signs.name = 'trackSigns'; signs.castShadow = true; g.add(signs);
  }
  return g;
}
