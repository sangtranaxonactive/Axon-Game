// All sound is synthesised with WebAudio (no audio files): engine, tyre screech, nitro, UI beeps and an
// original dark trap instrumental at 140 BPM (see the music section below). A real beat file can replace it via config.json "music".
const BPM = 140, STEP = 60 / BPM / 4; // 16th notes
const hz = n => 440 * Math.pow(2, (n - 69) / 12);

export const audio = {
  ctx: null, muted: false, master: null, sfx: null, music: null, musicLP: null,
  engine: null, engGain: null, screechGain: null, noise: null,
  step: 0, nextT: 0, timer: null, intense: false,

  unlock() {
    if (this.ctx) { if (this.ok) this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new C();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -6; comp.ratio.value = 2.5; comp.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
      this.musicLP = ctx.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 16000; this.musicLP.connect(this.master);
      this.music = ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.musicLP);
      // shared white-noise buffer
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // engine
      this.engine = ctx.createOscillator(); this.engine.type = 'sawtooth';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      this.engine.connect(lp).connect(this.engGain).connect(this.sfx); this.engine.start();
      // tyre screech: band-passed noise, always running, gain opened while drifting
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 5;
      const bp2 = ctx.createBiquadFilter(); bp2.type = 'peaking'; bp2.frequency.value = 3300; bp2.Q.value = 6; bp2.gain.value = 12;
      this.screechGain = ctx.createGain(); this.screechGain.gain.value = 0;
      src.connect(bp).connect(bp2).connect(this.screechGain).connect(this.sfx); src.start();
      this.screechBP = bp;
      this.nextT = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 40);
      this.ok = true;
    } catch (e) { console.warn('audio unavailable:', e && e.message); this.ok = false; }
  },
  // Music is generated on the device (no download, no network traffic); it only costs a little CPU.
  stopMusic() { this.musicOff = true; clearInterval(this.timer); this.timer = null; if (this.ok) this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); },
  setMuted(m) { this.muted = m; if (this.ok) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); },
  // menu = filtered & quiet, race = full power
  setIntense(on) {
    this.intense = on; if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.musicLP.frequency.setTargetAtTime(16000, t, 0.25); // no more muffling filter in the menus, just quieter
    if (!this.musicOff) this.music.gain.setTargetAtTime(on ? 0.85 : 0.42, t, 0.25);
  },
  setEngine(speed, on) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(52 + Math.abs(speed) * 3.6, t, 0.05);
    this.engGain.gain.setTargetAtTime(on ? 0.028 : 0, t, 0.08);
  },
  setScreech(amount) { // 0..1
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.screechGain.gain.setTargetAtTime(amount * 0.11, t, 0.04);
    this.screechBP.frequency.setTargetAtTime(1700 + amount * 900, t, 0.1);
  },
  beep(freq, dur = 0.15, vol = 0.12, type = 'square') {
    if (!this.ok) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur);
  },
  boost(power = 1) { // rising whoosh + sub thump
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 0.35 + power * 0.7;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(5200, t + dur * 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.32 * (0.5 + power * 0.5), t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(bp).connect(g).connect(this.sfx); n.start(t); n.stop(t + dur);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(110 + 520 * power, t + dur * 0.7);
    og.gain.setValueAtTime(0.09, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og).connect(this.sfx); o.start(t); o.stop(t + dur);
  },
  ready() { [784, 1046, 1568].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 0.1, 'triangle'), i * 70)); },

  // ---------------------------------------------------------------- music
  // Dark trap instrumental, 140 BPM half-time: gliding distorted 808, punchy kick, layered clap with room reverb,
  // rolling hats, a minor-key piano motif (F phrygian colour: F - Gb - Ab) and a low string bed.
  fx() { // lazily build the shared reverb + saturation curve
    if (this.rev) return;
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * 1.9), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    const rg = ctx.createGain(); rg.gain.value = 0.55; this.rev.connect(rg).connect(this.music);
    this.curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; this.curve[i] = Math.tanh(x * 3.4); }
    this.lastBass = 0;
  },
  sub808(t, note, len) { // long sine sub, glides in from the previous note, driven hard so phone speakers still carry it
    const ctx = this.ctx, o = ctx.createOscillator(), pre = ctx.createGain(), sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    const f = hz(note), from = this.lastBass || f * 1.5; this.lastBass = f;
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    pre.gain.value = 1.5; sh.curve = this.curve; sh.oversample = '2x'; lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + 0.012); g.gain.setValueAtTime(0.8, t + len * 0.55); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(pre).connect(sh).connect(lp).connect(g).connect(this.music); o.start(t); o.stop(t + len + 0.03);
  },
  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    g.gain.setValueAtTime(1.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.28);
    this.noiseHit(t, 0.014, 3000, 'highpass', 0.4);
  },
  noiseHit(t, dur, freq, type, vol, wet = 0, q = 0.7) {
    const ctx = this.ctx, n = ctx.createBufferSource(); n.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(g); g.connect(this.music);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.rev); }
    n.start(t, Math.random()); n.stop(t + dur + 0.01);
  },
  clap(t) { // three quick slaps + a tail, sent to the room
    for (const d of [0, 0.011, 0.023]) this.noiseHit(t + d, 0.03, 1500, 'bandpass', 0.5, 0, 1.2);
    this.noiseHit(t + 0.03, 0.24, 1700, 'bandpass', 0.62, 0.7, 0.9); this.noiseHit(t, 0.1, 240, 'lowpass', 0.5);
    this.noiseHit(t, 0.12, 5200, 'highpass', 0.16);
  },
  keys(t, note, len, vol) { // felt-piano tone: decaying harmonic partials, soft hammer noise, reverb
    const ctx = this.ctx, g = ctx.createGain(), f = hz(note);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.18); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    for (const [k, amp, dec] of [[1, 1, 1], [2, 0.5, 0.6], [3, 0.24, 0.4], [4, 0.12, 0.28], [5.02, 0.06, 0.2]]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f * k * (1 + (k - 1) * 0.0006);
      og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.001, t + len * dec);
      o.connect(og).connect(g); o.start(t); o.stop(t + len + 0.02);
    }
    const w = ctx.createGain(); w.gain.value = 0.5; g.connect(this.music); g.connect(w).connect(this.rev);
  },
  strings(t, notes, len) { // slow, dark string bed under each bar
    const ctx = this.ctx, lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1300, t + len * 0.6); lp.frequency.linearRampToValueAtTime(500, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.055, t + 0.35); g.gain.setValueAtTime(0.055, t + len - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
    for (const n of notes) for (const det of [-9, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + len + 0.05); }
    const w = ctx.createGain(); w.gain.value = 0.7; lp.connect(g); g.connect(this.music); g.connect(w).connect(this.rev);
  },
  async loadTrack(url) { // optional: a real beat file set as "music" in config.json replaces the synthesised one
    try {
      if (!this.ok || this.track) return;
      this.track = true;
      const buf = await this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      clearInterval(this.timer); this.timer = null;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(this.music); src.start();
    } catch { this.track = false; }
  },
  schedule() {
    const ctx = this.ctx;
    if (!this.ok || ctx.state !== 'running') return;
    this.fx();
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.05; // tab was asleep
    while (this.nextT < ctx.currentTime + 0.2) { this.playStep(this.step, this.nextT); this.step++; this.nextT += STEP; }
  },
  playStep(n, t) {
    const s = n % 64, bar = Math.floor(s / 16), q = s % 16, section = Math.floor(n / 64) % 4;
    const full = section !== 0; // section 0 = breakdown (keys + strings + hats), then the drop
    // 808 line (MIDI): F1 home, sliding to Ab1 / Gb1, Db2 and C2 in bars 3-4
    const bass = [
      { 0: [29, 0.62], 6: [29, 0.3], 10: [32, 0.45], 14: [29, 0.2] },
      { 0: [29, 0.5], 4: [29, 0.25], 7: [30, 0.35], 11: [29, 0.5] },
      { 0: [37, 0.62], 6: [37, 0.3], 10: [36, 0.45], 13: [32, 0.3] },
      { 0: [36, 0.5], 3: [36, 0.22], 6: [36, 0.3], 10: [28, 0.3], 12: [28, 0.18], 14: [30, 0.2] },
    ][bar][q];
    if (bass && full) { this.sub808(t, bass[0], bass[1] + 0.25); if (q === 0 || q === 10 || (bar === 1 && q === 7)) this.kick(t); }
    if (full && q === 3 && bar % 2 === 0) this.kick(t);
    if (q === 8 && full) this.clap(t);                                                   // half-time clap on beat 3
    if (full && bar === 3 && (q === 13 || q === 14 || q === 15)) this.noiseHit(t, 0.07, 2200, 'bandpass', 0.22 + (q - 13) * 0.08, 0.3); // snare pickup
    // hats: straight 8ths with ghost 16ths and 32nd / triplet rolls
    const roll = (bar === 0 && q === 7) || (bar === 1 && q >= 13) || (bar === 2 && (q === 6 || q === 7)) || (bar === 3 && q >= 9 && q <= 12);
    if (q % 2 === 0) this.noiseHit(t, 0.03, 9500, 'highpass', q % 4 === 0 ? 0.15 : 0.1);
    else if (full && (q === 5 || q === 11)) this.noiseHit(t, 0.02, 9500, 'highpass', 0.05);
    if (roll && full) { const k = bar === 3 ? 3 : 2; for (let i = 1; i < k; i++) this.noiseHit(t + i * STEP / k, 0.02, 10500, 'highpass', 0.085); if (q % 2) this.noiseHit(t, 0.02, 10500, 'highpass', 0.085); }
    if (q === 12 && bar % 2 === 0 && full) this.noiseHit(t, 0.25, 7000, 'highpass', 0.07);   // open hat
    // piano motif
    const X = null, lead = [
      [65, X, X, 68, X, X, 65, X, 66, X, X, 65, X, X, 63, X],
      [65, X, X, 68, X, X, 65, X, 66, X, X, 68, X, 66, 65, X],
      [61, X, X, 65, X, X, 61, X, 63, X, X, 61, X, X, 60, X],
      [60, X, X, 64, X, X, 67, X, 70, X, 68, X, 67, X, 64, X],
    ][bar][q];
    if (lead != null) { this.keys(t, lead, 0.9, 0.16); if (q === 0) this.keys(t, lead - 12, 1.4, 0.13); if (section >= 2) this.keys(t, lead + 12, 0.5, 0.07); }
    if (q === 0 && bar === 0 && full) { this.noiseHit(t, 1.4, 6000, 'highpass', 0.16, 0.6); this.kick(t); }                       // crash on every phrase
    if (section === 0 && bar === 3 && q >= 8) this.noiseHit(t, 0.06, 2000, 'bandpass', 0.12 + (q - 8) * 0.04, 0.3);              // snare roll into the drop
    if (section === 0 && bar === 3 && q >= 12) this.noiseHit(t + STEP / 2, 0.05, 2000, 'bandpass', 0.2 + (q - 12) * 0.05, 0.3);
    if (full && (q === 6 || q === 14) && bar % 2 === 1) this.kick(t);                                                              // extra kicks drive the second half of each pair of bars
    if (q === 0) this.strings(t, [[41, 53, 56, 60], [41, 53, 56, 61], [37, 49, 53, 56], [36, 48, 52, 55]][bar], STEP * 16);
    if (q === 0 && bar === 0 && section === 1) { this.noiseHit(t, 1.2, 4000, 'highpass', 0.1, 0.5); this.keys(t, 29 + 24, 2, 0.2); } // the drop
  },
};
