// Downloads the CC0 photo textures (Poly Haven) the world uses, 1k JPG, into assets/world/tex/.
// Usage: node tools/world/fetch-textures.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

export const TEXTURES = {
  red_sand: ['Diffuse', 'nor_gl'],          // plateau ground (has tyre tracks)
  cliff_side: ['Diffuse', 'nor_gl'],        // canyon walls, mesas (orange sediment)
  gravelly_sand: ['Diffuse', 'nor_gl'],     // patches of gravel on the plateau
  asphalt_02: ['Diffuse', 'nor_gl'],        // braking strip
  asphalt_track: ['Diffuse', 'nor_gl'],     // race track
};
const SHORT = { Diffuse: 'diff', nor_gl: 'nor' };
const UA = { 'User-Agent': 'stunt-lab-build' };

mkdirSync('assets/world/tex', { recursive: true });
for (const [id, maps] of Object.entries(TEXTURES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  for (const m of maps) {
    const out = `assets/world/tex/${id}_${SHORT[m]}.jpg`;
    if (existsSync(out)) continue;
    const url = files[m]['1k'].jpg.url;
    const r = await fetch(url, { headers: UA });
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    console.log(out);
  }
}
