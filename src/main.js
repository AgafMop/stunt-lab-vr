// Boot: engine → input → lab → locomotion → UI/audio/game → chapters in order.
// URL flags:  ?test  audits + window.__ctx     ?auto   the game plays itself fast (e2e)     ?only=<chapter>  run one chapter
//             ?seed=N  fixed data              ?fresh  ignore the save                    ?demo  teacher "next stage" (M / B / Y)
//             ?animspeed=1  auto choices at real animation speed                         ?nogame  engine only
import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createLocomotion } from './core/locomotion.js';
import { createUI } from './core/ui3d.js';
import { createAudio } from './core/audio.js';
import { loadStuntSet } from './lab/stuntScene.js';
import { createGame } from './game/state.js';
import { createStorage } from './game/storage.js';
import { CHAPTERS, SAVE_KEY, METER } from './game/config.js';
import { createScope, Abort } from './chapters/kit.js';
import { createDriveSession } from './core/driveSession.js';
import { sampleRun, makeRng } from './game/model.js';
import * as chEnd from './chapters/ch_end.js';
import * as chRace from './chapters/ch_race.js';
import * as chStrip from './chapters/ch_strip.js';
import * as chIntro from './chapters/ch_intro.js';
import { createIntroVideo, primeIntroVideo } from './lab/introCinema.js';
import { createGuide } from './ui/guide.js';
import { createBumper } from './world/bumper.js';
import { DECK_Y } from './world/layout.js';

const CH = { intro: chIntro, race: chRace, strip: chStrip, end: chEnd };
const CH_NAMES = { intro: 'פתיחה', race: 'מבחן הקבלה', strip: 'הניסוי המרכזי', end: 'סיכום' };

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const AUTO = params.has('auto');

const engine = createEngine(document.body);
const input = createInput(engine);
const ui = createUI(engine, input, { audit: TEST });
const audio = createAudio(ui, { fast: AUTO });
const seed = Number(params.get('seed')) || (Date.now() % 100000);
const storage = createStorage();
const game = createGame({ seed, storage });
const ctx = { engine, input, ui, audio, game, storage, ready: false, params, auto: AUTO, seed, demo: params.has('demo') };
ctx.animSpeed = Number(params.get('animspeed')) || (AUTO ? 8 : 1);

if (TEST) {
  // motion audit: a visible tracked object must not jump (an isolated ≥ 6 cm one-frame step) unless the screen is faded
  ctx.motionAudit = []; const tracked = new Map(), seenJump = new Set(), P = new THREE.Vector3();
  ctx.track = (o, name) => { if (o && !tracked.has(o)) tracked.set(o, { name, last: null, vis: false }); };
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return !!o.parent; };
  engine.onAfterRender(() => {
    const dark = engine.fadeLevel() >= 0.9;
    for (const [o, t] of tracked) {
      const vis = shown(o); o.getWorldPosition(P);
      const d = vis && t.vis && t.last && !dark ? P.distanceTo(t.last) : 0;
      if (t.spike && d < 0.004) {
        const key = `${t.name}|${game.s.chapter}`;
        if (!seenJump.has(key)) { seenJump.add(key); ctx.motionAudit.push({ name: t.name, chapter: game.s.chapter, dist: Math.round(t.spike * 100) / 100 }); }
      }
      t.spike = d >= 0.06 && (t.prevD ?? 0) < 0.004 ? d : 0;
      t.prevD = d;
      t.last = (t.last || new THREE.Vector3()).copy(P); t.vis = vis;
    }
  });
  window.__ctx = ctx;
}
const saved = !params.has('only') && !params.has('fresh') ? storage.get(SAVE_KEY) : null;

// teacher demo (?demo): "next stage" ends the current chapter at once; skipFill() records what it would have produced
if (ctx.demo) {
  ctx.demoSkip = () => { if (ctx.scope && !ctx.scope.aborted) { audio.sfx('click'); ctx.scope.skip(); } };
  const b = document.createElement('button');
  b.className = 'btn alt'; b.type = 'button'; b.id = 'demoSkip'; b.textContent = '⏭ לשלב הבא';
  b.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:7;font-size:15px;padding:8px 16px';
  b.addEventListener('click', e => { e.stopPropagation(); ctx.demoSkip(); });
  document.body.append(b);
  addEventListener('keydown', e => { if (e.code === 'KeyM') ctx.demoSkip(); });
  let latch = false;
  engine.onFrame(() => {
    const ses = engine.renderer.xr.getSession?.(); if (!ses) return;
    const down = [...ses.inputSources].some(src => src.gamepad?.buttons[5]?.pressed);   // B (right) / Y (left)
    if (down && !latch) ctx.demoSkip();
    latch = down;
  });
}

