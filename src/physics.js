// Deterministic kart physics, shared by the browser (prediction) and the server (authority).
// The server re-runs every player's button presses through this exact code, so a finish time
// can only come from actually driving the lap. Rules for editing this file:
//   * fixed time step only, no Date/performance/Math.random
//   * no Math.sin/cos/exp/atan2/hypot/pow (they may differ between JS engines) — use dsin/dcos + - * / sqrt
export const TICK_MS = 1000 / 60;
const DT = 1 / 60;
export const V_MAX = 35, V_BOOST = 47;
export const IN = { LEFT: 1, RIGHT: 2, DRIFT: 4, BRAKE: 8, NITRO: 16 };
export const EV = { WINDOW: 1, TAP: 2, STOCK: 4, NITRO: 8, WALL: 16, PAD: 32, LAP: 64, FINISH: 128, SHORTCUT: 256, SLOW: 512, HIT: 1024, PULL: 2048, BOMB: 4096 };
// Effects the server injects into a kart at an agreed tick (items). Both sides apply them with applyEvent().
export const FX = { NITRO: 1, BANANA: 2, MAGNET: 3, PULL: 4, BOMB: 5 };
export const STUN_TICKS = 120; // banana spin-out / bomb launch: two seconds with no control
export const SLOW_STRIP_TICKS = 120, V_SLOW = 16;
export const START_WINDOW = 36, DRIFT_WINDOW = 60; // ticks during which a well-timed NITRO tap gives a free mini boost

const PI = 3.141592653589793, TAU = 6.283185307179586, HALF_PI = 1.5707963267948966;
const GRIP = 0.8607079764250578;        // exp(-9 * DT)
const GRIP_DRIFT = 0.9607894391523232;  // exp(-2.4 * DT)

export function dsin(x) {
  while (x > PI) x -= TAU;
  while (x < -PI) x += TAU;
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
}
export const dcos = x => dsin(x + HALF_PI);

export function padIndices(track, map) {
  return (map.boostPads || []).map(f => Math.floor(f * track.N) % track.N);
}

// Grid: two columns, rows behind the start line. `heading` is supplied by the server so both sides start bit-identical.
export function gridPlace(track, slot) {
  const row = Math.floor(slot / 2), col = slot % 2;
  const lapIdx = -Math.round((6 + row * 5) / track.step);
  const idx = ((lapIdx % track.N) + track.N) % track.N;
  const s = track.samples[idx];
  const side = (col === 0 ? -1 : 1) * track.half * 0.4;
  return { x: s.x + s.nx * side, z: s.z + s.nz * side, idx, lapIdx, heading: s.heading };
}

export function createCar(track, slot, heading) {
  const g = gridPlace(track, slot);
  return {
    x: g.x, z: g.z, y: 0, h: heading, vx: 0, vz: 0, idx: g.idx, lapIdx: g.lapIdx, prog: g.lapIdx, prevProg: g.lapIdx,
    steer: 0, drift: 0, charge: 0, gauge: 0, stock: 0, boostT: 0, wall: 0, vf: 0, wrong: false,
    lap: 0, tick: 0, finishMs: null, ev: 0,
    tapWin: START_WINDOW, tapPow: 0.4, sc: -1, scBase: 0, scCool: 0, slowT: 0, spinT: 0, airT: 0,
  };
}

export function applyEvent(c, code) {
  if (c.finishMs !== null) return;
  if (code === FX.NITRO) { c.boostT = 2.6; c.ev |= EV.NITRO; }
  else if (code === FX.BANANA) { c.spinT = STUN_TICKS; c.airT = 0; c.drift = 0; c.charge = 0; c.boostT = 0; c.ev |= EV.HIT; }
  else if (code === FX.BOMB) { c.airT = STUN_TICKS; c.spinT = 0; c.vx *= 0.55; c.vz *= 0.55; c.drift = 0; c.charge = 0; c.boostT = 0; c.ev |= EV.BOMB; }
  else if (code === FX.MAGNET) { if (c.slowT < 180) c.slowT = 180; c.boostT = 0; c.ev |= EV.SLOW; }
  else if (code === FX.PULL) { if (c.boostT < 0.9) c.boostT = 0.9; c.ev |= EV.PULL; }
}

