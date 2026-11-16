// Tunable game constants. Keep every number a designer might want to balance here, not in the chapters.
export const METER = { label: '☀️', start: 180, low: 30 };     // the "lives" resource (oxygen / time / battery...), in game-minutes
export const TRIAL_COST = 5;                    // meter cost of one measurement (more data costs something: a real trade-off)
export const PENALTY = { noGoggles: 10, wrongTool: 15 };       // meter cost of each teaching failure (keys = failure ids)
export const MISTAKE_SCORE = 50;
export const DECISION_SCORE = 100;     // a correct scientific judgement call (disqualify a bad reading, name an outlier's cause)
export const RESERVE = 240;            // after a second game over in the same chapter, refill to this (nobody gets stuck)
export const GAMEOVER_SCORE = 100;
export const REPEATS = 3;              // repeats per condition
export const CHAPTERS = ['intro', 'race', 'strip', 'end'];          // run order; every id needs a module in main.js → CH
export const SAVE_KEY = 'stuntlab.v1';    // change per project (two labs on one origin must not share saves)

export const START_DRILLS = 3;         // valid start-light reactions recorded in the race
export const LIGHTS = { count: 5, stepMs: 700, holdMinMs: 800, holdMaxMs: 2500 };
export const GHOST_SPEED = 14;         // m/s: Bumper's rival car in the qualifying lap
export const WET_RUSH = 18;            // m/s: entering the wet corner faster than this arms the wet-corner lesson
