// Client-side prediction with rollback, shared by the game and the test bots.
// The player's own kart is simulated locally the instant a button is pressed. When the server injects an effect
// (banana hit, magnet, item nitro) it names the tick it applied it at; if we are already past that tick we rewind
// to it, apply the effect, and replay our own stored button presses, ending up exactly where the server is.
import { stepCar, applyEvent } from './physics.js';

const H = 360; // ticks of history (6 s)

export class Predictor {
  constructor(track, pads, car, laps) {
    this.track = track; this.pads = pads; this.car = car; this.laps = laps;
    this.snap = Array.from({ length: H }, () => ({})); this.bits = new Uint8Array(H); this.events = [];
  }
  _tick(bits) {
    const c = this.car, i = c.tick % H;
    Object.assign(this.snap[i], c); this.bits[i] = bits;
    for (const e of this.events) if (e.k === c.tick) applyEvent(c, e.c);
    stepCar(this.track, this.pads, c, bits, this.laps);
  }
  step(bits) { this._tick(bits); }
  // returns false if the effect is too old to rewind to (the server stays authoritative either way)
  onEvent(k, code) {
    const c = this.car;
    this.events.push({ k, c: code });
    if (this.events.length > 64) this.events.shift();
    if (k >= c.tick) return true;
    const now = c.tick;
    if (now - k >= H) return false;
    const pendingEv = c.ev;
    Object.assign(c, this.snap[k % H]);
    c.ev = 0;
    while (c.tick < now) this._tick(this.bits[c.tick % H]);
    const probe = { finishMs: null, ev: 0, vx: 0, vz: 0, slowT: 0, boostT: 0, spinT: 0, airT: 0 }; applyEvent(probe, code);
    c.ev = pendingEv | probe.ev; // only announce the new effect, not everything that replayed
    return true;
  }
}
