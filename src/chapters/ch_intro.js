// Chapter 0: the opening film (assets/intro.mp4) on a big screen; without it (no codec, load timeout, autoplay
// refused) the same lines play as subtitles over the set. ?auto skips the film unless ?film is set (then 8× speed).
import { playIntroCinema } from '../lab/introCinema.js';
import { INTRO_VIDEO } from '../game/introVideo.js';

export async function run(ctx, scope) {
  if (ctx.auto && !ctx.params.has('film')) return;
  const res = ctx.introVideo ? await playIntroCinema(ctx, scope, ctx.introVideo, { rate: ctx.auto ? 8 : 1 }) : 'unavailable';
  ctx.game.s.flags.intro = res;
  if (res !== 'unavailable') { await ctx.engine.fade(0, 600); return; }
  for (const c of INTRO_VIDEO.cues) await scope.say(c.id);
}
