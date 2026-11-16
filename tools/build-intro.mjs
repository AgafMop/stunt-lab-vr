// Builds the opening film from the generated shots in assets/film/raw/ (gitignored) per src/game/introVideo.js:
// trims, 0.5 s crossfades, each shot's sound levelled (Veo clips range from loud wind to near silence), fade in/out, the shots' own sound (ducked under voice lines once assets/voice/intro_*.mp3
// exist; until then the game shows the lines as subtitles only).
// Output: assets/intro.mp4 (H.264/AAC, for Quest/Chrome) + assets/intro.webm (VP9/Opus, for browsers without H.264).
// Usage: node tools/build-intro.mjs
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { SHOTS, SHOT_AT, XFADE, DURATION, INTRO_VIDEO } from '../src/game/introVideo.js';

const RAW = 'assets/film/raw/';
const probe = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

for (const s of SHOTS) {
  const d = probe(RAW + s.file);
  if ((s.ss ?? 0) + s.len > d + 0.01) throw new Error(`${s.file} is ${d.toFixed(2)} s; the cut needs ${(s.ss ?? 0) + s.len}`);
}
const voices = INTRO_VIDEO.cues.filter(c => existsSync(`assets/voice/${c.id}.mp3`));
for (const c of voices) {
  const d = probe(`assets/voice/${c.id}.mp3`);
  if (d > c.dur + 0.05) throw new Error(`${c.id} is ${d.toFixed(2)} s, timeline allows ${c.dur}`);
}

const args = ['-v', 'error', '-y'];
const cut = (s, file) => [...(s.ss ? ['-ss', String(s.ss)] : []), '-t', String(s.len), '-i', RAW + file];
SHOTS.forEach(s => args.push(...cut(s, s.file)));
const audioIn = [];                                  // input index of each shot's audio
SHOTS.forEach((s, i) => {
  if (!s.audioFrom) { audioIn.push(i); return; }
  audioIn.push(args.filter(a => a === '-i').length);
  args.push(...cut({ ss: s.audioSs ?? 0, len: s.len }, s.audioFrom));
});
const voiceIn = args.filter(a => a === '-i').length;
for (const c of voices) args.push('-i', `assets/voice/${c.id}.mp3`);

const f = [];
SHOTS.forEach((s, i) => {
  f.push(`[${i}:v]${s.crop ? `crop=${s.crop},` : ''}fps=24,scale=1280:720,setsar=1,format=yuv420p,settb=1/24[v${i}]`);
  f.push(`[${audioIn[i]}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-24:TP=-3:LRA=11,aresample=48000,volume=${s.gain ?? 1},apad=whole_dur=${s.len}[a${i}]`);
});
let v = 'v0', a = 'a0';
for (let i = 1; i < SHOTS.length; i++) {
  f.push(`[${v}][v${i}]xfade=transition=fade:duration=${XFADE}:offset=${SHOT_AT[i]}[vx${i}]`, `[${a}][a${i}]acrossfade=d=${XFADE}[ax${i}]`);
  v = `vx${i}`; a = `ax${i}`;
}
const D = DURATION, out = SHOTS.at(-1).fadeOut ?? 1;
f.push(`[${v}]fade=t=in:st=0:d=0.8,fade=t=out:st=${D - out}:d=${out},trim=0:${D}[vout]`);
f.push(`[${a}]volume=0.7,atrim=0:${D}[amb]`);
let mix = '[amb]';
if (voices.length) {
  voices.forEach((c, k) => f.push(`[${voiceIn + k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[q${k}]`));
  f.push(`${voices.map((_, k) => `[q${k}]`).join('')}amix=inputs=${voices.length}:normalize=0,apad,atrim=0:${D},asplit[voice][key]`);
  f.push(`[amb][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`, `[duck][voice]amix=inputs=2:normalize=0[mixed]`);
  mix = '[mixed]';
}
f.push(`${mix}afade=t=in:st=0:d=0.8,afade=t=out:st=${D - Math.max(out, 0.3)}:d=${Math.max(out, 0.3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`);

execFileSync('ffmpeg', [...args, '-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '128k', 'assets/intro.mp4'], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'assets/intro.mp4', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1',
  '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '96k', 'assets/intro.webm'], { stdio: 'inherit' });
for (const o of ['assets/intro.mp4', 'assets/intro.webm']) console.log(o, probe(o).toFixed(2), 's', `(timeline ${D} s, voices ${voices.length}/${INTRO_VIDEO.cues.length})`);
