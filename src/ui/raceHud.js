// The race HUD on desktop (DOM over the canvas; the headset gets its numbers on the dashboard instead):
//   bottom-right — speedometer (arc + km/h), bottom-left — mini-map of the circuit (you = orange, Bumper = teal),
//   top-left — lap timer, the gap to Bumper and how much of the lap is done. A finish card at the end.
// Pure presentation: the race chapter calls show/update/finish/hide.
import * as THREE from 'three';

const CSS = `
#raceHud { position:fixed; inset:0; pointer-events:none; z-index:5; font-family:Heebo, "Segoe UI", sans-serif; color:#eef2f8; }
#raceHud .panel { position:absolute; background:linear-gradient(180deg, rgba(14,18,28,.88), rgba(8,11,18,.92)); border:1px solid rgba(255,179,71,.28);
  border-radius:18px; box-shadow:0 10px 30px rgba(0,0,0,.35); }
#raceHud .speedo { right:18px; bottom:18px; width:208px; height:150px; direction:ltr; }
#raceHud .speedo svg { position:absolute; inset:8px 14px auto 14px; width:180px; height:110px; }
#raceHud .speedo .num { position:absolute; left:0; right:0; top:58px; text-align:center; font-weight:800; font-size:46px; letter-spacing:-1px; line-height:1; font-variant-numeric:tabular-nums; }
#raceHud .speedo .unit { position:absolute; left:0; right:0; top:108px; text-align:center; font-size:13px; color:#9fb0c8; font-weight:600; }
#raceHud .map { left:18px; bottom:18px; width:210px; height:210px; padding:0; overflow:hidden; }
#raceHud .map canvas { width:210px; height:210px; display:block; }
#raceHud .lap { left:18px; top:18px; min-width:230px; padding:12px 16px 12px; text-align:right; }
#raceHud .lap .t { direction:ltr; text-align:right; font-weight:800; font-size:34px; line-height:1.05; font-variant-numeric:tabular-nums; }
#raceHud .lap .gap { font-size:16px; font-weight:700; margin-top:4px; }
#raceHud .lap .gap.ahead { color:#7cf0a2; } #raceHud .lap .gap.behind { color:#3cc4bc; }
#raceHud .lap .bar { height:6px; background:#26324a; border-radius:3px; margin-top:9px; position:relative; overflow:visible; }
#raceHud .lap .bar i { position:absolute; inset:0 auto 0 0; background:#ffb347; border-radius:3px; }
#raceHud .lap .bar b { position:absolute; top:-3px; width:4px; height:12px; background:#3cc4bc; border-radius:2px; }
#raceHud .lap .lbl { font-size:12px; color:#9fb0c8; font-weight:600; letter-spacing:.2px; }
#raceHud .finish { left:50%; top:46%; transform:translate(-50%,-50%) scale(.92); opacity:0; transition:opacity .35s, transform .35s; padding:22px 34px; text-align:center; min-width:320px; }
#raceHud .finish.on { opacity:1; transform:translate(-50%,-50%) scale(1); }
#raceHud .finish h2 { margin:0 0 6px; font-size:30px; color:#ffb347; }
#raceHud .finish p { margin:2px 0; font-size:18px; font-weight:600; }
#raceHud .finish .num { direction:ltr; display:inline-block; font-variant-numeric:tabular-nums; font-weight:800; }
#startLights { position:fixed; left:50%; top:130px; transform:translateX(-50%); z-index:6; pointer-events:none; text-align:center; font-family:Heebo, "Segoe UI", sans-serif; }
#startLights .bar { display:inline-flex; gap:16px; padding:16px 22px; background:linear-gradient(180deg,#15181f,#0a0c11); border-radius:20px; border:2px solid #2a2f3a; box-shadow:0 12px 34px rgba(0,0,0,.45); direction:ltr; }
#startLights .bar i { width:58px; height:58px; border-radius:50%; background:radial-gradient(circle at 40% 35%, #4a1010, #240606); box-shadow:inset 0 0 0 3px #000; transition:background .05s; }
#startLights .bar i.on { background:radial-gradient(circle at 40% 35%, #ff8a80, #ff1a1a 45%, #a00000); box-shadow:inset 0 0 0 3px #000, 0 0 26px 6px rgba(255,40,40,.65); }
#startLights .times { margin-top:12px; display:inline-flex; gap:10px; direction:ltr; }
#startLights .times b { min-width:110px; padding:8px 14px; border-radius:12px; background:rgba(8,12,20,.9); color:#eef2f8; font-size:28px; font-weight:800; font-variant-numeric:tabular-nums; border:1px solid rgba(255,179,71,.35); }
#startLights .times b.empty { color:#56637a; }
#startLights .lbl { display:inline-block; color:#ffb347; font-size:16px; font-weight:700; margin-top:8px; padding:3px 14px; border-radius:999px; background:rgba(8,12,20,.85); }
#startLights .lbl + .times { display:flex; justify-content:center; }
@media (max-width: 760px) { #raceHud .map { width:150px; height:150px; } #raceHud .map canvas { width:150px; height:150px; } #raceHud .speedo { transform:scale(.8); transform-origin:bottom right; } }
`;


