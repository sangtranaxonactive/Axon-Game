// Usage: node tools/suggest-shortcuts.mjs <mapName>
// Lists straight lanes that cut across a bend, stay off the main road in between, and can be entered at a sane angle.
// Copy the ones you like into the map JSON:  "shortcuts": [[from, to, width], ...]   (width 4.4 = a little wider than a kart)
import fs from 'fs';
import { buildTrack } from '../src/track-core.js';
const name = process.argv[2] || 'office';
const map = JSON.parse(fs.readFileSync(new URL(`../public/maps/${name}.json`, import.meta.url)));
const t = buildTrack({ ...map, shortcuts: [] }), out = [];
const gap = Math.round(t.width * 1.3 / t.step);
for (let i = 12; i < t.N - 12; i += 2) for (let j = i + Math.round(50 / t.step); j < Math.min(t.N - 8, i + Math.round(230 / t.step)); j += 2) {
  const a = t.samples[i], b = t.samples[j], len = Math.hypot(b.x - a.x, b.z - a.z), path = (j - i) * t.step;
  if (len < t.width + 6 || path - len < 22) continue;
  const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
  const ea = Math.acos(Math.max(-1, Math.min(1, a.tx * ux + a.tz * uz))) * 57.3, xa = Math.acos(Math.max(-1, Math.min(1, b.tx * ux + b.tz * uz))) * 57.3;
  if (ea > 62 || xa > 62) continue;
  let ok = true;
  for (let k = 1; k < 24 && ok; k++) {
    const x = a.x + (b.x - a.x) * k / 24, z = a.z + (b.z - a.z) * k / 24;
    for (let m = 0; m < t.N; m += 2) {
      const s = t.samples[m];
      if (Math.min(Math.abs(m - i), Math.abs(m - j)) > gap && Math.hypot(s.x - x, s.z - z) < t.half + 3.5) { ok = false; break; }
    }
  }
  if (ok) out.push({ from: +(i / t.N).toFixed(3), to: +(j / t.N).toFixed(3), savesMetres: Math.round(path - len), laneLength: Math.round(len), entryAngle: Math.round(ea), exitAngle: Math.round(xa) });
}
out.sort((p, q) => q.savesMetres - p.savesMetres);
const pick = [];
for (const o of out) { if (pick.every(p => o.from > p.to + 0.02 || o.to < p.from - 0.02)) pick.push(o); if (pick.length >= 6) break; }
console.log(`map "${name}" — ${pick.length} candidate shortcut(s):`);
for (const p of pick) console.log(`  [${p.from}, ${p.to}, 4.4]   saves ~${p.savesMetres} m (${(p.savesMetres / 36).toFixed(1)} s), lane ${p.laneLength} m, entry ${p.entryAngle}°, exit ${p.exitAngle}°`);
