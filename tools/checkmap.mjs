// Usage: node tools/checkmap.mjs [mapName]  — validates a map: length, tightest corner, estimated lap time.
import fs from 'fs';
import { buildTrack } from '../src/track-core.js';
const name = process.argv[2] || 'default';
const map = JSON.parse(fs.readFileSync(new URL(`../public/maps/${name}.json`, import.meta.url)));
const t = buildTrack(map);
let minR = Infinity, at = 0;
for (let i = 0; i < t.N; i++) {
  const a = t.samples[i], b = t.samples[(i + 4) % t.N];
  let d = b.heading - a.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
  const r = Math.abs(4 * t.step / (d || 1e-9));
  if (r < minR) { minR = r; at = i; }
}
// self-overlap: two far-apart parts of the track closer than one road width
let overlap = null;
for (let i = 0; i < t.N && !overlap; i += 2) for (let j = i + Math.ceil(t.width * 2.2 / t.step); j < t.N - Math.ceil(t.width * 2.2 / t.step) + i && j < t.N; j += 2) {
  const a = t.samples[i], b = t.samples[j];
  if (Math.hypot(a.x - b.x, a.z - b.z) < t.width + 2) { overlap = [i, j]; break; }
}
console.log(`map "${name}": length ${t.length.toFixed(0)} m, width ${t.width} m, samples ${t.N}`);
console.log(`tightest corner radius ${minR.toFixed(1)} m at ${(at / t.N * 100).toFixed(0)}% ${minR < t.half + 3 ? '  <-- TOO TIGHT (must be > half width + 3)' : 'OK'}`);
console.log(overlap ? `OVERLAP between ${(overlap[0] / t.N * 100).toFixed(0)}% and ${(overlap[1] / t.N * 100).toFixed(0)}% — move those sections apart` : 'no overlapping sections OK');
console.log(`rough best lap ≈ ${(t.length / 36).toFixed(1)} s`);
