// EXAMPLE chapter: end screen — stars, score, badges, "play again with new data".
import { boardAtStation } from './kit.js';

export async function run(ctx, scope) {
  const { ui, game, audio } = ctx;
  const { score, stars, badges } = game.finalScore();
  audio.sfx('win');
  const g = boardAtStation(ctx, scope, 'tower', { dist: 1.1, height: 1.3 });
  const p = scope.add(ui.panel({ w: 0.8, h: 0.45, name: 'end', viewDist: 1.1, draw(c, W, H) {
    ui.rr(c, 6, 6, W - 12, H - 12, 30); c.fillStyle = ui.C.bg; c.fill(); c.lineWidth = 6; c.strokeStyle = ui.C.oxy; c.stroke();
    c.fillStyle = '#FFD166'; ui.fitText(c, '★'.repeat(stars) + '☆'.repeat(3 - stars), { x: 30, y: 20, w: W - 60, h: H * 0.28, maxPx: H * 0.22, minPx: ui.minPx(900, 1.1), font: ui.FONT });
    c.fillStyle = ui.C.ink; ui.fitText(c, `ניקוד: ${score}`, { x: 30, y: H * 0.36, w: W - 60, h: H * 0.2, maxPx: H * 0.13, minPx: ui.minPx(900, 1.1), font: ui.FONT });
    c.fillStyle = ui.C.muted; ui.fitText(c, badges.length ? badges.join(' · ') : 'בפעם הבאה: נסו לאסוף תגים', { x: 30, y: H * 0.6, w: W - 60, h: H * 0.3, maxPx: H * 0.09, minPx: ui.minPx(900, 1.1), font: ui.FONT, weight: 500 });
  } }));
  g.add(p.mesh);
  await scope.say('end_well');
  // the button's own onSelect is replaced by waitSelect's registration, so act after the wait
  const again = scope.add(ui.button3d('משחק חדש עם נתונים חדשים', () => {}, { w: 0.5, h: 0.1, viewDist: 1.1 }));
  again.mesh.position.set(0, -0.3, 0.01); g.add(again.mesh);
  ctx.task?.set('end');
  scope.add(() => ctx.task?.clear());
  if (ctx.auto) return;                     // tests end here
  await scope.waitSelect(again.mesh, { auto: false });   // glows (kit.waitSelect)
  location.search = '?fresh';
}
