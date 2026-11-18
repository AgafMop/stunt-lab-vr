// The production notebook's results page: a table (speed × 3 repeats, mean; disqualified readings struck through with
// the reason) and a live graph of braking distance against speed. Fixed home on the tower, front-right and above
// the horizon in the headset (only sky behind it); on desktop lower, where the pitched view sees it.
// It redraws on every recorded trial. board.focus(true) brings it in front of the student (the graph chapter).
import * as THREE from 'three';
import { mean } from '../game/model.js';

const num = s => `⁦${s}⁩`;

export function createResultsBoard(ctx, { surface = null } = {}) {
  const { ui, game, engine } = ctx;
  let showCurve = false, highlight = null, pairs = [], mode = 'speed';
  const W0 = 1.0, H0 = 0.62;
  const panel = ui.panel({ w: W0, h: H0, ppm: 1000, viewDist: 1.25, name: 'results', draw(c, W, H) {
    ui.rr(c, 6, 6, W - 12, H - 12, 26); c.fillStyle = 'rgba(14,20,30,0.97)'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#3a4c6a'; c.stroke();
    const mp = ui.minPx(1000, 1.25), F = ui.FONT;
    c.fillStyle = '#FFB347'; ui.fitText(c, mode === 'surface' ? 'מחברת ההפקה · משטחים ב-⁦70⁩ קמ״ש' : 'מחברת ההפקה · מהירות ומרחק בלימה', { x: 24, y: 14, w: W - 48, h: 48, maxPx: 40, minPx: mp, font: F });
    // ---- table (right half, RTL) ----
    const rows = mode === 'surface' ? surfaceRows() : speedRows();
    const tx = W * 0.5, tw = W * 0.5 - 30, ty = 74, rh = Math.min(52, (H - ty - 20) / Math.max(4, rows.length + 1));
    const cols = [tw * 0.22, tw * 0.165, tw * 0.165, tw * 0.165, tw * 0.285];
    const head = [mode === 'surface' ? 'משטח' : 'קמ״ש', '1', '2', '3', 'ממוצע'];
    let x = W - 30;
    c.fillStyle = '#9FB0C8';
    head.forEach((h, i) => { ui.fitText(c, h, { x: x - cols[i], y: ty, w: cols[i] - 6, h: rh - 8, maxPx: rh * 0.55, minPx: mp, font: F, weight: 600 }); x -= cols[i]; });
    rows.forEach((r, k) => {
      const y = ty + rh * (k + 1);
      if (highlight != null && r.key === highlight) { c.fillStyle = 'rgba(255,179,71,0.18)'; c.fillRect(tx, y - 2, tw, rh); }
      let xx = W - 30;
      c.fillStyle = '#EEF2F8'; ui.fitText(c, r.label, { x: xx - cols[0], y, w: cols[0] - 6, h: rh - 8, maxPx: rh * 0.55, minPx: mp, font: F, weight: 700 }); xx -= cols[0];
      for (let i = 0; i < 3; i++) {
        const t = r.trials[i];
        if (t) {
          c.fillStyle = t.valid ? '#EEF2F8' : '#e86a5a';
          ui.fitText(c, num(t.value >= 100 ? t.value.toFixed(0) : t.value.toFixed(1)), { x: xx - cols[i + 1], y, w: cols[i + 1] - 6, h: rh - 8, maxPx: rh * 0.5, minPx: mp, font: F, weight: 500 });
          if (!t.valid) { c.strokeStyle = '#e86a5a'; c.lineWidth = 3; c.beginPath(); c.moveTo(xx - cols[i + 1] + 6, y + rh * 0.45); c.lineTo(xx - 10, y + rh * 0.45); c.stroke(); }
        }
        xx -= cols[i + 1];
      }
      const m = r.mean;
      c.fillStyle = '#7CFF9B'; if (m != null) ui.fitText(c, num(m >= 100 ? m.toFixed(0) : m.toFixed(1)), { x: xx - cols[4], y, w: cols[4] - 6, h: rh - 8, maxPx: rh * 0.5, minPx: mp, font: F, weight: 700 });
    });
    // ---- graph (left half) ----
    if (mode !== 'surface') drawGraph(c, 30, 74, W * 0.46 - 30, H - 104, rows, mp);
    else drawBars(c, 30, 74, W * 0.46 - 30, H - 104, rows, mp);
  } });
  panel.mesh.name = 'resultsBoard';

  function speedRows() {
    const keys = Object.keys(game.s.trials).map(Number).filter(k => !Number.isNaN(k)).sort((a, b) => a - b);
    return keys.map(k => { const t = game.s.trials[k]; const v = t.filter(x => x.valid).map(x => x.value); return { key: k, label: num(k), trials: t, mean: v.length ? mean(v) : null }; });
  }
  function surfaceRows() {
    const names = { dry: 'יבש', wet: 'רטוב', sand: 'חול', oil: 'שמן' };
    return ['dry', 'wet', 'sand', 'oil'].map(s => { const t = game.s.surfaceTrials?.[s] || []; const v = t.filter(x => x.valid).map(x => x.value); return { key: s, label: names[s], trials: t, mean: v.length ? mean(v) : null }; });
  }
  function drawGraph(c, x0, y0, w, h, rows, mp) {
    c.fillStyle = '#0d1420'; c.fillRect(x0, y0, w, h);
    const X = v => x0 + 40 + (v / 130) * (w - 60), Y = d => y0 + h - 40 - (d / 90) * (h - 60);
    c.strokeStyle = '#5a6a85'; c.lineWidth = 3; c.beginPath(); c.moveTo(X(0), Y(90)); c.lineTo(X(0), Y(0)); c.lineTo(X(130), Y(0)); c.stroke();
    c.fillStyle = '#9FB0C8'; c.font = `500 ${Math.max(mp, 18)}px ${ui.FONT}`; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = 0; v <= 120; v += 40) c.fillText(`${v}`, X(v), Y(0) + 6);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let d = 0; d <= 80; d += 40) c.fillText(`${d}`, X(0) - 6, Y(d));
    c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText('קמ״ש', X(120), Y(0) + 36);
    if (showCurve) {                                                   // d = v²/(2μg): the shape the data draw
      c.strokeStyle = 'rgba(124,255,155,0.8)'; c.lineWidth = 3; c.beginPath();
      for (let v = 0; v <= 125; v += 2) { const d = (v / 3.6) ** 2 / (2 * 0.75 * 9.8); v ? c.lineTo(X(v), Y(Math.min(90, d))) : c.moveTo(X(v), Y(d)); }
      c.stroke();
    }
    for (const r of rows) for (const t of r.trials) {
      c.fillStyle = t.valid ? '#EEF2F8' : '#e86a5a';
      c.beginPath(); c.arc(X(t.kmh ?? r.key), Y(Math.min(90, t.value)), t.valid ? 6 : 8, 0, 7); c.fill();
    }
    for (const r of rows) if (r.mean != null) { c.fillStyle = '#7CFF9B'; c.fillRect(X(r.key) - 9, Y(r.mean) - 3, 18, 6); }
    for (const p of pairs) {                                           // ×2 → ×4 arrows (the graph chapter)
      c.strokeStyle = '#FFB347'; c.lineWidth = 4; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(X(p.a), Y(p.da)); c.lineTo(X(p.b), Y(p.da)); c.lineTo(X(p.b), Y(p.db)); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#FFB347'; c.font = `800 ${Math.max(mp, 22)}px ${ui.FONT}`; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText('×2', (X(p.a) + X(p.b)) / 2, Y(p.da) - 4);
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(`×${(p.db / p.da).toFixed(1)}`, X(p.b) + 8, (Y(p.da) + Y(p.db)) / 2);
    }
  }
  function drawBars(c, x0, y0, w, h, rows, mp) {
    c.fillStyle = '#0d1420'; c.fillRect(x0, y0, w, h);
    const max = 140, bw = (w - 40) / rows.length;
    const cols = { dry: '#c7c2b8', wet: '#5a86c8', sand: '#d8a060', oil: '#3a3330' };
    rows.forEach((r, i) => {
      if (r.mean == null) return;
      const bh = (r.mean / max) * (h - 70), bx = x0 + 20 + i * bw + bw * 0.15;
      c.fillStyle = cols[r.key]; c.fillRect(bx, y0 + h - 40 - bh, bw * 0.7, bh);
      c.fillStyle = '#EEF2F8'; c.font = `600 ${Math.max(mp, 18)}px ${ui.FONT}`; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(r.label, bx + bw * 0.35, y0 + h - 34);
    });
  }

  // homes: XR front-right above the horizon (sky only); focus = in front of the student (the graph chapter).
  // Desktop: a fixed card in the top-right corner of the screen (DOM, a copy of the same canvas): over the sky, never
  // over the strip, so the cars stay in view on every run (the 3D board there covered the fast runs' stopping zone).
  const home = new THREE.Group(); home.name = 'resultsHome'; ctx.lab.root.add(home);
  home.add(panel.mesh);
  const dom = deskCard(panel);
  const redraw0 = panel.redraw.bind(panel);
  panel.redraw = (...a) => { redraw0(...a); dom.copy(); };
  dom.copy();
  const eyeY = 6 + 1.17;
  let focused = false;
  const place = () => {
    if (focused) home.position.set(0, eyeY - 0.08, -2.35);
    else if (engine.isXR()) home.position.set(0.95, eyeY + 0.32, -2.3);
    else home.position.set(0.95, eyeY - 0.38, -2.45);
    home.lookAt(0, eyeY, -1.4);
    home.visible = focused || engine.isXR();
  };
  place();
  let lastXR = engine.isXR();
  const offFrame = engine.onFrame(() => {
    if (engine.isXR() !== lastXR) { lastXR = engine.isXR(); place(); }
    dom.show(!focused && !engine.isXR() && panel.mesh.visible);
  });
  const offTrial = game.on?.('trial', () => panel.redraw()) ?? (() => {});
  const board = {
    panel, mesh: panel.mesh,
    redraw: () => panel.redraw(),
    setMode(m) { mode = m; panel.redraw(); },
    curve(on) { showCurve = on; panel.redraw(); },
    highlight(key) { highlight = key; panel.redraw(); },
    pair(a, b, da, db) { pairs.push({ a, b, da, db }); panel.redraw(); },
    clearPairs() { pairs = []; panel.redraw(); },
    focus(on) { focused = on; place(); },
    dispose() { offFrame(); offTrial(); dom.dispose(); home.removeFromParent(); panel.dispose(); },
    /** Desktop: the card's screen rectangle (null when hidden) — the test checks it never covers a run. */
    deskRect: () => dom.rect(),
  };
  void surface;
  return board;
}

/** The desktop copy of the board: a DOM canvas in the top-right corner, under the meter. */
function deskCard(panel) {
  const el = document.createElement('canvas'); el.id = 'resultsCard';
  el.width = panel.canvas.width; el.height = panel.canvas.height;
  Object.assign(el.style, { position: 'fixed', right: '16px', top: '86px', width: 'min(34vw, 500px)', height: 'auto', zIndex: 4,
    pointerEvents: 'none', display: 'none', filter: 'drop-shadow(0 10px 24px rgba(0,0,0,.4))', transition: 'opacity .3s', opacity: '0' });
  document.body.appendChild(el);
  const g = el.getContext('2d');
  let on = false;
  return {
    copy() { g.clearRect(0, 0, el.width, el.height); g.drawImage(panel.canvas, 0, 0); },
    show(v) {
      if (v === on) return; on = v;
      if (v) { el.style.display = 'block'; requestAnimationFrame(() => { el.style.opacity = '1'; }); }
      else { el.style.opacity = '0'; el.style.display = 'none'; }
    },
    rect() { if (!on) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    dispose() { el.remove(); },
  };
}
