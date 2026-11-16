// Chapter 8 — from the set to the road (spec §6 ch. 8): four everyday scenes, one choice of three each, every answer
// built on what the student measured:
//   rain (the wet rule from ch. 6) · the phone (reaction time ×5 → metres "blind", from the race drill) · worn tyres
//   (friction, ch. 2/6) · the self-driving car (0.1 s: it shortens the REACTION distance only — braking is physics)
import { board } from './kit.js';
import { reactionDistance } from '../game/model.js';
import { choose } from './stripKit.js';

export async function run(ctx, scope) {
  const { ui, game, loco } = ctx;
  await loco.goTo('tower');
  const tr = game.s.reaction?.mean ?? 0.28;
  const phone = 1.5, blind = reactionDistance(50, phone), mine = reactionDistance(50, tr);
  const SCENES = [
    { id: 'rain', q: 'יורד גשם. כמה מרחק להשאיר מהרכב שלפנים?', items: [['more', 'הרבה יותר מבדרך כלל'], ['same', 'כמו ביובש'], ['less', 'פחות, נוסעים לאט ממילא']], right: 'more' },
    { id: 'phone', q: `נהג מדבר בטלפון: זמן התגובה שלו ⁦${phone}⁩ ש׳ (שלכם במבחן: ⁦${tr.toFixed(2)}⁩). כמה מטרים "עיוורים" ב-⁦50⁩ קמ״ש?`,
      items: [['ok', `⁦${blind.toFixed(0)}⁩ מ׳`], ['mine', `⁦${mine.toFixed(0)}⁩ מ׳`], ['fifty', `⁦50⁩ מ׳`]], right: 'ok' },
    { id: 'tyres', q: 'איזה צמיג משאיר יותר חיכוך עם הכביש?', items: [['new', 'צמיג חדש עם חריצים עמוקים'], ['bald', 'צמיג שחוק וחלק']], right: 'new' },
    { id: 'auto', q: 'רכב אוטונומי מגיב תוך ⁦0.1⁩ ש׳. מה הוא מקצר?', items: [['react', 'רק את מרחק התגובה'], ['brake', 'רק את מרחק הבלימה'], ['both', 'את שניהם']], right: 'react' },
  ];
  await scope.say('road_intro');
  let wrongs = 0;
  for (const sc of SCENES) {
    const g = board(ctx, scope, 'A_board');
    const q = scope.add(ui.panel({ w: 0.92, h: 0.15, name: 'roadQ', viewDist: 1.2, draw(c, W, H) {
      ui.rr(c, 4, 4, W - 8, H - 8, 20); c.fillStyle = 'rgba(14,20,30,0.97)'; c.fill();
      c.fillStyle = '#EEF2F8'; ui.fitText(c, sc.q, { x: 16, y: 6, w: W - 32, h: H - 12, maxPx: H * 0.3, minPx: ui.minPx(900, 1.2), font: ui.FONT, weight: 700 });
    } }));
    q.mesh.position.set(0, 0.14, 0.01); g.add(q.mesh);
    ctx.task?.set(`road_${sc.id}`);
    scope.say(`road_${sc.id}`);
    for (;;) {
      const v = await choose(ctx, scope, g, sc.items, sc.right, { w: sc.items.length === 2 ? 0.4 : 0.28, h: 0.1, y: -0.05 });
      if (v === sc.right) { ctx.audio.sfx('ok'); await scope.say(`road_${sc.id}_ok`); break; }
      wrongs++; ctx.audio.sfx('no'); await scope.say(`road_${sc.id}_no`);
    }
    g.visible = false;
  }
  game.s.flags.roadWrongs = wrongs;
  game.markDecision(wrongs === 0);
  ctx.task?.clear();
}
