// The opening film on a big screen in a dark void (static viewpoint, comfortable seated), with subtitles.
// createIntroVideo() is called at boot so the file preloads; primeIntroVideo() runs inside the start click so later
// playback with sound is allowed; playIntroCinema() resolves 'ended' | 'skipped' | 'unavailable' (→ in-engine opening)
// and leaves the screen faded to black for the caller to fade in.
import * as THREE from 'three';
import { INTRO_VIDEO, cueAt } from '../game/introVideo.js';
import { LINES } from '../game/script.js';

export function createIntroVideo() {
  const el = document.createElement('video');
  const src = el.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') ? INTRO_VIDEO.src.mp4
    : el.canPlayType('video/webm; codecs="vp9, opus"') ? INTRO_VIDEO.src.webm : null;
  if (!src) return null;
  el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.src = src;
  let state = 'loading';
  const ready = new Promise(res => {
    el.addEventListener('canplaythrough', () => { state = 'ready'; res(true); }, { once: true });
    el.addEventListener('error', () => { state = 'error'; res(false); }, { once: true });
  });
  el.load();
  return { el, ready, get state() { return state; } };
}

export function primeIntroVideo(video) {
  if (!video) return;
  const el = video.el; el.volume = 0;
  el.play()?.then(() => { if (video.inUse) return; el.pause(); el.currentTime = 0; el.volume = 1; }).catch(() => { if (!video.inUse) el.volume = 1; });
}

export async function playIntroCinema(ctx, scope, video, { loadTimeout = 15000, rate = 1, skipAfterMs = 3000 } = {}) {
  const { engine, ui, lab } = ctx;
  const { scene } = engine;
  const el = video.el;

  if (video.state !== 'ready') {
    const ok = await scope.guard(Promise.race([video.ready, new Promise(r => setTimeout(() => r(false), loadTimeout))]));
    if (!ok) return 'unavailable';
  }

  const hidden = [lab.root].filter(o => o && o.visible);
  const bg = scene.background, fog = scene.fog;
  const tex = new THREE.VideoTexture(el); tex.colorSpace = THREE.SRGBColorSpace;
  const cinema = new THREE.Group(); cinema.name = 'cinema';
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.9), new THREE.MeshBasicMaterial({ color: 0x1a0f0a, toneMapped: false, fog: false }));
  frame.position.z = -0.01; cinema.add(frame, screen);
  screen.userData.panel = 'filmScreen'; ui.panels?.add(screen);       // ?test overlap audit: nothing may cover the film
  let skip = null, offCue = () => {}, offVis = () => {};
  const restore = () => {
    offCue(); offVis();
    try { el.pause(); } catch { /* gone */ }
    if (skip) { ctx.input.unregister(skip.mesh); skip.dispose(); skip = null; }
    ui.panels?.delete(screen); scene.remove(cinema); screen.geometry.dispose(); frame.geometry.dispose(); screen.material.dispose(); frame.material.dispose(); tex.dispose();
    scene.background = bg; scene.fog = fog;
    hidden.forEach(o => { o.visible = true; });
    ui.subtitles.hide(); ui.subtitles.dock(null);
    video.inUse = false;
    ctx.introPhase = 'done';
  };

  let result = 'ended';
  try {
    await engine.fade(1, 400);
    hidden.forEach(o => { o.visible = false; });
    scene.background = new THREE.Color(0x000000); scene.fog = null;
    await engine.nextFrame();
    ui.inFront(cinema, 3.0, 0.05);
    if (!engine.isXR()) {          // desktop: centre it on the (pitched) view so it isn't keystoned
      const head = engine.headPosition(new THREE.Vector3());
      cinema.position.copy(head).addScaledVector(engine.camera.getWorldDirection(new THREE.Vector3()), 3.0);
      cinema.lookAt(head);
    }
    // the subtitles sit under the picture (scaled to the 3 m screen), never over it; the skip button below them
    ui.subtitles.dock(cinema, [0, -1.32, 0.03], 2.1);
    ctx.introPhase = 'video';
    video.inUse = true;
    el.currentTime = 0; el.volume = 1; el.playbackRate = rate;
    await el.play();
    await engine.fade(0, 600);

    let shown = null;
    window.__introCues = [];
    offCue = engine.onFrame(() => {
      const c = cueAt(el.currentTime);
      if (c && c.id !== shown) {
        shown = c.id; window.__introCues.push(c.id);
        const l = LINES[c.id]; ui.subtitles.show(l.speaker, l.text, ((c.at + c.dur - el.currentTime) * 1000) / rate + 300);
      }
      if (!c) shown = null;
    });
    // headset taken off / tab hidden: pause the film, resume when back
    const session = engine.renderer.xr.getSession?.();
    const onVis = () => { const away = document.hidden || (session && session.visibilityState !== 'visible'); if (away) el.pause(); else if (!el.ended) el.play().catch(() => {}); };
    document.addEventListener('visibilitychange', onVis); session?.addEventListener('visibilitychange', onVis);
    offVis = () => { document.removeEventListener('visibilitychange', onVis); session?.removeEventListener('visibilitychange', onVis); };

    const ended = new Promise(res => { if (el.ended) res('ended'); else el.addEventListener('ended', () => res('ended'), { once: true }); });
    // a replay (or a student who has seen it) can skip, but not in the first seconds
    const skipped = new Promise(res => setTimeout(() => {
      if (el.ended || scope.aborted) return;
      skip = ui.button3d('דילוג על הפתיחה', () => res('skipped'), { w: 0.9, h: 0.17, viewDist: 3 });
      skip.mesh.name = 'skipIntro'; skip.mesh.position.set(0, -2.0, 0.02); cinema.add(skip.mesh);
    }, skipAfterMs / rate));
    result = await scope.guard(Promise.race([ended, skipped]));
    await engine.fade(1, 500);
  } catch (e) {
    await engine.fade(1, 250);
    restore();
    if (e?.name === 'NotAllowedError' || e?.name === 'NotSupportedError') return 'unavailable';
    throw e;
  }
  restore();
  return result;
}
