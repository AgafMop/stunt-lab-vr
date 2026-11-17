// Golden-hour sky dome: horizon-to-zenith gradient, warm side toward the sun and pink on the far side, sun disc +
// glow, a thin layer of sunset clouds lit from below. One draw call, follows the camera, drawn behind everything.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SUN_DIR, PALETTE } from './layout.js';

const v3 = a => new THREE.Vector3(...a);
const col = a => new THREE.Color(...a);

/** Tileable value-noise fbm texture (R channel) for the clouds — generated once, no download. */
export function noiseTexture(size = 256, octaves = 5, seed = 7) {
  const hash = (x, y, p) => { x = ((x % p) + p) % p; y = ((y % p) + p) % p; let h = (x * 374761393 + y * 668265263 + seed * 2654435761) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const p = 4 << o, fx = (x / size) * p, fy = (y / size) * p, ix = Math.floor(fx), iy = Math.floor(fy);
      const u = fx - ix, w = fy - iy, su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w);
      const a = hash(ix, iy, p), b = hash(ix + 1, iy, p), c = hash(ix, iy + 1, p), d = hash(ix + 1, iy + 1, p);
      v += amp * (a + (b - a) * su + (c - a) * sw + (a - b - c + d) * su * sw); norm += amp; amp *= 0.5;
    }
    const k = (y * size + x) * 4; data[k] = data[k + 1] = data[k + 2] = Math.round((v / norm) * 255); data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export function createSky(engine, parent = engine.scene, noise = noiseTexture()) {
  const mat = new THREE.ShaderMaterial({
    name: 'sky',
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      sunDir: { value: v3(SUN_DIR) }, sunCol: { value: col(PALETTE.sun) },
      zenith: { value: col(PALETTE.skyZenith) }, horizon: { value: col(PALETTE.skyHorizon) },
      antiSun: { value: col(PALETTE.skyAntiSun) }, haze: { value: col(PALETTE.haze) },
      noise: { value: noise },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;                       // on the far plane
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, sunCol, zenith, horizon, antiSun, haze;
      uniform sampler2D noise;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        float up = clamp(e, 0.0, 1.0);
        vec3 c = mix(horizon, zenith, pow(up, 0.55));
        vec2 hz = normalize(d.xz + 1e-5), hs = normalize(sunDir.xz);
        float side = clamp(dot(hz, hs) * 0.5 + 0.5, 0.0, 1.0);                  // 1 toward the sun (clamped: pow() of a hair below 0 is NaN — it drew a dotted line opposite the sun)
        c = mix(c, antiSun, (1.0 - side) * (1.0 - smoothstep(0.0, 0.45, up)) * 0.75);
        float cs = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(cs, 6.0) * 0.55 + pow(cs, 48.0) * 0.9 + pow(cs, 600.0) * 2.5);
        c = mix(c, vec3(1.6, 1.25, 0.7), smoothstep(0.99800, 0.99860, cs));        // a big low sun disc, like the film's
        // sunset clouds: a flat layer, lit from below (gold toward the sun, pink-violet away)
        if (e > 0.01) {
          vec2 uv = d.xz / (e + 0.12) * 0.22;
          float n = texture2D(noise, uv).r * 0.65 + texture2D(noise, uv * 2.7 + 0.31).r * 0.35;
          float cov = smoothstep(0.55, 0.70, n) * smoothstep(0.02, 0.12, e) * (1.0 - smoothstep(0.35, 0.8, e));
          float rim = smoothstep(0.55, 0.85, n);                                  // thick cores dark, thin edges lit
          vec3 cl = mix(vec3(0.20, 0.09, 0.17), vec3(1.30, 0.48, 0.16), pow(side, 1.3) * (1.0 - rim * 0.55)) + sunCol * pow(cs, 12.0) * 1.2;
          c = mix(c, cl, cov * 0.92);
        }
        c = mix(c, haze, smoothstep(0.05, -0.02, e));                            // below the horizon: dust haze
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // the sphere's seam (φ = 0 / 2π) has twin vertices a hair apart: welded, or the haze shows through as a dotted line
  const sg = new THREE.SphereGeometry(100, 48, 24); sg.deleteAttribute('uv'); sg.deleteAttribute('normal');
  const dome = new THREE.Mesh(mergeVertices(sg, 1e-3), mat);
  dome.name = 'sky'; dome.renderOrder = -1000; dome.frustumCulled = false;
  const p = new THREE.Vector3();
  dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.getWorldPosition(p)); dome.updateMatrixWorld(); };
  parent.add(dome);                                  // under the set root: the intro cinema hides it with the set
  return dome;
}
