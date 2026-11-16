// World layout (pure, no three.js — shared by the game, the terrain generator in tools/world and the tests).
// three.js coordinates, metres, y up. The director's tower stands at the origin looking toward -z; the braking
// strip runs along +x at z = STRIP.z and ends at the canyon rim (x ≈ RIM_X), like the road in the opening film.
export const DECK_Y = 6;                                                     // tower deck height
export const STRIP = { z: -14, gateX: -30, startX: -140, endX: 100, width: 8 };
export const TRACK_ORIGIN = { x: 60, y: 0, z: -260 };                       // where track.js (0,0) sits
export const RIM_X = 102;                                                   // near canyon rim beside the strip end

// Golden hour, the sun low over the plateau ahead-left of the tower: it lights the far canyon wall (which faces
// the tower) and throws long shadows across the strip. One direction for the sky, the bake and the lights.
const n = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
export const SUN_DIR = n(-0.62, 0.19, -0.77);                                // toward the sun (elevation ≈ 11°)

// Film palette (sampled from the opening-film frames, linear-ish sRGB 0..1)
export const PALETTE = {                     // tuned for ACES tone mapping (saturated in → film colours out)
  sun: [1.0, 0.60, 0.28],
  skyZenith: [0.10, 0.09, 0.27],
  skyHorizon: [1.05, 0.40, 0.12],
  skyAntiSun: [0.46, 0.20, 0.32],
  haze: [0.86, 0.38, 0.18],
};
