// Pure logic of the later chapters (Node-tested): the stunt outcome, doubling pairs in the student's data.

export const STUNT = { kmh: 70, tr: 0.7, window: 2 };

/** Where the stunt car stops for a lamp placed `lamp` m before the line. edge: metres from the line to the cliff lip. */
export function stuntOutcome(lamp, react, brake, { window = STUNT.window, edge = 4.7 } = {}) {
  const miss = react + brake - lamp;                        // + : past the line, − : before it
  if (Math.abs(miss) <= window) return { kind: 'ok', miss };
  if (miss > edge) return { kind: 'cliff', miss };
  if (miss > 0) return { kind: 'over', miss };              // past the line but still on the lip
  return { kind: 'short', miss };
}

/** Pairs [a, 2a] that both appear in the measured speeds. */
export function doublingPairs(speeds) {
  const set = new Set(speeds);
  return speeds.filter(a => set.has(2 * a)).sort((x, y) => x - y).map(a => [a, 2 * a]);
}
