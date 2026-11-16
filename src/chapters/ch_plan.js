// Chapter 3 — planning the research (spec §6 ch. 3). All clicks, no typing.
//   1. the research question on the board
//   2. the hypothesis sentence, slot by slot: "when [the car's speed] [doubles], [the braking distance] [×2 / ×4 /
//      won't change / shrinks]" — the variable slots get right/wrong feedback; the prediction is the student's own
//   3. "which graph matches the hypothesis you chose?" — checked against THEIR sentence, not against the truth
//   4. sorting the variables: what we change / what we measure / what we keep the same
import { board } from './kit.js';
import { choose } from './stripKit.js';

export const PREDICTIONS = { x2: 'יגדל פי 2', x4: 'יגדל פי 4', same: 'לא ישתנה', less: 'יקטן' };
export const GRAPH_FOR = { x2: 'line', x4: 'curve', same: 'flat', less: 'down' };
export const SORT = [
  ['speed', 'מהירות הרכב', 'iv'], ['dist', 'מרחק הבלימה', 'dv'],
  ['car', 'אותו רכב', 'const'], ['tyres', 'אותם צמיגים', 'const'], ['road', 'אותו כביש', 'const'],
  ['brake', 'אותה עוצמת בלימה', 'const'], ['point', 'מודדים מהגלגל הקדמי', 'const'],
];

export async function run(ctx, scope) {
  const { ui, game, loco } = ctx;
  await loco.goTo('tower');
  const g = board(ctx, scope, 'A_board');
  const slots = { a: '[ ? ]', b: 'גדלה פי 2', c: '[ ? ]', d: '[ ? ]' };
  let graphPick = null;
  const sentence = scope.add(ui.panel({ w: 0.92, h: 0.22, name: 'hypothesis', viewDist: 1.2, draw(c, W, H) {
    ui.rr(c, 4, 4, W - 8, H - 8, 22); c.fillStyle = 'rgba(14,20,30,0.97)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#3a4c6a'; c.stroke();
    const mp = ui.minPx(900, 1.2);
    c.fillStyle = '#FFB347'; ui.fitText(c, 'שאלת המחקר: איך מהירות הרכב משפיעה על מרחק הבלימה?', { x: 20, y: 10, w: W - 40, h: H * 0.36, maxPx: H * 0.2, minPx: mp, font: ui.FONT });
    c.fillStyle = '#EEF2F8'; ui.fitText(c, `השערה: כאשר ${slots.a} ${slots.b}, ${slots.c} ${slots.d}.`, { x: 20, y: H * 0.46, w: W - 40, h: H * 0.46, maxPx: H * 0.2, minPx: mp, font: ui.FONT, weight: 700 });
  } }));
  sentence.mesh.position.set(0, 0.2, 0); g.add(sentence.mesh);
  const redraw = () => sentence.redraw();
  await scope.say('plan_intro');

  // ---- 2. the hypothesis, slot by slot ----
  const slot = async (key, task, line, items, right, auto) => {
    ctx.task?.set(task);
    if (line) scope.say(line);
    for (;;) {
      const v = await choose(ctx, scope, g, items, auto, { y: -0.04, w: 0.26, h: 0.1 });
      if (right == null || v === right) { ctx.audio.sfx('ok'); return v; }
      ctx.audio.sfx('no'); await scope.say(key === 'a' ? 'plan_wrong_iv' : 'plan_wrong_dv');
    }
  };
  const a = await slot('a', 'plan_iv', 'plan_iv', [['speed', 'מהירות הרכב'], ['dist', 'מרחק הבלימה'], ['color', 'צבע הרכב']], 'speed', 'speed');
  slots.a = 'מהירות הרכב'; redraw(); void a;
  await slot('c', 'plan_dv', null, [['dist', 'מרחק הבלימה'], ['speed', 'מהירות הרכב'], ['react', 'זמן התגובה']], 'dist', 'dist');
  slots.c = 'מרחק הבלימה'; redraw();
  const pred = await slot('d', 'plan_pred', 'plan_pred', Object.entries(PREDICTIONS), null, 'x2');
  slots.d = PREDICTIONS[pred]; redraw();
  game.s.hypothesis = { pred };

  // ---- 3. the graph that matches THEIR hypothesis ----
  ctx.task?.set('plan_graph');
  scope.say('plan_graph');
  for (;;) {
    graphPick = await chooseGraph(ctx, scope, g, GRAPH_FOR[pred]);
    if (graphPick === GRAPH_FOR[pred]) { ctx.audio.sfx('ok'); break; }
    ctx.audio.sfx('no'); await scope.say('plan_graph_wrong');
  }
  game.s.hypothesis.graph = graphPick;

  // ---- 4. sort the variables ----
  ctx.task?.set('plan_sort');
  await scope.say('plan_sort');
  const boxes = [['iv', 'משנים בכוונה'], ['dv', 'מודדים'], ['const', 'שומרים קבוע']];
  let wrongs = 0;
  for (const [, label, right] of SORT) {
    const head = scope.add(ui.panel({ w: 0.6, h: 0.09, name: 'sortItem', viewDist: 1.2, draw(c, W, H) {
      ui.rr(c, 4, 4, W - 8, H - 8, 18); c.fillStyle = '#16233a'; c.fill();
      c.fillStyle = '#EEF2F8'; ui.fitText(c, `לאן שייך: ${label}?`, { x: 14, y: 4, w: W - 28, h: H - 8, maxPx: H * 0.55, minPx: ui.minPx(900, 1.2), font: ui.FONT, weight: 700 });
    } }));
    head.mesh.position.set(0, 0.03, 0.01); g.add(head.mesh);
    for (;;) {
      const v = await choose(ctx, scope, g, boxes, right, { y: -0.1, w: 0.26, h: 0.1 });
      if (v === right) { ctx.audio.sfx('ok'); break; }
      wrongs++; ctx.audio.sfx('no'); await scope.say(right === 'const' ? 'plan_sort_const' : right === 'iv' ? 'plan_wrong_iv' : 'plan_wrong_dv');
    }
    g.remove(head.mesh);
  }
  game.s.flags.sortWrongs = wrongs;
  game.markDecision(wrongs === 0);
  ctx.task?.clear();
  await scope.say('plan_ok');
  g.visible = false;
}