const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };

/** The headset's race readout: a small dash display between the seats (speed, lap time, the gap to Bumper),
 *  drawn over the dash edge it touches (like the task card), facing the driver's eye. */
function dashDisplay(ui, car3d) {
  let st = { kmh: 0, t: 0, gap: '' };
  const p = ui.panel({ w: 0.24, h: 0.11, ppm: 1400, viewDist: 0.8, name: 'raceDash', depthTest: false, draw(c, W, H) {
    ui.rr(c, 3, 3, W - 6, H - 6, 18); c.fillStyle = 'rgba(8,11,18,0.95)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#FFB347'; c.stroke();
    c.fillStyle = '#EEF2F8'; ui.fitText(c, `⁦${st.kmh}⁩ קמ״ש`, { x: 14, y: 6, w: W * 0.5 - 14, h: H * 0.6, maxPx: H * 0.48, font: ui.FONT, weight: 800 });
    c.fillStyle = '#9FB0C8'; ui.fitText(c, `⁦${fmt(st.t)}⁩`, { x: 14, y: H * 0.62, w: W * 0.5 - 14, h: H * 0.32, maxPx: H * 0.26, font: ui.FONT, weight: 600 });
    c.fillStyle = '#3CC4BC'; ui.fitText(c, st.gap, { x: W * 0.5, y: 8, w: W * 0.5 - 14, h: H - 16, maxPx: H * 0.3, font: ui.FONT, weight: 700 });
  } });
  p.mesh.position.set(0, 1.0, 0.42);
  { const o = new THREE.Object3D(); o.position.set(0, 1.0, 0.42); o.lookAt(0.38, 1.12, -0.35); p.mesh.quaternion.copy(o.quaternion); }
  p.mesh.renderOrder = 60; p.mesh.userData.ui = true;
  car3d.add(p.mesh);
  let last = 0;
  return {
    set(v) { st = v; const now = performance.now(); if (now - last > 120) { last = now; p.redraw(); } },
    dispose() { p.mesh.removeFromParent(); p.dispose?.(); },
  };
}

