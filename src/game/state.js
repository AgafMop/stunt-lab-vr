// Game state: resource meter ("lives"), trials, score, decisions, badges, checkpoints, events.
// Pure (no three.js, no DOM) so node --test covers it.
import { METER, TRIAL_COST, PENALTY, MISTAKE_SCORE, DECISION_SCORE, RESERVE, GAMEOVER_SCORE, SAVE_KEY } from './config.js';

const fresh = seed => ({
  seed, chapter: null, meter: METER.start, score: 0, hypothesis: null, plan: [], trials: {},
  badges: [], mistakes: [], flags: {}, over: false,
});

const clone = o => JSON.parse(JSON.stringify(o));

export function createGame({ seed, storage }) {
  const listeners = {};
  const emit = (evt, data) => (listeners[evt] || []).forEach(fn => fn(data));
  let checkpoint = null;
  const overs = {};             // game overs per chapter (outlives checkpoint restores)

  const game = {
    s: fresh(seed),

    on(evt, fn) { (listeners[evt] ||= []).push(fn); return () => { listeners[evt] = listeners[evt].filter(f => f !== fn); }; },

    /** Use up `n` of the meter; at 0 → 'gameover'. */
    spend(n) {
      if (game.s.over) return;
      game.s.meter = Math.max(0, game.s.meter - n);
      emit('meter', game.s.meter);
      if (game.s.meter <= 0) { game.s.over = true; game.s.flags.hadGameOver = true; emit('gameover'); }
    },

    /** A teaching failure: recorded, scored, and costs meter (PENALTY[key]). */
    penalize(key) {
      game.s.mistakes.push(key);
      game.s.score -= MISTAKE_SCORE;
      game.spend(PENALTY[key] ?? 0);
    },

    addScore(n) { game.s.score += n; emit('score', game.s.score); },

    /** Scientific judgement call (disqualify, outlier cause, ...). */
    markDecision(ok) {
      if (ok) game.addScore(DECISION_SCORE); else game.s.flags.decisionWrong = true;
    },

    award(badge) { if (!game.s.badges.includes(badge)) game.s.badges.push(badge); },

    /** Record a measurement under condition key `x` (e.g. a temperature). trial: { value, by: 'student'|'robot', meta? }. */
    addTrial(x, trial, { free = false } = {}) {
      (game.s.trials[x] ||= []).push({ valid: true, ...trial });
      emit('trial', { x, index: game.s.trials[x].length - 1 });
      if (!free) game.spend(TRIAL_COST);
    },

    disqualify(x, i, reason) {
      const t = game.s.trials[x]?.[i];
      if (!t) return;
      t.valid = false; t.reason = reason;
      emit('trial', { x, index: i });
    },

    /** Valid values per condition: { x: [v, ...] }. */
    validValues() {
      return Object.fromEntries(Object.entries(game.s.trials).map(([x, l]) => [x, l.filter(t => t.valid).map(t => t.value)]));
    },

    /** Start of a chapter = checkpoint (also saved, so a headset that slept resumes here). */
    setChapter(id) {
      game.s.chapter = id;
      checkpoint = clone(game.s);
      storage?.set(SAVE_KEY, checkpoint);
      emit('chapter', id);
    },

    restoreCheckpoint() {
      const snap = checkpoint ?? storage?.get(SAVE_KEY);
      if (!snap) { game.s.over = false; return; }
      const hadGameOver = game.s.flags.hadGameOver || snap.flags?.hadGameOver;
      const ch = snap.chapter;
      if (game.s.over) overs[ch] = (overs[ch] || 0) + 1;
      game.s = clone(snap);
      game.s.over = false;
      if (hadGameOver) game.s.flags.hadGameOver = true;
      game.s.score -= GAMEOVER_SCORE * (overs[ch] || 0);
      if ((overs[ch] || 0) >= 2 && game.s.meter < RESERVE) { game.s.meter = RESERVE; game.s.flags.reserveUsed = true; }
      emit('meter', game.s.meter);
    },

    /** Load a saved checkpoint from storage. Returns whether one existed. */
    loadSave() {
      const snap = storage?.get(SAVE_KEY);
      if (!snap || !snap.chapter) return false;
      checkpoint = snap;
      game.s = clone(snap);
      return true;
    },

    /** Stars: 1 = finished, 2 = no game over, 3 = no mistakes and every scientific decision right. */
    finalScore() {
      const s = game.s;
      let stars = 1;
      if (!s.flags.hadGameOver) stars = 2;
      if (stars === 2 && s.mistakes.length === 0 && !s.flags.decisionWrong) stars = 3;
      const score = Math.max(0, s.score + Math.round(s.meter) * 2 + s.badges.length * 100);
      return { score, stars, badges: [...s.badges] };
    },
  };
  return game;
}