/** Four little graphs (line through the origin, curve bending up, flat, falling). */
async function chooseGraph(ctx, scope, g, auto) {
  const { ui } = ctx;
  for (const ch of [...g.children]) if (ch.userData.choice) g.remove(ch);
  const shapes = { line: v => v, curve: v => v * v, flat: () => 0.45, down: v => 1 - v };
  let pick; const chosen = new Promise(res => { pick = res; });
  const ids = ['line', 'curve', 'flat', 'down'];
  const cards = ids.map(id => scope.add(ui.card({ w: 0.19, h: 0.17, name: 'graph', viewDist: 1.2, label: '', icon: (c, x, y, w, h) => {
    c.strokeStyle = '#9FB0C8'; c.lineWidth = 6; c.beginPath(); c.moveTo(x + 10, y); c.lineTo(x + 10, y + h - 10); c.lineTo(x + w, y + h - 10); c.stroke();
    c.strokeStyle = '#7CFF9B'; c.lineWidth = 9; c.beginPath();
    for (let i = 0; i <= 20; i++) { const v = i / 20, X = x + 14 + v * (w - 20), Y = y + h - 14 - shapes[id](v) * (h - 24); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
    c.stroke();
  }, onSelect: cc => { ctx.audio.sfx('click'); for (const x of cards) x.setState(x === cc ? 'sel' : 'off'); pick(id); } })));
  cards.forEach((c, i) => { c.mesh.userData.choice = true; c.mesh.position.set(0.3 - i * 0.2, -0.1, 0.01); g.add(c.mesh); });
  const glows = cards.map(c => ctx.attention?.(c.mesh) ?? (() => {}));
  if (ctx.auto) setTimeout(() => ctx.input.select(cards[ids.indexOf(auto)].mesh), 300);
  const v = await scope.guard(chosen);
  glows.forEach(f => f());
  await scope.wait(250);
  for (const c of cards) g.remove(c.mesh);
  return v;
}