export function stepCar(track, pads, c, bits, laps) {
  const N = track.N, samples = track.samples;
  const racing = c.finishMs === null;
  // spinning on a banana or flying from a bomb: the kart coasts and ignores the buttons until it recovers
  const stunned = c.spinT > 0 || c.airT > 0;
  if (c.spinT > 0) c.spinT--;
  if (c.airT > 0) c.airT--;
  const active = racing && !stunned;
  const target = active ? ((bits & IN.RIGHT) ? 1 : 0) - ((bits & IN.LEFT) ? 1 : 0) : 0;
  // steering follows the buttons quickly; flipping left<->right is the fastest so the kart never 'keeps turning the old way'
  c.steer += (target - c.steer) * (target === 0 ? 0.25 : target * c.steer < 0 ? 0.45 : 0.2);
  const steer = c.steer;
  const holdDrift = active && (bits & IN.DRIFT) !== 0;

  // drift state machine + nitro economy
  const vf0 = c.vx * dsin(c.h) + c.vz * dcos(c.h);
  if (active) {
    if (!c.drift && holdDrift && (steer > 0.15 || steer < -0.15) && vf0 > 13) { c.drift = steer > 0 ? 1 : -1; c.charge = 0; }
    if (c.tapWin > 0) c.tapWin--;
    if (c.drift && (!holdDrift || vf0 < 9 || steer * c.drift < -0.5)) { // released, too slow, or steering firmly the other way
      // a real drift opens a 1 s window: tap NITRO in time for a free burst (about 15% of a bottle; a bit more for long drifts)
      if (c.charge >= 0.3) { c.tapWin = DRIFT_WINDOW; c.tapPow = c.charge >= 1.7 ? 0.75 : c.charge >= 0.75 ? 0.55 : 0.4; c.ev |= EV.WINDOW; }
      c.drift = 0; c.charge = 0;
    }
    if (c.drift) { c.charge += DT * (0.55 + 0.6 * (steer < 0 ? -steer : steer)); c.gauge += DT * 0.2; }
    c.gauge += DT * 0.02;
    if (c.gauge >= 1) { if (c.stock < 2) { c.stock++; c.gauge = 0; c.ev |= EV.STOCK; } else c.gauge = 1; }
    if (bits & IN.NITRO) {
      if (c.tapWin > 0) { c.tapWin = 0; if (c.boostT < c.tapPow) c.boostT = c.tapPow; c.tapPow = 0.4; c.ev |= EV.TAP; }
      else if (c.stock > 0 && c.boostT < 0.3) { c.stock--; c.boostT = 2.6; c.ev |= EV.NITRO; }
    }
  } else if (c.drift) { c.drift = 0; c.charge = 0; }
  c.boostT = c.boostT > DT ? c.boostT - DT : 0;
  const boosting = c.boostT > 0;

  // steering (screen-right = heading decreases)
  const av = vf0 < 0 ? -vf0 : vf0;
  const sp = av < 10 ? av / 10 : 1;
  const rate = c.drift ? (c.drift * 1.0 + steer * 1.15) * sp : steer * 1.8 * sp * (1 - 0.3 * (av < V_BOOST ? av / V_BOOST : 1));
  c.h -= rate * DT;
  if (c.h > PI) c.h -= TAU; else if (c.h < -PI) c.h += TAU;

  // velocity in the new car frame: forward + lateral (lateral bleeds off = grip)
  const fx = dsin(c.h), fz = dcos(c.h), rx = -fz, rz = fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
  const slowed = c.slowT > 0;
  if (slowed) c.slowT--;
  const maxV = slowed ? (boosting ? 30 : V_SLOW) : boosting ? V_BOOST : V_MAX;
  if (!active) vf -= vf * 0.025;
  else if (bits & IN.BRAKE) { vf -= 34 * DT; if (vf < -7) vf = -7; }
  else if (vf < maxV) { vf += (boosting ? 42 : 13 + (1 - vf / maxV) * 12) * DT; if (vf > maxV) vf = maxV; }
  else vf -= (vf - maxV) * (slowed ? 5 : 1.6) * DT;
  vl *= c.drift ? GRIP_DRIFT : GRIP;
  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  c.x += c.vx * DT; c.z += c.vz * DT;

  if (c.scCool > 0) c.scCool--;
  const limit = track.half - 1.0;
  const cuts = track.shortcuts;
  c.wall = c.wall > DT ? c.wall - DT : 0;
  let s, lat = 0;
  if (c.sc < 0) {
    // nearest track sample (local search: the car moves less than one sample per tick)
    let idx = c.idx, bd = Infinity;
    for (let o = -6; o <= 6; o++) {
      const i = ((c.idx + o) % N + N) % N, q = samples[i];
      const d = (q.x - c.x) * (q.x - c.x) + (q.z - c.z) * (q.z - c.z);
      if (d < bd) { bd = d; idx = i; }
    }
    let di = idx - c.idx; if (di > N / 2) di -= N; else if (di < -N / 2) di += N;
    c.lapIdx += di; c.idx = idx;
    s = samples[idx];
    lat = (c.x - s.x) * s.nx + (c.z - s.z) * s.nz;
    if (lat > limit || lat < -limit) {
      // squeezing through the mouth of a shortcut?
      for (let k = 0; k < cuts.length; k++) {
        const q = cuts[k], px = c.x - q.ax, pz = c.z - q.az;
        const t = (px * q.ux + pz * q.uz) / q.len, d = pz * q.ux - px * q.uz;
        if (t > 0 && t < 1 && d <= q.hw - 0.8 && d >= 0.8 - q.hw) {
          let off = idx - q.from; if (off > N / 2) off -= N; else if (off < -N / 2) off += N;
          c.sc = k; c.scBase = c.lapIdx - off;
          if (c.scCool === 0 && vf > 8) { c.scCool = 480; if (c.boostT < 0.4) c.boostT = 0.4; c.ev |= EV.SHORTCUT; } // reward: ~15% of a bottle
          break;
        }
      }
      if (c.sc < 0) { // barrier
        const sg = lat > 0 ? 1 : -1, over = lat * sg - limit;
        c.x -= s.nx * over * sg; c.z -= s.nz * over * sg;
        const vn = (c.vx * s.nx + c.vz * s.nz) * sg;
        if (vn > 0) { c.vx -= s.nx * vn * sg * 1.2; c.vz -= s.nz * vn * sg * 1.2; if (vn > 6 && c.wall === 0) c.ev |= EV.WALL; }
        c.vx *= 0.98167; c.vz *= 0.98167;
        let turn = s.tx * fz - s.tz * fx;                      // sin(angle from car heading to road direction)
        if (s.tx * fx + s.tz * fz < 0) turn = turn >= 0 ? 1 : -1; // facing backwards: turn hard
        if (target === 0 || turn * target < 0) c.h += turn * 2.4 * DT; // (turn > 0 means "steer left"; never push against the player's button)
        c.wall = 0.3;
      }
    }
  }
  if (c.sc >= 0) {
    // inside a shortcut corridor: a narrow straight lane between two points of the main road
    const q = cuts[c.sc];
    let joined = false;
    for (let e = 0; e < 2 && !joined; e++) { // rejoin the main road at the far end (e=0) or back at the entry (e=1)
      const centre = e === 0 ? q.to : q.from;
      let bi = centre, bd = Infinity;
      for (let o = -10; o <= 10; o++) {
        const i = ((centre + o) % N + N) % N, p = samples[i];
        const d = (p.x - c.x) * (p.x - c.x) + (p.z - c.z) * (p.z - c.z);
        if (d < bd) { bd = d; bi = i; }
      }
      const p = samples[bi], l2 = (c.x - p.x) * p.nx + (c.z - p.z) * p.nz;
      if (l2 <= limit && l2 >= -limit && bd < track.half * track.half) {
        let off = bi - centre; if (off > N / 2) off -= N; else if (off < -N / 2) off += N;
        c.idx = bi; c.lapIdx = c.scBase + (e === 0 ? q.span : 0) + off; c.sc = -1; s = p; lat = l2; joined = true;
      }
    }
    if (!joined) {
      const px = c.x - q.ax, pz = c.z - q.az;
      let t = (px * q.ux + pz * q.uz) / q.len;
      const d = pz * q.ux - px * q.uz, lim = q.hw - 1.0;
      if (d > lim || d < -lim) {
        const sg = d > 0 ? 1 : -1, over = d * sg - lim, wx = -q.uz, wz = q.ux;
        c.x -= wx * over * sg; c.z -= wz * over * sg;
        const vn = (c.vx * wx + c.vz * wz) * sg;
        if (vn > 0) { c.vx -= wx * vn * sg * 1.2; c.vz -= wz * vn * sg * 1.2; if (vn > 6 && c.wall === 0) c.ev |= EV.WALL; }
        c.vx *= 0.98167; c.vz *= 0.98167;
        const fwd = q.ux * fx + q.uz * fz >= 0 ? 1 : -1;
        c.h += fwd * (q.ux * fz - q.uz * fx) * 2.4 * DT;
        c.wall = 0.3;
      }
      if (t < 0) t = 0; else if (t > 1) t = 1;
      c.y = q.ya + (q.yb - q.ya) * t; c.vf = vf; c.wrong = false;
      c.prog = c.scBase + t * q.span;
    }
  }
  if (c.sc < 0) {
    // boost pads
    for (let k = 0; k < pads.length; k++) {
      let pd = c.idx - pads[k]; if (pd > N / 2) pd -= N; else if (pd < -N / 2) pd += N;
      if (pd >= -2 && pd <= 2 && lat < 3.8 && lat > -3.8 && c.boostT < 0.9) { c.boostT = 1.0; c.ev |= EV.PAD; }
    }
    // slow strips: touch one and the kart crawls for two seconds
    const zones = track.slowZones;
    for (let k = 0; k < zones.length; k++) {
      const zn = zones[k];
      let pd = c.idx - zn.idx; if (pd > N / 2) pd -= N; else if (pd < -N / 2) pd += N;
      if (pd >= -zn.len && pd <= zn.len && lat - zn.lat < zn.hw && lat - zn.lat > -zn.hw && c.slowT < SLOW_STRIP_TICKS - 30) { c.slowT = SLOW_STRIP_TICKS; c.boostT = 0; c.ev |= EV.SLOW; }
    }
    c.y = s.y; c.vf = vf;
    c.wrong = vf > 4 && (fx * s.tx + fz * s.tz) < -0.3;
    c.prog = c.lapIdx + ((c.x - s.x) * s.tx + (c.z - s.z) * s.tz) / track.step;
  }

  // continuous progress along the road -> laps and a sub-tick finish time
  if (racing) {
    const lap = Math.floor(c.prog / N);
    if (lap > c.lap) {
      c.lap = lap; c.ev |= EV.LAP;
      if (lap >= laps) {
        const goal = laps * N, span = c.prog - c.prevProg;
        const frac = span > 0 ? (goal - c.prevProg) / span : 1;
        c.finishMs = Math.round((c.tick + (frac < 0 ? 0 : frac > 1 ? 1 : frac)) * TICK_MS);
        c.ev |= EV.FINISH;
      }
    }
  }
  c.prevProg = c.prog;
  c.tick++;
}
