// Opening film timeline (pure; shared by tools/build-intro.mjs and the intro chapter).
// Nine AI-generated shots (assets/film/raw/, gitignored) joined with 0.5 s crossfades into assets/intro.mp4/.webm.
// Cues are placed relative to a shot so re-cutting a shot never desyncs the subtitles of the others.
// Story: canyon → the set wakes (Dana) → the car → the line and the drop → Bumper's failed take → Bumper in the pool
// → Roni refuses → the sun goes down → the empty director's chair (clapper snap = the student's turn).
export const XFADE = 0.5;

export const SHOTS = [
  { file: 'clip-01.mp4', len: 8.5 },                                  // aerial: the set on the canyon rim
  { file: 'clip-02.mp4', len: 8.5, gain: 0.8 },                       // lights on, crane up, Dana lifts the megaphone
  { file: 'clip-03.mp4', len: 6, audioFrom: 'clip-01.mp4' },          // the car (its own audio ticks: use the canyon wind)
  { file: 'clip-04.mp4', len: 10 },                                   // the stop line, the drop, the pool far below
  { file: 'clip-05.mp4', ss: 4, len: 13 },                            // Bumper's take: brakes late, over the edge, parachute
  { file: 'clip-06.mp4', ss: 0.5, len: 9 },                           // Bumper in the pool, sheepish
  { file: 'clip-07.mp4', len: 10 },                                   // Roni folds her arms
  { file: 'clip-08.mp4', len: 4.2, crop: '1036:582:122:69' },          // the sun sinks (cut before night); letterboxed → crop to 16:9
  { file: 'clip-09.mp4', len: 8.6, fadeOut: 0.15 },                   // the empty chair; clapper snap at 8.4 s
];

/** Start time of each shot in the built film. */
export const SHOT_AT = SHOTS.reduce((acc, s, i) => { acc.push(i ? acc[i - 1] + SHOTS[i - 1].len - XFADE : 0); return acc; }, []);

export const DURATION = Math.round((SHOT_AT.at(-1) + SHOTS.at(-1).len) * 1000) / 1000;

// shot: 1-based index into SHOTS; at: seconds into that shot; dur: how long the subtitle (and later the voice) may run
const CUE_LIST = [
  { id: 'intro_scene', shot: 2, at: 3.8, dur: 4.4 },
  { id: 'intro_line', shot: 4, at: 2.5, dur: 3.6 },
  { id: 'intro_action', shot: 5, at: 0.3, dur: 1.4 },
  { id: 'intro_bumper', shot: 6, at: 3.4, dur: 4.2 },
  { id: 'intro_roni', shot: 7, at: 2.0, dur: 6.2 },
  { id: 'intro_sun', shot: 8, at: 0.2, dur: 3.6 },
  { id: 'intro_chair', shot: 9, at: 1.8, dur: 5.8 },
];

export const INTRO_VIDEO = {
  src: { mp4: 'assets/intro.mp4', webm: 'assets/intro.webm' },
  duration: DURATION,
  cues: CUE_LIST.map(c => ({ id: c.id, at: Math.round((SHOT_AT[c.shot - 1] + c.at) * 100) / 100, dur: c.dur })),
};

export function cueAt(t) {
  return INTRO_VIDEO.cues.find(c => t >= c.at && t < c.at + c.dur) ?? null;
}
