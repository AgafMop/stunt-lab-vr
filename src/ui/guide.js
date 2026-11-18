// Clarity: the student always knows what to do now.
//   task  — one short "המשימה עכשיו" line (+ an optional controls hint). Fixed homes, never riding with the head:
//           a board on the tower's left rail (tower / table view), the passenger side of the dashboard while driving;
//           on desktop a banner at the top of the screen. Hidden during the film and while riding along.
//   attention(obj) — a soft warm glow that pulses (≈ 1 Hz, no strobe) around whatever should be clicked now.
import * as THREE from 'three';
import { TASKS } from '../game/script.js';

const PULSE_HZ = 1.1;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,190,90,0)'); grd.addColorStop(0.55, 'rgba(255,190,90,0.9)'); grd.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGuide(ctx) {
  const { engine, ui } = ctx;
  const isXR = () => engine.isXR();

  // ---------- attention ----------
  const glowTex = glowTexture();
  const glows = new Set();
  let time = 0;
  engine.onFrame(dt => {
    time += dt;
    const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(time * Math.PI * 2 * PULSE_HZ));
    for (const m of glows) m.material.opacity = a;
  });
  /** Glow around `obj` until the returned function is called (or obj is removed). */
  function attention(obj) {
    // a card just placed on its board has stale world matrices (Box3.setFromObject updates only the object itself):
    // without this the first card of a row got its glow at the world origin — the foot of the tower
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const local = obj.worldToLocal(box.getCenter(new THREE.Vector3()));
    const s = obj.getWorldScale(new THREE.Vector3());
    const w = Math.max(size.x, size.z) / (s.x || 1), h = size.y / (s.y || 1);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.35 + 0.08, h * 1.35 + 0.08),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.5 }));
    glow.name = 'attention'; glow.renderOrder = 2;
    glow.position.copy(local); glow.position.z -= 0.004;
    obj.add(glow); glows.add(glow);
    return () => { glows.delete(glow); glow.removeFromParent(); glow.geometry.dispose(); glow.material.dispose(); };
  }

  // ---------- task ----------
  const dom = document.getElementById('task');
  let text = '', hint = '', domHint = '';   // hint: the headset's controls (the 3D card only shows there), two lines
  const panel = ui.panel({ w: 0.62, h: 0.26, ppm: 900, viewDist: 1.1, name: 'task', draw(c, W, H) {
    if (!text) return;
    ui.rr(c, 4, 4, W - 8, H - 8, 26); c.fillStyle = 'rgba(10,14,22,0.94)'; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#FFB347'; c.stroke();
    c.fillStyle = '#FFB347';
    ui.fitText(c, 'המשימה עכשיו', { x: 24, y: 10, w: W - 48, h: H * 0.24, maxPx: H * 0.19, minPx: ui.minPx(900, 1.1), font: ui.FONT, align: 'right' });
    c.fillStyle = '#EEF2F8';
    ui.fitText(c, text, { x: 24, y: H * 0.3, w: W - 48, h: hint ? H * 0.4 : H * 0.62, maxPx: H * 0.2, minPx: ui.minPx(900, 1.1), font: ui.FONT, align: 'right' });
    if (hint) {
      c.fillStyle = '#9FB0C8';
      const parts = hint.split(' · '), half = Math.ceil(parts.length / 2);
      [parts.slice(0, half).join(' · '), parts.slice(half).join(' · ')].forEach((ln, i) =>
        ui.fitText(c, ln, { x: 24, y: H * (0.7 + i * 0.145), w: W - 48, h: H * 0.14, maxPx: H * 0.12, minPx: ui.minPx(900, 1.1), font: ui.FONT, weight: 500, align: 'right' }));
    }
  } });
  panel.mesh.name = 'taskCard'; panel.mesh.visible = false; panel.mesh.userData.ui = true;
  const towerHome = new THREE.Group(); towerHome.name = 'taskHome';
  // ≈ 40° left of the seated student's straight-ahead, ≈ 10° above the eyes, 1.25 m: it covers only sky (the strip, the
  // number signs and the far track are below the horizon) and stays clear of the boards that open straight ahead —
  // they span up to ≈ 25° left (at 30° it covered the view-choice card in the headset, 2026-11-18). Faces the chair.
  towerHome.position.set(-0.79, 6 + 1.39, -2.34);
  ctx.lab.root.add(towerHome);
  towerHome.lookAt(0, 6 + 1.17, -1.4);
  // on the face of the dashboard, right of the steering wheel, BELOW the driver's line of sight over the dash (every corner of the
  // loop is a right-hander: the windshield must stay clear); turned to face the driver's eye, 0.8 scale (≈ 0.9 m away)
  const DASH = { pos: new THREE.Vector3(-0.36, 0.80, 0.30), scale: 0.8 };
  const dashQ = (() => { const o = new THREE.Object3D(); o.position.copy(DASH.pos); o.lookAt(0.38, 1.12, -0.35); return o.quaternion.clone(); })();

  function home() {
    if (!text || ctx.introPhase === 'video') return null;
    const riding = ctx.loco?.following;
    const car = ctx.drive?.car3d;
    if (riding && car && ctx.drive.view?.mode === 'cockpit') return car;
    if (riding) return null;                                            // riding along on the strip: just watch
    return towerHome;
  }
  engine.onFrame(() => {
    const h = isXR() ? home() : null;
    if (h !== panel.mesh.parent) {
      panel.mesh.removeFromParent();
      if (h) {
        h.add(panel.mesh);
        const dash = h !== towerHome;
        if (!dash) { panel.mesh.position.set(0, 0, 0); panel.mesh.quaternion.identity(); panel.mesh.scale.setScalar(1); }
        else { panel.mesh.position.copy(DASH.pos); panel.mesh.quaternion.copy(dashQ); panel.mesh.scale.setScalar(DASH.scale); }
        // on the dash it is a sticker on the dash face: drawn over the dash edge it touches, never hidden by it
        panel.mesh.material.depthTest = !dash; panel.mesh.renderOrder = dash ? 50 : 0; panel.mesh.material.needsUpdate = true;
      }
    }
    panel.mesh.visible = !!h;
    if (dom) dom.hidden = isXR() || !text || ctx.introPhase === 'video';
  });

  const task = {
    /** Set the current task by id (TASKS in script.js); null hides it. */
    set(id) {
      const t = id ? TASKS[id] : null;
      text = t?.text || ''; hint = t?.drive ? driveHint(true) : ''; domHint = t?.drive ? driveHint(isXR()) : '';
      panel.redraw();
      if (dom) { dom.replaceChildren(); if (text) { const b = document.createElement('b'); b.textContent = 'המשימה עכשיו'; const p = document.createElement('div'); p.textContent = text; dom.append(b, p); if (domHint) { const s = document.createElement('small'); s.textContent = domHint; dom.append(s); } } }
      if (id) ctx.taskLog?.push(id);
    },
    clear() { task.set(null); },
    get text() { return text; },
    panel,
  };
  return { task, attention };
}

/** The driving controls, as a hint line for the task card. */
export function driveHint(xr) {
  return xr
    ? 'הדק ימני: גז · שמאלי: בלם · היגוי: הגה או מוט · X: תצוגה · B: לכביש'
    : 'W: גז · S: בלם / רוורס · A / D: היגוי · V: מצלמה · R: לכביש';
}
