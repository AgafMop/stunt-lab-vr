// The race car's sound, synthesized live with WebAudio (no files, nothing to download):
//   engine — exhaust pulses of a 4-cylinder rung through the pipe's resonances (two loops, low and high revs,
//            pitched and crossfaded by rpm — how racing games do it). A simple 5-speed gearbox: the rpm climbs with
//            speed and drops at each shift — you hear the car accelerate.
//   tyres  — a squeal (two narrow band-passes on noise) when the tyres are past the grip limit (carSim's `sliding`,
//            a hard brake at speed, a big lateral g) — the wet-corner lesson is HEARD before the car leaves the road.
//   gravel — low rumble on the sand run-off.
//   bump   — a thud when the car hits a barrier (driveSession calls bump(speed)).
// update(car, input, dt) every frame; stop() fades everything out.
import { MU, G } from '../game/model.js';
import { CAR } from '../game/carSim.js';

const GEARS = [0, 7, 12.5, 17.5, 22, 30];          // m/s where each gear starts (1st … 5th)
const IDLE = 900, LOW = 2300, HIGH = 6400;

/** rpm for a speed and throttle (pure — exported for tests). */
export function engineRpm(speed, throttle) {
  const v = Math.abs(speed);
  if (v < 0.5) return IDLE + throttle * 2600;                        // standing: the gas pedal revs it
  let g = 0; while (g < GEARS.length - 2 && v >= GEARS[g + 1]) g++;
  const t = (v - GEARS[g]) / (GEARS[g + 1] - GEARS[g]);
  const base = g === 0 ? IDLE + (HIGH - IDLE) * Math.min(1, t) : LOW + (HIGH - LOW) * Math.min(1, t);
  return base + throttle * 250;
}

/** How loud the tyres squeal, 0..1 (pure). */
export function squealLevel(car, input) {
  const v = Math.abs(car.speed);
  if (v < 3 || car.surface === 'sand') return 0;
  const mu = MU[car.surface] ?? MU.dry;
  const lat = Math.max(0, car.latG / (mu * (CAR.arcadeGrip[car.surface] ?? 1)) - 0.82) / 0.18;   // the last 18 % of the grip
  const brake = input.brake > 0.8 && v > 6 ? 0.55 : 0;
  return Math.min(1, Math.max(car.sliding || 0, lat, brake)) * Math.min(1, v / 10);
}

/** One seamless loop of an engine at `rpm`: exhaust pulses (4 cylinders, a little uneven — the burble) rung
 *  through the exhaust pipe's resonances, plus a breath of noise. Played back faster/slower for other revs. */
function engineLoop(a, rpm, cycles) {
  const sr = a.sampleRate, fire = (rpm / 60) * 2, period = sr / fire, n = Math.round(period * cycles);
  const buf = a.createBuffer(1, n, sr), d = buf.getChannelData(0);
  // the pipe: damped modes + a short noisy blast (an impulse response ~40 ms long)
  const L = Math.round(sr * 0.04), ir = new Float32Array(L);
  const modes = [[95, 0.9, 0.018], [190, 0.55, 0.012], [410, 0.35, 0.007], [820, 0.18, 0.004], [1650, 0.07, 0.002]];
  let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < L; i++) {
    const t = i / sr;
    let v = 0; for (const [f, amp, tau] of modes) v += amp * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t);
    v += (rnd() * 2 - 1) * 0.35 * Math.exp(-t / 0.003);
    ir[i] = v;
  }
  const cyl = [1.0, 0.82, 0.93, 0.76];                                    // uneven cylinders → the burble
  for (let k = 0; k < cycles; k++) {
    const amp = cyl[k % 4] * (0.9 + rnd() * 0.2), at = Math.round(k * period + (rnd() - 0.5) * period * 0.04);
    for (let i = 0; i < L; i++) d[(at + i + n) % n] += amp * ir[i];           // wraps: the loop has no seam
  }
  let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] /= m;
  return buf;
}

