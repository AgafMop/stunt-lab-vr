// Fine dust drifting in the low sun around the viewer (round soft points — never squares, see lessons), brighter
// when backlit by the sun. One draw call; the cloud re-centres on the camera so it is always around the student.
import * as THREE from 'three';
import { SUN_DIR } from './layout.js';

function roundDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createDust(engine, parent = engine.scene, { count = 700, box = 40 } = {}) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * box; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * box; seed[i] = Math.random(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { map: { value: roundDot() }, time: { value: 0 }, centre: { value: new THREE.Vector3() }, box: { value: box },
      sunDir: { value: new THREE.Vector3(...SUN_DIR) }, scale: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float time, box, scale; uniform vec3 centre;
      varying float vA; varying vec3 vW;
      void main() {
        vec3 p = position + vec3(time * (0.6 + seed * 0.5), sin(time * 0.3 + seed * 20.0) * 0.6, time * 0.25);
        p.xz = mod(p.xz - centre.xz + box * 0.5, box) - box * 0.5 + centre.xz;   // wrap around the viewer
        p.y = mod(p.y, 14.0) + centre.y - 5.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = scale * (0.025 + seed * 0.03) * 900.0 / -mv.z;
        vA = smoothstep(box * 0.5, box * 0.2, length(p.xz - centre.xz)); vW = p;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 sunDir; varying float vA; varying vec3 vW;
      void main() {
        vec3 v = normalize(vW - cameraPosition);
        float back = pow(max(dot(v, sunDir), 0.0), 4.0);                      // glints when looking toward the sun
        float a = texture2D(map, gl_PointCoord).a * vA * (0.18 + back * 0.8);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'dust'; pts.frustumCulled = false; pts.renderOrder = 5;
  const cam = new THREE.Vector3();
  const off = engine.onFrame(dt => {
    mat.uniforms.time.value += dt;
    mat.uniforms.centre.value.copy(engine.camera.getWorldPosition(cam));
    mat.uniforms.scale.value = engine.renderer.getPixelRatio() * (engine.isXR() ? 1.4 : 1);
  });
  pts.userData.dispose = off;
  parent.add(pts);
  return pts;
}
