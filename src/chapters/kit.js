// Shared chapter helpers: abortable scope, boards anchored in the lab, selection waits, pictogram painters.
import * as THREE from 'three';

export class Abort extends Error { constructor() { super('chapter aborted'); } }

/** A chapter scope: everything created in it is disposed on cleanup; awaits reject once aborted. */
export function createScope(ctx) {
  let aborted = false, skipped = false, rejectAll;
  const abortP = new Promise((_, rej) => { rejectAll = rej; });
  abortP.catch(() => {});
  const items = [];
  const scope = {
    get aborted() { return aborted; },
    get skipped() { return skipped; },
    /** Teacher demo: end the chapter now; the runner fills in its results. */
    skip() { skipped = true; scope.abort(); },
    add(x) { items.push(x); return x; },
    guard(p) { return Promise.race([p, abortP]); },
    abort() { if (!aborted) { aborted = true; rejectAll(new Abort()); } },
    cleanup() {
      for (const x of items.splice(0).reverse()) {
        try { if (typeof x === 'function') x(); else if (x.dispose) x.dispose(); else x.parent?.remove(x); } catch { /* already gone */ }
      }
    },
    say: id => scope.guard(ctx.audio.say(id)),
    wait: ms => scope.guard(ctx.audio.wait(ms)),
    /** Wait until `obj` (Object3D) is selected. Auto mode selects it after a beat. */
    waitSelect(obj, { auto = true } = {}) {
      return scope.guard(new Promise(res => {
        ctx.input.register(obj, { onSelect: () => { ctx.audio.sfx('click'); ctx.input.unregister(obj); res(obj); } });
        scope.add(() => ctx.input.unregister(obj));
        if (ctx.auto && auto) setTimeout(() => ctx.input.select(obj), 250);
      }));
    },
  };
  return scope;
}

/** A board group at a lab anchor (uses the anchor's `yaw` extra so it faces the station). */
export function board(ctx, scope, anchorName, offset = [0, 0, 0]) {
  const a = ctx.lab.anchors[anchorName];
  const g = new THREE.Group();
  g.position.copy(a.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...offset));
  g.rotation.y = a.userData.yaw ?? 0;
  ctx.engine.scene.add(g);
  scope.add(g);
  if (ctx.params?.has('tour')) ctx.tourPending = (ctx.tourPending || 0) + 1;   // ?tour: screenshot once it renders
  return g;
}

/** A board group floating in front of a station, facing the student. */
export function boardAtStation(ctx, scope, stationId, { dist = 1.0, height = 1.25, side = 0 } = {}) {
  const s = ctx.loco.stations[stationId];
  const g = new THREE.Group();
  const { engine } = ctx;
  const place = (yaw, base, y) => {
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    g.position.copy(base).addScaledVector(fwd, dist).addScaledVector(right, side); g.position.y = y;
    g.rotation.y = yaw;
  };
  if (engine.isXR()) {
    // in the headset: open in front of where the student is looking, and follow gently if they turn far away
    const headYaw = () => { const d = engine.camera.getWorldDirection(new THREE.Vector3()); return Math.atan2(-d.x, -d.z); };
    const head = engine.headPosition(new THREE.Vector3());
    const dy = height - 1.17;                       // boards were laid out for a 1.17 m seated eye height
    let yaw = headYaw();
    place(yaw, head, head.y + dy);
    const off = engine.onFrame(dt => {
      const h = engine.headPosition(new THREE.Vector3()), want = headYaw();
      let d = want - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) > 0.9 || g.userData.following) {                     // turned more than ~50°: glide back in front
        g.userData.following = Math.abs(d) > 0.05;
        yaw += d * Math.min(1, dt * 2.5);
        place(yaw, h, h.y + dy);
      }
    });
    scope.add(off);
  } else {
    // desktop: in front of the (possibly pitched) view, at the station's own floor height (the tower deck is 6 m up)
    const head = engine.headPosition(new THREE.Vector3());
    const dir = engine.camera.getWorldDirection(new THREE.Vector3());
    if (side) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(side, dist));
    g.position.copy(head).addScaledVector(dir, dist);
    g.position.y += Math.max(0, height - 1.25) * 0.5;
    g.lookAt(head);
    void s;
  }
  ctx.engine.scene.add(g); scope.add(g);
  if (ctx.params?.has('tour')) ctx.tourPending = (ctx.tourPending || 0) + 1;   // ?tour: screenshot once it renders
  return g;
}

