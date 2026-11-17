// The PC showcase tier (desktop only — the headset keeps its lean 72 fps path):
//   multisampled HDR render → a soft bloom on the brightest things only (the sun, lamps, glints) → a film grade (warm
//   highlights, slightly cooler shadows, gentle contrast) + a vignette → ACES + sRGB. Sharper shadows (4096 map) and a
//   higher pixel ratio. ?quality=quest (or the headset) skips all of it; ?test never turns it on.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// a sharp sun glint on wet asphalt or chrome can exceed half-float range (Inf); the bloom's blur turns one Inf
// pixel into big black blocks (NaN). Clamp right after the scene render: nothing real is brighter than this.
const ClampShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(min(max(c.rgb, vec3(0.0)), vec3(48.0)), c.a); }',
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, warmth: { value: 0.06 }, contrast: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float vignette, warmth, contrast; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // split toning: warm highlights, a touch of violet in the shadows (the film's sunset look)
      c.rgb += mix(vec3(-0.01, -0.005, 0.02), vec3(warmth, warmth * 0.45, -warmth * 0.6), smoothstep(0.1, 0.9, l)) * min(l * 2.0, 1.0);
      c.rgb = (c.rgb - 0.18) * contrast + 0.18;
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = c;
    }`,
};

export function enablePcQuality(engine, lab, opts = {}) {
  const { renderer, scene, camera } = engine;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  if (lab?.sun?.shadow) { lab.sun.shadow.mapSize.set(4096, 4096); lab.sun.shadow.map?.dispose(); lab.sun.shadow.map = null; }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(ClampShader));
  // threshold above 1: only the sun disc, lamps and glints bloom — never the white ruler ticks, signs or UI text
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 1.4);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());
  const resize = () => { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); composer.setSize(s.x / renderer.getPixelRatio(), s.y / renderer.getPixelRatio()); };
  addEventListener('resize', resize); resize();
  // the renderer's own tone mapping must not run twice: OutputPass applies it. During the film the plain path draws
  // the video untouched (the grade would shift its colours).
  let on = true;
  const draw = dt => { if (on && !opts.skip?.()) composer.render(dt); else renderer.render(scene, camera); };
  engine.setDraw(draw);

  // adapt to the machine (many school PCs have integrated graphics): measure, then step down
  //   1) pixel ratio 1   2) no post-processing, 2048 shadows
  let stage = 0, frames = 0, acc = 0, warm = 3;
  const fpsEl = opts.showFps ? Object.assign(document.body.appendChild(document.createElement('div')), { id: 'fps' }) : null;
  if (fpsEl) Object.assign(fpsEl.style, { position: 'fixed', left: '10px', top: '10px', zIndex: 9, font: '600 13px monospace', color: '#7CFF9B', background: 'rgba(0,0,0,.6)', padding: '3px 7px', borderRadius: '6px', pointerEvents: 'none' });
  const offProbe = engine.onFrame(dt => {
    if (renderer.xr.isPresenting) return;
    if (fpsEl) fpsEl.textContent = `${Math.round(1 / Math.max(dt, 1e-3))} fps · stage ${stage}`;
    if (opts.hold || (warm -= dt) > 0 || stage >= 2) return;            // ?pcstay: never step down (art reviews)
    acc += dt; frames++;
    if (frames < 90) return;
    const avg = acc / frames; acc = 0; frames = 0; warm = 1.5;
    if (avg <= 1 / 45) return;
    stage++;
    if (stage === 1) { renderer.setPixelRatio(1); resize(); }
    if (stage === 2) { on = false; if (lab?.sun?.shadow) { lab.sun.shadow.mapSize.set(2048, 2048); lab.sun.shadow.map?.dispose(); lab.sun.shadow.map = null; } }
    console.info(`pc quality: ${Math.round(1 / avg)} fps → step down to stage ${stage}`);
  });
  return { composer, bloom, get stage() { return stage; }, dispose() { offProbe(); engine.setDraw(null); removeEventListener('resize', resize); composer.dispose(); fpsEl?.remove(); } };
}
