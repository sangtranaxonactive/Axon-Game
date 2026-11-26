// Pure track maths (no three.js) — shared by game, big screen and editor.
// A track is a closed Catmull-Rom spline through map.points [[x, z] or [x, y, z]].

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrack(map) {
  const pts = map.points.map(p => p.length >= 3 ? { x: p[0], y: p[1], z: p[2] } : { x: p[0], y: 0, z: p[1] });
  const n = pts.length;
  // Dense sampling, then resample at even arc-length so index <-> distance is linear.
  const dense = [];
  const SUB = 24;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let j = 0; j < SUB; j++) {
      const t = j / SUB;
      dense.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        y: catmull(p0.y, p1.y, p2.y, p3.y, t),
        z: catmull(p0.z, p1.z, p2.z, p3.z, t),
      });
    }
  }
  const dl = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    dl.push(dl[i - 1] + Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)));
  }
  const length = dl[dense.length];
  const N = Math.max(120, Math.round(length / 1.5));
  const step = length / N;
  const samples = [];
  let k = 0;
  for (let i = 0; i < N; i++) {
    const d = i * step;
    while (dl[k + 1] < d) k++;
    const a = dense[k % dense.length], b = dense[(k + 1) % dense.length];
    const f = (d - dl[k]) / Math.max(1e-6, dl[k + 1] - dl[k]);
    samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
  }
  for (let i = 0; i < N; i++) {
    const a = samples[(i - 1 + N) % N], b = samples[(i + 1) % N];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.sqrt(tx * tx + tz * tz) || 1;
    tx /= l; tz /= l;
    const s = samples[i];
    s.tx = tx; s.tz = tz;
    s.nx = -tz; s.nz = tx;           // left-hand normal
    s.heading = Math.atan2(tx, tz);  // rotation.y so that +Z local faces the tangent
  }
  // Shortcuts: narrow straight lanes [fromFraction, toFraction, width] cutting across a bend of the main road.
  const shortcuts = (map.shortcuts || []).map(([f, g, w]) => {
    const from = Math.floor(f * N) % N, to = Math.floor(g * N) % N, a = samples[from], b = samples[to];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.sqrt(dx * dx + dz * dz);
    return { from, to, span: to - from, ax: a.x, az: a.z, bx: b.x, bz: b.z, ux: dx / len, uz: dz / len, len, hw: (w || 4.4) / 2, ya: a.y, yb: b.y };
  }).filter(q => q.span > 0 && q.len > 1);
  // Hazards and pick-ups, all positioned as [fraction of the lap, lateral offset from the centre line, ...]
  const at = f => Math.floor(f * N) % N;
  const slowZones = (map.slowZones || []).map(([f, lat, hw, len]) => ({ idx: at(f), lat: lat || 0, hw: hw || 2.3, len: len || 2 }));
  const itemBoxes = (map.itemBoxes || []).map(([f, lat]) => { const i = at(f), s = samples[i]; return { idx: i, lat: lat || 0, x: s.x + s.nx * (lat || 0), y: s.y, z: s.z + s.nz * (lat || 0) }; });
  return { samples, N, step, length, width: map.width || 14, half: (map.width || 14) / 2, shortcuts, slowZones, itemBoxes };
}

// Find nearest sample index near a hint (local search keeps crossings unambiguous).
export function nearestIndex(track, x, z, hint, win = 30) {
  const { samples, N } = track;
  let best = hint, bd = Infinity;
  for (let o = -win; o <= win; o++) {
    const i = ((hint + o) % N + N) % N;
    const s = samples[i];
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function nearestIndexGlobal(track, x, z) {
  return nearestIndex(track, x, z, 0, Math.ceil(track.N / 2));
}

export function fmtTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, r = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

// Distance from a point to the nearest drivable surface centre line minus its half width (<= 0 means "on the road").
export function roadClearance(track, x, z) {
  let d = Infinity;
  for (let i = 0; i < track.N; i += 2) { const s = track.samples[i]; d = Math.min(d, (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z)); }
  let best = Math.sqrt(d) - track.half;
  for (const q of track.shortcuts) {
    const px = x - q.ax, pz = z - q.az, t = Math.max(0, Math.min(1, (px * q.ux + pz * q.uz) / q.len));
    const cx = q.ax + q.ux * q.len * t - x, cz = q.az + q.uz * q.len * t - z;
    best = Math.min(best, Math.sqrt(cx * cx + cz * cz) - q.hw);
  }
  return best;
}