// ?test&auto&tour: a screenshot of every new board (kit.js board/boardAtStation bump ctx.tourPending) → window.__tour
if (TEST && params.has('tour')) {
  window.__tour = []; let seen = 0, wait = 0;
  const select = input.select.bind(input); let q = Promise.resolve();      // auto clicks wait so each board stays on screen
  input.select = m => (q = q.then(() => new Promise(r => setTimeout(r, 1500))).then(() => select(m)));
  engine.onAfterRender(() => {
    if ((ctx.tourPending || 0) === seen) return;
    if (++wait < 2) return;
    wait = 0; seen = ctx.tourPending;
    window.__tour.push({ chapter: game.s.chapter, img: engine.renderer.domElement.toDataURL('image/jpeg', 0.8) });
  });
}

const $ = id => document.getElementById(id);

async function boot() {
  ctx.lab = await loadStuntSet(engine);
  { const g = createGuide(ctx); ctx.task = g.task; ctx.attention = g.attention; ctx.taskLog = []; }
  // Bumper stands on the tower deck behind-right of the chair (≈118° from straight ahead), turned to the student: the
  // strip spans ≈ −85°…+83° below the eyes, so anywhere further forward he would hide part of it or the cliff end
  ctx.bumper = createBumper(engine, audio);
  ctx.bumper.position.set(1.5, DECK_Y, -0.6); ctx.bumper.rotation.y = Math.atan2(-1.5, -0.8);
  ctx.lab.tower.add(ctx.bumper);
  { const cam = new THREE.Vector3(); ctx.bumper.userData.lookAt(() => engine.camera.getWorldPosition(cam)); }
  if (wantsFilm()) ctx.introVideo = createIntroVideo();   // preload while the set loads
  ctx.loco = createLocomotion(engine, input, { room: { x0: -1.7, x1: 1.7, z0: -1.7, z1: 1.7 }, blocks: [[-0.7, 0.7, -0.75, -0.15]] });
  for (const id of ['tower', 'pit']) if (ctx.lab.stationNodes[id]) ctx.loco.addStation(id, ctx.lab.stationNodes[id], ctx.lab.discs[id]);
  await ctx.loco.goTo('tower', { fade: false });
  await ui.fontsReady;
  $('enter').disabled = false; $('enter').textContent = 'כניסה במחשב';
  if (saved?.chapter && CH[saved.chapter] && saved.chapter !== CHAPTERS[0]) {
    $('resumeNote').hidden = false;
    $('resumeNote').firstChild.textContent = `נמצאה שמירה: ממשיכים מהפרק „${CH_NAMES[saved.chapter]}”. `;
  }
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) $('enterVR').hidden = false;
}

/** Load the opening film only when the intro chapter will run and play it. */
function wantsFilm() {
  if (params.has('nogame') || params.has('fx') || (AUTO && !params.has('film'))) return false;
  const only = params.get('only');
  if (only) return only === 'intro';
  return !(saved?.chapter && CH[saved.chapter] && saved.chapter !== 'intro');
}

async function start(vr) {
  $('boot').hidden = true;
  audio.unlock();                 // inside the click: browsers only allow sound after a gesture
  if (!ctx.started) primeIntroVideo(ctx.introVideo);
  if (vr) {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await engine.renderer.xr.setSession(session);
      session.addEventListener('end', () => { $('boot').hidden = false; });
    } catch (e) { console.warn('VR session refused', e); $('boot').hidden = false; return; }
  } else if (!ctx.started) {
    $('hint').hidden = false;
    $('hint').textContent = 'גוררים כדי להסתכל · לחיצה כפולה לנעילת עכבר · W A S D';
    setTimeout(() => { $('hint').hidden = true; }, 6000);
  }
  if (ctx.started) return;        // re-entering VR after the headset slept: never start a second game
  ctx.started = true;
  ui.wristMeter(game, { label: METER.label, max: METER.start, low: METER.low });
  ctx.ready = true;
  if (params.has('nogame')) return;
  if (params.get('fx') === 'drive') { driveSandbox().catch(err => console.error(err)); return; }
  runGame().catch(err => console.error(err));
}