/** Lay out panels/cards in a row on a board (RTL: first item on the right). */
export function row(group, items, { y = 0, gap = 0.04, z = 0.01 } = {}) {
  const ws = items.map(it => it.mesh.geometry.parameters.width);
  const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = total / 2;
  items.forEach((it, i) => { x -= ws[i] / 2; it.mesh.position.set(x, y, z); group.add(it.mesh); x -= ws[i] / 2 + gap; });
}

// ---------- pictograms (canvas painters: (g, x, y, w, h)) ----------
// Cards speak in pictures, not sentences: draw a small icon per choice. Add your experiment's own painters here.
const INK = '#EEF2F8', OXY = '#3CC4BC', MARS = '#E8643A';
export const ICON = {
  /** A hand-drawn graph shape for hypothesis cards: 'rise' | 'flat' | 'peak'. Axis labels sit inside the icon box. */
  graph(shape, { xLabel = 'טמפרטורה →', yLabel = 'תוצאה' } = {}) {
    return (g, x, y, w, h) => {
      const f = Math.round(h * 0.16); const lm = f * 1.3, bm = f * 1.4;
      g.fillStyle = '#9FB0C8'; g.font = `600 ${f}px Heebo`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(xLabel, x + lm + (w - lm) / 2, y + h - bm / 2);
      g.save(); g.translate(x + lm / 2, y + (h - bm) / 2); g.rotate(-Math.PI / 2); g.fillText(yLabel, 0, 0); g.restore();
      x += lm; w -= lm; h -= bm;
      g.strokeStyle = '#7f93b0'; g.lineWidth = 6; g.beginPath(); g.moveTo(x + 10, y); g.lineTo(x + 10, y + h); g.lineTo(x + w, y + h); g.stroke();
      g.strokeStyle = OXY; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath();
      const X = t => x + 20 + t * (w - 30), Y = v => y + h - 10 - v * (h - 20);
      // math convention (as in Israeli textbooks): the x value grows to the right even in an RTL page
      const pts = shape === 'rise' ? [[0, 0.08], [0.5, 0.4], [1, 0.95]] : shape === 'flat' ? [[0, 0.5], [0.5, 0.5], [1, 0.5]] : [[0, 0.1], [0.55, 0.95], [1, 0.12]];
      const [a, b, c] = pts.map(([t, v]) => [X(t), Y(v)]);
      g.moveTo(...a); g.quadraticCurveTo(b[0], shape === 'peak' ? b[1] - h * 0.45 : b[1], ...c); g.stroke();
    };
  },
  thermometer: (g, x, y, w, h) => {
    const cx = x + w / 2; g.fillStyle = '#dfe6ee'; g.beginPath(); g.roundRect(cx - w * 0.08, y + h * 0.05, w * 0.16, h * 0.7, w * 0.08); g.fill();
    g.fillStyle = '#e23b2a'; g.beginPath(); g.arc(cx, y + h * 0.8, w * 0.14, 0, 7); g.fill(); g.fillRect(cx - w * 0.04, y + h * 0.35, w * 0.08, h * 0.45);
  },
  timer: (g, x, y, w, h) => {
    const cx = x + w / 2, cy = y + h * 0.55, r = Math.min(w, h) * 0.35;
    g.strokeStyle = INK; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    g.fillStyle = MARS; g.fillRect(cx - r * 0.2, cy - r - h * 0.12, r * 0.4, h * 0.08);
    g.strokeStyle = MARS; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + r * 0.5, cy - r * 0.5); g.stroke();
  },
  /** A dashed sorting bin with a word in it (independent / dependent / controlled variables...). */
  bin(label, color) {
    return (g, x, y, w, h) => {
      g.strokeStyle = color; g.lineWidth = 10; g.setLineDash([22, 14]); g.beginPath(); g.roundRect(x + 8, y + 8, w - 16, h - 16, 24); g.stroke(); g.setLineDash([]);
      g.fillStyle = color; g.font = `800 ${h * 0.34}px Heebo`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, y + h / 2);
    };
  },
};
