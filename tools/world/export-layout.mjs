// Writes src/world/layout.js as JSON for the Blender builds (blender/cache/layout.json) — one source of truth.
// Usage: node tools/world/export-layout.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import * as L from '../../src/world/layout.js';

mkdirSync('blender/cache', { recursive: true });
writeFileSync('blender/cache/layout.json', JSON.stringify({ ...L }, null, 1));
console.log('blender/cache/layout.json', Object.keys(L).join(', '));