/** ?fx=drive — drive the race car freely (no chapter). ?ride=off locks the tabletop view; otherwise start in the cockpit. */
async function driveSandbox() {
  const forced = params.get('ride') === 'off';
  ctx.drive = createDriveSession(ctx, { forced });
  await ctx.drive.view.setMode(forced ? 'table' : 'cockpit');
  ctx.drive.start();
}

async function runGame() {
  const only = params.get('only');
  let list = only ? [only] : CHAPTERS.filter(id => CH[id]);
  if (!only && saved?.chapter && CH[saved.chapter] && game.loadSave()) {
    list = list.slice(list.indexOf(saved.chapter));
    game.spend(0);                // refresh the meter with the saved value
  }
  if (only) seedFor(only);
  for (const id of list) await runChapter(id);
  window.__gameDone = true;
}

/** State a chapter expects when run alone (?only=<id>) — keep in step with skipFill. */
function seedFor(id) {
  void id;
}

/** Teacher demo: a skipped chapter leaves the state as if played (results recorded from the same science model). */
function skipFill(id) {
  if (id === 'race') {
    game.s.flags.view ??= 'table';
    game.s.reaction ??= { simple: [0.28, 0.28, 0.28], falseStarts: 0 };
    if (!game.s.reaction.simple.length) game.s.reaction.simple = [0.28, 0.28, 0.28];
    game.s.flags.lapDone = true;
  }
  if (id === 'strip' && !Object.keys(game.s.trials).length) {
    const r = sampleRun(60, 'dry', makeRng(game.s.seed * 31 + 8));
    game.addTrial(r.kmh, { value: r.distance, kmh: r.kmh, target: 60, by: 'student' }, { free: true });
    game.s.flags.rodeAlong ??= false;
  }
}

async function runChapter(id) {
  for (;;) {
    game.setChapter(id);
    const scope = createScope(ctx); ctx.scope = scope;
    if (TEST) setTimeout(() => {            // per-chapter draw-call / triangle budget
      const { renderer, scene, camera } = engine;
      renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera);
      (window.__budget ||= {})[id] = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
      renderer.info.autoReset = true;
    }, 1500);
    // let a failure animation (ctx.pendingFx) finish before the chapter is torn down
    const offOver = game.on('gameover', () => setTimeout(async () => { await ctx.pendingFx; scope.abort(); }, 0));
    try {
      await CH[id].run(ctx, scope);
      offOver(); scope.cleanup();
      window.__chapterDone = id;
      return;
    } catch (e) {
      offOver(); scope.cleanup();
      if (!(e instanceof Abort)) throw e;
      if (scope.skipped) { audio.stop?.(); skipFill(id); window.__chapterDone = id; return; }
    }
    await gameOverPanel();
    game.restoreCheckpoint();
  }
}

async function gameOverPanel() {
  window.__gameOver = (window.__gameOver || 0) + 1;
  audio.sfx('alarm');
  const p = ui.panel({ w: 0.8, h: 0.34, name: 'gameover', draw(g, W, H) {
    ui.rr(g, 6, 6, W - 12, H - 12, 30); g.fillStyle = 'rgba(40,8,6,0.94)'; g.fill(); g.lineWidth = 8; g.strokeStyle = ui.C.bad; g.stroke();
    g.fillStyle = ui.C.ink; ui.fitText(g, 'נגמר!', { x: 30, y: H * 0.12, w: W - 60, h: H * 0.4, maxPx: H * 0.26, minPx: ui.minPx(900), font: ui.FONT, weight: 800 });
    g.fillStyle = ui.C.muted; ui.fitText(g, 'נחזור לתחילת הפרק ונתקן.', { x: 30, y: H * 0.56, w: W - 60, h: H * 0.3, maxPx: H * 0.13, minPx: ui.minPx(900), font: ui.FONT, weight: 500 });
  } });
  ui.inFront(p.mesh, 1.3, -0.05);
  const btn = ui.button3d('חזרה לנקודת השמירה', () => {}, { w: 0.44, h: 0.1 });
  ui.inFront(btn.mesh, 1.28, 0.22);
  const s = createScope(ctx);
  audio.say('gameover');
  await s.waitSelect(btn.mesh);
  p.dispose(); btn.dispose();
  await engine.fade(1, 400);
  await engine.fade(0, 600);
}

$('enter').addEventListener('click', () => start(false));
$('enterVR').addEventListener('click', () => start(true));
boot().catch(err => { console.error(err); $('enter').textContent = 'שגיאה בטעינה'; });