export function createRaceHud(engine) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'raceHud'; root.hidden = true;
  root.innerHTML = `
    <div class="panel lap"><div class="lbl">זמן הקפה</div><div class="t">0:00.0</div><div class="gap"></div><div class="bar"><i></i><b></b></div></div>
    <div class="panel map"><canvas width="420" height="420"></canvas></div>
    <div class="panel speedo"><svg viewBox="0 0 180 110"><path d="M18 100 A72 72 0 1 1 162 100" fill="none" stroke="#26324a" stroke-width="12" stroke-linecap="round"/>
      <path class="arc" d="M18 100 A72 72 0 1 1 162 100" fill="none" stroke="#ffb347" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/></svg>
      <div class="num">0</div><div class="unit">קמ״ש</div></div>
    <div class="panel finish"><h2></h2><p class="you"></p><p class="bumper"></p></div>`;
  document.body.appendChild(root);
  // desktop start lights (big, at the top of the screen — the 3D gantry is too far away to read in the chase camera)
  const sl = document.createElement('div'); sl.id = 'startLights'; sl.hidden = true;
  sl.innerHTML = '<div class="bar"><i></i><i></i><i></i><i></i><i></i></div><div class="lbl">זמני התגובה שלך</div><div class="times"></div>';
  document.body.appendChild(sl);
  const bulbs = [...sl.querySelectorAll('.bar i')], timesEl = sl.querySelector('.times');
  const $ = q => root.querySelector(q);
  const tEl = $('.t'), gapEl = $('.gap'), barEl = $('.bar i'), ghostTick = $('.bar b'), numEl = $('.num'), arc = $('.arc');
  const cv = $('.map canvas'), g = cv.getContext('2d');
  let base = null, bounds = null, track = null;

  function drawBase() {
    const xs = track.points.xs, zs = track.points.zs;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < xs.length; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]); }
    const pad = 34, S = Math.min((cv.width - 2 * pad) / (x1 - x0), (cv.height - 2 * pad) / (z1 - z0));
    // seen from the tower: east (+x) on the right, away from the tower (−z) up
    bounds = { map: (x, z) => [cv.width / 2 + (x - (x0 + x1) / 2) * S, cv.height / 2 + (z - (z0 + z1) / 2) * S] };
    base = document.createElement('canvas'); base.width = cv.width; base.height = cv.height;
    const b = base.getContext('2d');
    b.lineJoin = b.lineCap = 'round';
    const path = () => { b.beginPath(); for (let i = 0; i < xs.length; i += 4) { const [px, py] = bounds.map(xs[i], zs[i]); i ? b.lineTo(px, py) : b.moveTo(px, py); } b.closePath(); };
    path(); b.strokeStyle = 'rgba(0,0,0,.55)'; b.lineWidth = 22; b.stroke();
    path(); b.strokeStyle = '#d9dee8'; b.lineWidth = 12; b.stroke();
    path(); b.strokeStyle = '#3a4560'; b.lineWidth = 7; b.stroke();
    const [w0, w1] = track.def.wet;                                     // the wet corner in blue
    b.beginPath(); for (let s = w0; s <= w1; s += 2) { const p = track.sample(s), [px, py] = bounds.map(p.x, p.z); s === w0 ? b.moveTo(px, py) : b.lineTo(px, py); }
    b.strokeStyle = '#5aa0ff'; b.lineWidth = 7; b.stroke();
    const st = track.sample(0), [sx, sy] = bounds.map(st.x, st.z);      // start line
    b.save(); b.translate(sx, sy); b.rotate(Math.atan2(st.tz, st.tx) + Math.PI / 2);
    b.fillStyle = '#fff'; b.fillRect(-11, -3, 22, 6); b.restore();
  }

  function dot(x, z, heading, col, r) {
    const [px, py] = bounds.map(x, z);
    g.save(); g.translate(px, py); g.rotate(Math.atan2(Math.cos(heading), Math.sin(heading)));
    g.beginPath(); g.moveTo(r * 1.5, 0); g.lineTo(-r, r); g.lineTo(-r * 0.5, 0); g.lineTo(-r, -r); g.closePath();
    g.fillStyle = col; g.strokeStyle = '#0b0f18'; g.lineWidth = 3; g.fill(); g.stroke(); g.restore();
  }

  let dash = null;
  const hud = {
    /** Start lights on desktop: show(true/false), lit(n), times([s, …], slots). */
    lights: {
      show(on) { sl.hidden = !on || engine.isXR(); },
      lit(n) { bulbs.forEach((b, i) => b.classList.toggle('on', i < n)); },
      times(list, slots = 3) {
        timesEl.replaceChildren(...Array.from({ length: slots }, (_, i) => {
          const b = document.createElement('b');
          if (list[i] != null) b.textContent = Math.round(list[i] * 1000) + ' ms'; else { b.textContent = '—'; b.className = 'empty'; }
          return b;
        }));
      },
    },
    /** The headset version (call once the car exists): a dash display. */
    attachXR(ui, car3d) { dash?.dispose(); dash = dashDisplay(ui, car3d); },
    show(tr) { if (engine.isXR()) return; track = tr; drawBase(); root.hidden = false; $('.finish').classList.remove('on'); },
    hide() { root.hidden = true; dash?.dispose(); dash = null; },
    update({ t, progress, ghost, length, speed, car, ghostPos }) {
      if (dash) { const d = ghost - progress; dash.set({ kmh: Math.round(Math.abs(speed) * 3.6), t, gap: Math.abs(d) < 4 ? 'צמוד!' : d > 0 ? `באמפר +⁦${Math.round(d)}⁩ מ׳` : `מובילים ⁦${Math.round(-d)}⁩ מ׳` }); }
      if (root.hidden) return;
      tEl.textContent = fmt(t);
      const kmh = Math.round(Math.abs(speed) * 3.6);
      numEl.textContent = kmh;
      arc.setAttribute('stroke-dasharray', `${Math.min(100, (Math.abs(speed) / 26) * 100).toFixed(1)} 100`);
      const p = Math.max(0, Math.min(1, progress / length)), gp = Math.min(1, ghost / length);
      barEl.style.width = `${(p * 100).toFixed(1)}%`; ghostTick.style.left = `calc(${(gp * 100).toFixed(1)}% - 2px)`;
      const d = ghost - progress;
      gapEl.className = 'gap ' + (d > 0 ? 'behind' : 'ahead');
      gapEl.textContent = Math.abs(d) < 4 ? 'צמוד לבאמפר!' : d > 0 ? `באמפר לפניכם ב-${Math.round(d)} מ׳` : `אתם מובילים ב-${Math.round(-d)} מ׳`;
      g.clearRect(0, 0, cv.width, cv.height); g.drawImage(base, 0, 0);
      if (ghostPos) { const q = track.nearest(ghostPos.x, ghostPos.z); const pp = track.sample(q.s); dot(ghostPos.x, ghostPos.z, Math.atan2(pp.tx, pp.tz), '#3cc4bc', 9); }
      dot(car.x, car.z, car.heading, '#ff8a2a', 11);
    },
    finish({ time, ghostTime, won }) {
      if (root.hidden) return;
      $('.finish h2').textContent = won ? 'ניצחתם את באמפר!' : 'סיימתם את ההקפה';
      $('.finish .you').innerHTML = `הזמן שלכם: <span class="num">${fmt(time)}</span>`;
      $('.finish .bumper').innerHTML = `באמפר: <span class="num">${fmt(ghostTime)}</span>`;
      $('.finish').classList.add('on');
    },
  };
  return hud;
}
