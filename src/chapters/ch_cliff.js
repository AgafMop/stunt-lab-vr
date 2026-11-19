// Chapter 1b — the cliff test, the real part of the acceptance test (the 2026-11-19 headset check: "the script and
// the film promise stopping on the cliff edge, and then the lab is just a road you drive on"):
//   the student drives the film's car down the strip toward the cliff (the speed is held at 70 km/h for them) and
//   presses the brake ONCE, by eye, to stop on the white line — "not a metre past it", like Bumper in the film.
//   Almost everyone misses: too late = over the edge (cut to the tower, the chute), too early = "parking". Nothing is
//   charged — the miss IS the reason to learn where to brake. A hit is called luck until the physics says otherwise.
//   In the big shot (ch_stunt) the student drives the same run again, braking at a lamp placed by calculation.
import { board } from './kit.js';
import { driveToLine } from './stripKit.js';
import { brakingDistance } from '../game/model.js';
import { lineVerdict } from '../game/cliffDrive.js';

export const CLIFF_KMH = 70;

export async function run(ctx, scope) {
  const { game, ui } = ctx;
  await ctx.loco.goTo('tower');
  const brake = brakingDistance(CLIFF_KMH, 'dry');
  ctx.task?.set('cliff_look');
  await scope.say('cliff_intro');                                     // from the tower: the strip, the line, the drop
  ctx.task?.set('cliff_drive');
  const res = await driveToLine(ctx, scope, {
    kmh: CLIFF_KMH, brake, color: 0xf07a1a,
    autoPressAt: -brake + 7,                                            // ?auto: braking a bit late, by eye → over the edge
    ready: () => scope.say('cliff_how'),
  });
  ctx.task?.clear();
  const verdict = lineVerdict(res.stop, res.fell);
  game.s.cliffTest = { stop: +res.stop.toFixed(1), fell: res.fell, verdict, brakeAt: res.brakeX == null ? null : +res.brakeX.toFixed(1) };

  // what happened, in numbers
  const g = board(ctx, scope, 'A_board');
  const f1 = n => `⁦${Math.abs(n).toFixed(1)}⁩`;
  const head = res.fell ? 'נפלתם לקניון!' : verdict === 'ok' ? 'על הקו!' : res.stop > 0 ? `עצרתם ${f1(res.stop)} מ׳ אחרי הקו` : `עצרתם ${f1(res.stop)} מ׳ לפני הקו`;
  const sub = res.brakeX == null ? 'לא לחצתם על הבלם בכלל.' : `התחלתם לבלום ${f1(res.brakeX)} מ׳ לפני הקו.`;
  const card = scope.add(ui.panel({ w: 0.8, h: 0.34, name: 'cliffResult', viewDist: 1.2, draw(c, W, H) {
    ui.rr(c, 6, 6, W - 12, H - 12, 30); c.fillStyle = ui.C.bg; c.fill(); c.lineWidth = 6; c.strokeStyle = verdict === 'ok' ? ui.C.good : '#FFB347'; c.stroke();
    const mp = ui.minPx(900, 1.2), F = ui.FONT;
    c.fillStyle = '#FFB347'; ui.fitText(c, 'מבחן הצוק', { x: 30, y: 16, w: W - 60, h: H * 0.16, maxPx: H * 0.12, minPx: mp, font: F });
    c.fillStyle = ui.C.ink; ui.fitText(c, head, { x: 30, y: H * 0.22, w: W - 60, h: H * 0.32, maxPx: H * 0.2, minPx: mp, font: F, weight: 800 });
    c.fillStyle = '#9FB0C8'; ui.fitText(c, sub, { x: 30, y: H * 0.6, w: W - 60, h: H * 0.24, maxPx: H * 0.1, minPx: mp, font: F, weight: 600 });
  } }));
  card.mesh.position.set(0, 0.1, 0); g.add(card.mesh);
  ctx.audio.sfx(verdict === 'ok' ? 'win' : 'no');
  await scope.say(verdict === 'cliff' ? 'cliff_fell' : verdict === 'over' ? 'cliff_over' : verdict === 'short' ? 'cliff_short' : 'cliff_lucky');
  await scope.say('cliff_learn');
  const ok = scope.add(ui.button3d('הבנתי, בואו נלמד', () => {}, { w: 0.34, h: 0.09, viewDist: 1.2 }));
  ok.mesh.position.set(0, -0.15, 0.01); g.add(ok.mesh);
  ctx.task?.set('cliff_done');
  await scope.waitSelect(ok.mesh);
  ctx.task?.clear();
}
