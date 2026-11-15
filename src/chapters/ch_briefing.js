// EXAMPLE chapter: briefing + hypothesis. The student bets on a graph shape with picture cards (no typing, no right answer
// here: the bet is compared with the real graph at the end).
import { boardAtStation, row, ICON } from './kit.js';

export async function run(ctx, scope) {
  const { ui, game, loco } = ctx;
  await loco.goTo('bench');
  await scope.say('b_commander');
  await scope.say('b_hello');

  const g = boardAtStation(ctx, scope, 'bench', { dist: 0.95, height: 1.3 });
  const shapes = [['rise', 'עולה כל הזמן'], ['peak', 'עולה ואז יורד'], ['flat', 'לא משתנה']];
  let pick;
  const chosen = new Promise(res => { pick = res; });
  const cards = shapes.map(([id, label]) => scope.add(ui.card({
    w: 0.3, h: 0.36, label, name: 'hyp', icon: ICON.graph(id),
    onSelect: c => { ctx.audio.sfx('click'); for (const x of cards) x.setState(x === c ? 'sel' : 'off'); pick(id); },
  })));
  row(g, cards);
  scope.say('b_hyp');
  if (ctx.auto) setTimeout(() => ctx.input.select(cards[1].mesh), 300);
  game.s.hypothesis = await scope.guard(chosen);
  await scope.say('b_hyp_done');
}
