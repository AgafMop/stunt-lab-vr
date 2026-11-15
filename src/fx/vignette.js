// Comfort vignette: a soft dark ring at the edge of view, eased in during fast turns / hard acceleration in the
// cockpit. Attached to the camera; no flicker (eased, capped at 0.6).
import * as THREE from 'three';

export function createVignette(engine) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
  mesh.position.z = -0.12; mesh.renderOrder = 9990; mesh.visible = false; mesh.name = 'vignette';
  engine.camera.add(mesh);
  let target = 0;
  const off = engine.onFrame(dt => {
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * 4);
    mesh.visible = mat.opacity > 0.01;
  });
  return {
    set(level) { target = Math.max(0, Math.min(0.6, level)); },
    get level() { return mat.opacity; },
    dispose() { off(); engine.camera.remove(mesh); mat.dispose(); tex.dispose(); },
  };
}
