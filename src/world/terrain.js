// The desert terrain: the baked height field (assets/world/terrain.bin, tools/world/gen-terrain.mjs) as one mesh.
// Shader: red sand on the flats, triplanar cliff rock with big sediment bands on slopes, the baked low-sun shadow
// and sky AO, and aerial perspective (distance haze that turns gold toward the sun) — so far walls and mesas melt
// into the sky like in the film. One draw call.
import * as THREE from 'three';
import { GRID, gridToWorld } from './terrainFn.js';
import { SUN_DIR, PALETTE } from './layout.js';

export const HAZE = { density: 1 / 5200, canyon: 0.14 };

/** Fog shared by the world's custom shaders (aerial perspective toward the sun). */
export const HAZE_GLSL = /* glsl */`
  uniform vec3 sunDir, sunCol, haze;
  uniform float hazeDensity, canyonHaze;
  vec3 applyHaze(vec3 c, vec3 wp) {
    vec3 v = wp - cameraPosition; float d = length(v); vec3 vd = v / max(d, 1e-3);
    float toSun = pow(max(dot(vd, sunDir), 0.0), 5.0);
    vec3 fc = mix(haze, sunCol * 1.25, toSun * 0.65);
    float f = 1.0 - exp(-d * hazeDensity);
    f += canyonHaze * smoothstep(-20.0, -120.0, wp.y) * smoothstep(60.0, 450.0, d);   // dusty air down in the canyon
    return mix(c, fc, clamp(f, 0.0, 0.85));
  }`;

export function hazeUniforms() {
  return {
    sunDir: { value: new THREE.Vector3(...SUN_DIR) }, sunCol: { value: new THREE.Color(...PALETTE.sun) },
    haze: { value: new THREE.Color(...PALETTE.haze) }, hazeDensity: { value: HAZE.density }, canyonHaze: { value: HAZE.canyon },
  };
}

function tex(loader, url, srgb) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function loadTerrain(engine, { base = 'assets/world/' } = {}) {
  const res = await fetch(base + 'terrain.bin');
  if (!res.ok) throw new Error(`terrain.bin ${res.status}`);
  const buf = await res.arrayBuffer();
  const N1 = GRID.n + 1, count = N1 * N1;
  const heights = new Float32Array(buf, 0, count), light = new Uint8Array(buf, count * 4, count * 2);

  const pos = new Float32Array(count * 3);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const k = j * N1 + i, w = gridToWorld(i, j);
    pos[k * 3] = w.x; pos[k * 3 + 1] = heights[k] - 0.02; pos[k * 3 + 2] = w.z;
  }
  const idx = new Uint32Array(GRID.n * GRID.n * 6);
  let q = 0;
  for (let j = 0; j < GRID.n; j++) for (let i = 0; i < GRID.n; i++) {
    const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('light', new THREE.BufferAttribute(light, 2, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const L = new THREE.TextureLoader();
  const mat = new THREE.ShaderMaterial({
    name: 'terrain',
    uniforms: {
      ...hazeUniforms(),
      sandD: { value: tex(L, base + 'tex/red_sand_diff.jpg', true) }, sandN: { value: tex(L, base + 'tex/red_sand_nor.jpg') },
      rockD: { value: tex(L, base + 'tex/cliff_side_diff.jpg', true) }, rockN: { value: tex(L, base + 'tex/cliff_side_nor.jpg') },
      gravD: { value: tex(L, base + 'tex/gravelly_sand_diff.jpg', true) },
      skyCol: { value: new THREE.Color(0.30, 0.22, 0.38) }, bounceCol: { value: new THREE.Color(0.46, 0.20, 0.11) },
      sunStrength: { value: 5.2 },
    },
    vertexShader: /* glsl */`
      attribute vec2 light;
      varying vec3 vW, vN; varying vec2 vL;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vL = light;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D sandD, sandN, rockD, rockN, gravD;
      uniform vec3 skyCol, bounceCol; uniform float sunStrength;
      varying vec3 vW, vN; varying vec2 vL;
      ${HAZE_GLSL}
      vec3 nmap(sampler2D t, vec2 uv) { return texture2D(t, uv).xyz * 2.0 - 1.0; }
      void main() {
        vec3 n = normalize(vN);
        float slope = 1.0 - n.y;
        float rockW = smoothstep(0.30, 0.55, slope);
        // ---- sand: two scales against tiling, macro colour drift ----
        vec2 sp = vW.xz;
        vec3 sand = texture2D(sandD, sp / 5.0).rgb * 0.6 + texture2D(sandD, sp / 23.0 + 0.37).rgb * 0.4;
        float macro = texture2D(rockD, sp / 900.0).g;
        sand *= mix(vec3(1.32, 1.08, 0.86), vec3(1.48, 1.20, 0.92), macro);
        // gravel patches and wind-swept lighter sand (breaks up the flat plateau)
        float patchN = texture2D(rockD, sp / 260.0 + 0.5).r * 0.7 + texture2D(rockD, sp / 70.0).b * 0.3;
        float gw = smoothstep(0.42, 0.55, patchN) * 0.85;
        if (gw > 0.01) sand = mix(sand, texture2D(gravD, sp / 3.0).rgb * vec3(1.25, 1.0, 0.85), gw);
        sand = mix(sand, sand * vec3(1.18, 1.12, 1.05), smoothstep(0.62, 0.75, 1.0 - patchN));
        sand = mix(vec3(dot(sand, vec3(0.3, 0.55, 0.15))), sand, 0.62) * vec3(1.12, 0.98, 0.86);   // less brick-red, more film ochre
        vec3 sN = nmap(sandN, sp / 5.0);
        // ---- rock: triplanar + sediment bands by height ----
        vec3 albedo = sand, dn = vec3(sN.x, 0.0, sN.y) * 0.35;
        if (rockW > 0.01) {                                 // only on slopes: most of the screen is flat sand
          vec3 bw = pow(abs(n), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
          float sc = 1.0 / 14.0;
          vec3 rock = texture2D(rockD, vW.zy * sc).rgb * bw.x + texture2D(rockD, vW.xy * sc).rgb * bw.z + texture2D(rockD, vW.xz * sc).rgb * bw.y;
          vec3 rn = nmap(rockN, vW.zy * sc) * bw.x + nmap(rockN, vW.xy * sc) * bw.z;
          float band = vW.y / 9.0 + texture2D(rockD, vW.xz / 600.0).r * 1.5;
          float b = fract(band);
          vec3 tint = mix(vec3(1.25, 0.62, 0.40), vec3(1.30, 0.95, 0.70), smoothstep(0.55, 0.62, b) * (1.0 - smoothstep(0.80, 0.88, b)));
          tint = mix(tint, vec3(0.95, 0.45, 0.32), smoothstep(0.15, 0.2, b) * (1.0 - smoothstep(0.32, 0.38, b)));
          albedo = mix(sand, rock * tint, rockW);
          dn = mix(dn, vec3(rn.x, rn.y, 0.0) * 0.6, rockW);
        }
        vec3 nd = normalize(n + dn);
        // ---- light: baked sun visibility + sky AO ----
        float sunVis = vL.x, ao = vL.y;
        float ndl = max(dot(nd, sunDir), 0.0);
        vec3 lit = sunCol * sunStrength * ndl * sunVis
                 + skyCol * ao * (0.55 + 0.45 * n.y)
                 + bounceCol * ao * (0.45 - 0.25 * n.y);
        vec3 c = albedo * lit;
        c = applyHaze(c, vW);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.frustumCulled = false;
  return mesh;
}