export function createCarSound(audio) {
  const a = audio.unlock?.();
  if (!a) return { update() {}, bump() {}, stop() {} };
  const master = a.createGain(); master.gain.value = 0; master.connect(a.destination);

  // ---- engine: two recorded-style loops (low revs / high revs), pitched by playbackRate, crossfaded by rpm ----
  const LO = 1500, HI = 4200;
  const mk = (rpm, cycles) => { const src = a.createBufferSource(); src.buffer = engineLoop(a, rpm, cycles); src.loop = true; const g = a.createGain(); g.gain.value = 0; src.connect(g); return { src, g, rpm }; };
  const lo = mk(LO, 100), hi = mk(HI, 280);
  const shaper = a.createWaveShaper();
  { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(1.6 * x); } shaper.curve = c; }
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
  const engG = a.createGain(); engG.gain.value = 0;
  lo.g.connect(shaper); hi.g.connect(shaper); shaper.connect(lp).connect(engG).connect(master);

  // ---- noise sources: squeal + gravel ----
  const nb = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), ch = nb.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const noise = a.createBufferSource(); noise.buffer = nb; noise.loop = true;
  const sq1 = a.createBiquadFilter(); sq1.type = 'bandpass'; sq1.frequency.value = 1050; sq1.Q.value = 7;
  const sq2 = a.createBiquadFilter(); sq2.type = 'bandpass'; sq2.frequency.value = 1700; sq2.Q.value = 9;
  const sqG = a.createGain(); sqG.gain.value = 0;
  noise.connect(sq1).connect(sqG); noise.connect(sq2).connect(sqG); sqG.connect(master);
  const gr = a.createBiquadFilter(); gr.type = 'lowpass'; gr.frequency.value = 380;
  const grG = a.createGain(); grG.gain.value = 0;
  noise.connect(gr).connect(grG).connect(master);

  const t0 = a.currentTime;
  for (const o of [lo.src, hi.src, noise]) o.start(t0);
  master.gain.setTargetAtTime(0.55, t0, 0.3);
  let stopped = false, wobble = 0;

  return {
    update(car, input, dt) {
      if (stopped) return;
      const now = a.currentTime, th = Math.max(0, input.throttle || 0);
      const rpm = engineRpm(car.speed, th);
      const x = Math.min(1, Math.max(0, (rpm - 1800) / (HI - 1800)));           // 0 = the low loop, 1 = the high loop
      lo.src.playbackRate.setTargetAtTime(rpm / LO, now, 0.04);
      hi.src.playbackRate.setTargetAtTime(rpm / HI, now, 0.04);
      lo.g.gain.setTargetAtTime(Math.cos(x * Math.PI / 2), now, 0.05);
      hi.g.gain.setTargetAtTime(Math.sin(x * Math.PI / 2), now, 0.05);
      lp.frequency.setTargetAtTime(700 + th * 2600 + rpm * 0.25, now, 0.06);     // on the gas the exhaust opens up
      engG.gain.setTargetAtTime(0.22 + th * 0.28, now, 0.08);
      const sq = squealLevel(car, input);
      wobble += dt * 7;                                               // a squeal is never one steady pitch
      sq1.frequency.setTargetAtTime(1000 + 90 * Math.sin(wobble) + (car.surface === 'wet' ? -250 : 0), now, 0.05);
      sq2.frequency.setTargetAtTime(1650 + 120 * Math.sin(wobble * 1.7 + 1), now, 0.05);
      sqG.gain.setTargetAtTime(sq * 0.35 * (0.8 + 0.2 * Math.sin(wobble * 3.1)), now, sq > 0.05 ? 0.03 : 0.12);   // chirps, never a steady whistle
      const onSand = car.surface === 'sand' ? Math.min(1, Math.abs(car.speed) / 8) : 0;
      grG.gain.setTargetAtTime(onSand * 0.5, now, 0.1);
    },
    /** A barrier hit at `speed` m/s across the wall. */
    bump(speed) {
      if (stopped) return;
      const now = a.currentTime, k = Math.min(1, speed / 12);
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(110, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.25);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.25 + 0.5 * k, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.connect(g).connect(master); o.start(now); o.stop(now + 0.4);
      const s = a.createBufferSource(), fl = a.createBiquadFilter(), ng = a.createGain();
      s.buffer = nb; fl.type = 'lowpass'; fl.frequency.value = 900; ng.gain.setValueAtTime(0.3 * k + 0.05, now); ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      s.connect(fl).connect(ng).connect(master); s.start(now, Math.random()); s.stop(now + 0.35);
    },
    stop() {
      if (stopped) return; stopped = true;
      const now = a.currentTime;
      master.gain.setTargetAtTime(0, now, 0.15);
      setTimeout(() => { for (const o of [lo.src, hi.src, noise]) { try { o.stop(); } catch { /* done */ } } master.disconnect(); }, 900);
    },
  };
}
