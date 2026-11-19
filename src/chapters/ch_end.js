// The end: stars, score, badges, what the student found out in their own numbers, "play again with new data".
import { boardAtStation } from './kit.js';

export async function run(ctx, scope) {
  const { ui, game, audio } = ctx;
  const { score, stars, badges } = game.finalScore();
  audio.sfx('win');
  // what the student found out, in their own numbers
  const s = game.s, f = s.flags;
  const learned = [
    s.reaction?.mean != null ? `זמן התגובה שלכם: ⁦${s.reaction.mean.toFixed(2)}⁩ ש׳. בכביש, בלי לדעת מתי, פי 3–4.` : null,
    f.doublingRatios?.length ? `מהירות פי ⁦2⁩ ← מרחק בלימה פי ⁦${f.doublingRatios[0]}⁩ (בערך 4).` : 'מהירות פי 2 ← מרחק בלימה פי 4.',
    s.hypothesis ? `ההשערה שלכם ${f.hypothesisSupported ? 'אוששה' : 'לא אוששה'}. ככה מתקדם המדע.` : null,
    'כביש רטוב: עוצרים רחוק בהרבה. מרחק עצירה = מרחק תגובה + מרחק בלימה.',
  ].filter(Boolean);
  const g = boardAtStation(ctx, scope, 'tower', { dist: 1.1, height: 1.08 });   // a tall board: its top stays under the subtitles' band (21° up)
  const p = scope.add(ui.panel({ w: 0.86, h: 0.62, name: 'end', viewDist: 1.1, draw(c, W, H) {
    ui.rr(c, 6, 6, W - 12, H - 12, 30); c.fillStyle = ui.C.bg; c.fill(); c.lineWidth = 6; c.strokeStyle = ui.C.oxy; c.stroke();
    const mp = ui.minPx(900, 1.1);
    c.fillStyle = '#FFD166'; ui.fitText(c, '★'.repeat(stars) + '☆'.repeat(3 - stars), { x: 30, y: 14, w: W - 60, h: H * 0.16, maxPx: H * 0.13, minPx: mp, font: ui.FONT });
    c.fillStyle = ui.C.ink; ui.fitText(c, `ניקוד: ${score}`, { x: 30, y: H * 0.18, w: W - 60, h: H * 0.1, maxPx: H * 0.075, minPx: mp, font: ui.FONT });
    learned.forEach((t, i) => { c.fillStyle = '#EEF2F8'; ui.fitText(c, `• ${t}`, { x: 30, y: H * (0.3 + i * 0.12), w: W - 60, h: H * 0.11, maxPx: H * 0.05, minPx: mp, font: ui.FONT, weight: 500, align: 'right' }); });
    c.fillStyle = ui.C.muted; ui.fitText(c, badges.length ? badges.join(' · ') : 'בפעם הבאה: נסו לאסוף תגים', { x: 30, y: H * 0.8, w: W - 60, h: H * 0.12, maxPx: H * 0.055, minPx: mp, font: ui.FONT, weight: 500 });
  } }));
  g.add(p.mesh);
  await scope.say('end_well');
  // the button's own onSelect is replaced by waitSelect's registration, so act after the wait
  const again = scope.add(ui.button3d('משחק חדש עם נתונים חדשים', () => {}, { w: 0.5, h: 0.1, viewDist: 1.1 }));
  again.mesh.position.set(0, -0.38, 0.01); g.add(again.mesh);
  ctx.task?.set('end');
  scope.add(() => ctx.task?.clear());
  if (ctx.auto) return;                     // tests end here
  await scope.waitSelect(again.mesh, { auto: false });   // glows (kit.waitSelect)
  location.search = '?fresh';
}
