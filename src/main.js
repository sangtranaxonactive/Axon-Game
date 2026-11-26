import * as THREE from 'three';
import { buildTrack, fmtTime } from './track-core.js';
import { createCar, gridPlace, padIndices, IN, EV, TICK_MS } from './physics.js';
import { buildWorld } from './world.js';
import { makeCar } from './car.js';
import { audio } from './audio.js';
import { CHARS, COLORS } from './looks.js';
import { Predictor } from './netcar.js';
import { createItems } from './items-view.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ boot
const cfg = await (await fetch('/api/config')).json();
const mapName = String(cfg.map).replace(/[^\w-]/g, '');
const map = await (await fetch(`/maps/${mapName}.json`)).json();
const track = buildTrack(map);
const pads = padIndices(track, map);
const teamColor = Object.fromEntries(cfg.teams.map(t => [t.id, t.color]));
const teamName = Object.fromEntries(cfg.teams.map(t => [t.id, t.name]));

const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !isTouch, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1500);
// Bloom makes lamps, neon and nitro glow. It is the first thing switched off if a phone cannot keep up.
let bloomOn = map.theme === 'arena' && map.bloom !== false && qs.get('bloom') !== '0'; // daylight maps are bright already: no bloom there
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.5, 0.96);
composer.addPass(bloom); composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();
const world = await buildWorld(scene, renderer, track, map, cfg);
$('loading').remove();

// ------------------------------------------------------------------ profile
const me = {
  pid: store.get('yep_pid') || (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')),
  name: store.get('yep_name') || '',
  team: store.get('yep_team') || '',
  id: 0, best: null, rank: null, look: [0, 0, 0],
};
try { const l = JSON.parse(store.get('yep_look') || '[]'); if (Array.isArray(l) && l.length === 3) me.look = l.map(v => v | 0); } catch { /* default look */ }
const carOf = (look, name, team) => makeCar(COLORS[look?.[2]] || COLORS[0], name, { char: look?.[0] | 0, charColor: COLORS[look?.[1]] || COLORS[0], tag: teamColor[team] });
store.set('yep_pid', me.pid);
if (!teamColor[me.team]) me.team = '';

// ------------------------------------------------------------------ UI helpers
let previewRef = null;
const screens = ['sProfile', 'sHome', 'sLobby', 'sResult', 'sBoard', 'sGarage'];
let current = null, boardReturn = 'sHome';
function show(id) {
  current = id;
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id !== null);
  $('ui').classList.toggle('dock', id === 'sGarage');
  if (previewRef) previewRef.show(id === 'sGarage');
}
let toastTimer;
function toast(msg, ms = 2600) {
  $('toast').textContent = msg; $('toast').classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), ms);
}
for (const id of ['evName', 'evName2']) $(id).textContent = cfg.eventName;
$('evSub').textContent = cfg.subtitle || '';
$('evPrize').textContent = cfg.prize || '';
$('hLaps').textContent = cfg.laps;
document.title = cfg.eventName;

function renderTeams() {
  $('teamPick').innerHTML = cfg.teams.map(t => `<button data-t="${esc(t.id)}" class="${t.id === me.team ? 'on' : ''}"><i style="background:${esc(t.color)}"></i>${esc(t.name)}</button>`).join('');
}
$('teamPick').onclick = e => { const b = e.target.closest('button'); if (b) { me.team = b.dataset.t; renderTeams(); } };
function renderHome() {
  $('meName').textContent = me.name;
  $('meDot').style.background = teamColor[me.team];
  $('meBest').textContent = me.best != null ? fmtTime(me.best) : 'none yet';
  $('meRank').textContent = me.rank ? `· rank #${me.rank}` : '';
}
function openProfile() { $('inName').value = me.name; renderTeams(); show('sProfile'); }
$('btnEnter').onclick = () => {
  const name = $('inName').value.trim().slice(0, 16);
  if (!name) return toast('Please enter your name');
  if (!me.team) return toast('Please pick a team');
  me.name = name; store.set('yep_name', name); store.set('yep_team', me.team);
  audio.unlock();
  net.hello();
  renderHome(); show('sHome');
  if (qs.get('room')) { net.send({ t: 'join', code: qs.get('room') }); qs.delete('room'); }
};
$('btnEdit').onclick = openProfile;

// ------------------------------------------------------------------ garage: pick a driver + colours (cosmetic only)
const preview = {
  mesh: null, on: false,
  spot: (() => { const s = track.samples[Math.floor(track.N * 0.015)]; return new THREE.Vector3(s.x, s.y, s.z); })(),
  build() { if (this.mesh) scene.remove(this.mesh); this.mesh = carOf(me.look, null, me.team); this.mesh.position.copy(this.spot); scene.add(this.mesh); },
  show(on) { this.on = on; if (on) this.build(); else if (this.mesh) { scene.remove(this.mesh); this.mesh = null; } },
};
previewRef = preview;
function renderGarage() {
  $('gChars').innerHTML = CHARS.map((n, i) => `<button data-i="${i}" class="${i === me.look[0] ? 'on' : ''}">${n}</button>`).join('');
  const sw = k => COLORS.map((c, i) => `<button data-i="${i}" class="${i === me.look[k] ? 'on' : ''}" style="background:${c}" aria-label="colour ${i + 1}"></button>`).join('');
  $('gCharCol').innerHTML = sw(1); $('gKartCol').innerHTML = sw(2);
}
const pick = (id, k) => { $(id).onclick = e => { const b = e.target.closest('button'); if (!b) return; me.look[k] = +b.dataset.i; store.set('yep_look', JSON.stringify(me.look)); renderGarage(); preview.build(); audio.beep(880, 0.05, 0.06, 'triangle'); }; };
pick('gChars', 0); pick('gCharCol', 1); pick('gKartCol', 2);
$('btnGarage').onclick = () => { audio.unlock(); renderGarage(); show('sGarage'); };
$('btnGarageDone').onclick = () => { net.hello(); renderHome(); show('sHome'); };
$('btnQuick').onclick = () => { audio.unlock(); net.send({ t: 'quick' }); };
$('btnCreate').onclick = () => { audio.unlock(); net.send({ t: 'create' }); };
$('btnJoin').onclick = () => { audio.unlock(); const c = $('inCode').value.trim(); if (c.length === 4) net.send({ t: 'join', code: c }); else toast('Room codes are 4 digits'); };
$('btnLeave').onclick = () => { net.send({ t: 'leave' }); room = null; show('sHome'); };
$('btnGo').onclick = () => net.send({ t: 'go' });
$('btnHome').onclick = () => { net.send({ t: 'leave' }); room = null; endRaceView(); renderHome(); show('sHome'); };
$('btnAgain').onclick = () => {
  endRaceView();
  if (room && !room.pub) { renderLobby(); show('sLobby'); } else net.send({ t: 'quick' });
};
$('btnQuit').onclick = () => { net.send({ t: 'leave' }); room = null; endRaceView(); renderHome(); show('sHome'); };
$('btnMute').onclick = () => { audio.setMuted(!audio.muted); $('btnMute').classList.toggle('off', audio.muted); };

// leaderboard panel
let boardData = null, boardTab = 'solo';
async function openBoard(from) {
  boardReturn = from; show('sBoard');
  $('bdList').innerHTML = '<li>Loading…</li>';
  try { boardData = await (await fetch('/api/leaderboard')).json(); renderBoard(); } catch { $('bdList').innerHTML = '<li>Could not load</li>'; }
}
function renderBoard() {
  $('tabSolo').classList.toggle('on', boardTab === 'solo'); $('tabTeam').classList.toggle('on', boardTab === 'team');
  if (!boardData) return;
  if (boardTab === 'solo') {
    $('bdList').innerHTML = boardData.top.map((e, i) =>
      `<li class="${i + 1 === me.rank && e.name === me.name ? 'me-row' : ''}"><span class="n">${i + 1}</span><i style="background:${esc(teamColor[e.team] || '#888')}"></i><span class="nm">${esc(e.name)}</span><span class="tm">${fmtTime(e.best)}</span></li>`).join('')
      || '<li>Nobody has finished yet — be the first!</li>';
  } else {
    $('bdList').innerHTML = boardData.teams.map((t, i) =>
      `<li><span class="n">${i + 1}</span><i style="background:${esc(t.color)}"></i><span class="nm">${esc(t.name)} <span class="small">· ${t.counted}/${cfg.teamTopN} counted · ${t.members} racers</span></span><span class="tm">${t.avg != null ? fmtTime(t.avg) : '—'}</span></li>`).join('');
  }
}
$('btnBoard').onclick = () => openBoard('sHome');
$('btnBoard2').onclick = () => openBoard('sResult');
$('btnBack').onclick = () => show(boardReturn);
$('tabSolo').onclick = () => { boardTab = 'solo'; renderBoard(); };
$('tabTeam').onclick = () => { boardTab = 'team'; renderBoard(); };

// ------------------------------------------------------------------ input
const inp = { left: false, right: false, drift: false, brake: false, nitro: false };
function bindHold(id, on, off) {
  const el = $(id);
  const down = e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* ok */ } el.classList.add('down'); on(); };
  const up = e => { e.preventDefault(); el.classList.remove('down'); off && off(); };
  el.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
bindHold('cLeft', () => inp.left = true, () => inp.left = false);
bindHold('cRight', () => inp.right = true, () => inp.right = false);
bindHold('cDrift', () => inp.drift = true, () => inp.drift = false);
bindHold('cNitro', () => inp.nitro = true);
bindHold('cItem', () => useItem());
const keymap = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', Shift: 'drift', ' ': 'drift', ArrowDown: 'brake', s: 'brake', S: 'brake', n: 'nitro', N: 'nitro', Control: 'nitro', ArrowUp: 'nitro' };
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'e' || e.key === 'E' || e.key === 'x' || e.key === 'X') { if (!e.repeat) useItem(); return; } const k = keymap[e.key]; if (k) { inp[k] = true; e.preventDefault(); } });
addEventListener('keyup', e => { const k = keymap[e.key]; if (k && k !== 'nitro') inp[k] = false; });
document.addEventListener('gesturestart', e => e.preventDefault());
addEventListener('pointerdown', () => { audio.unlock(); if (cfg.music) audio.loadTrack(cfg.music); }, { once: true });
addEventListener('blur', () => { inp.left = inp.right = inp.drift = inp.brake = false; });

// ------------------------------------------------------------------ network
let room = null;
const net = {
  ws: null, ready: false, retry: 0,
  connect() {
    const ws = this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => { this.ready = true; this.retry = 0; if (me.name && me.team) this.hello(); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
      this.ready = false;
      if (race || room) { toast('Connection lost — reconnecting…', 4000); room = null; endRaceView(); if (me.name) { renderHome(); show('sHome'); } }
      setTimeout(() => this.connect(), Math.min(5000, 500 + this.retry++ * 700));
    };
  },
  send(o) { if (this.ready) this.ws.send(JSON.stringify(o)); else toast('Connecting to server…'); },
  hello() { if (this.ready) this.ws.send(JSON.stringify({ t: 'hello', pid: me.pid, name: me.name, team: me.team, look: me.look })); },
};

function renderLobby() {
  if (!room) return;
  $('lbTitle').textContent = room.pub ? 'MATCHMAKING' : 'PRIVATE ROOM';
  $('lbCode').textContent = room.pub ? '' : room.code;
  $('lbCode').classList.toggle('hidden', room.pub);
  $('lbPlayers').innerHTML = room.players.map(p => `<li><i style="background:${esc(teamColor[p.team])}"></i>${esc(p.name)}${p.id === room.host && !room.pub ? ' 👑' : ''}${p.id === me.id ? ' (you)' : ''}</li>`).join('');
  $('btnGo').classList.toggle('hidden', room.pub || room.host !== me.id);
  if (room.pub) {
    room.startAtLocal = performance.now() + (room.startsIn ?? 0);
    $('lbInfo').textContent = '';
  } else {
    $('lbInfo').textContent = room.host === me.id ? `Share this code with colleagues (up to ${cfg.roomSize} karts), then press START RACE` : 'Waiting for the host to start…';
  }
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome': me.id = m.id; me.best = m.best; me.rank = m.rank; if (m.team && m.team !== me.team) { me.team = m.team; store.set('yep_team', m.team); } renderHome(); break;
    case 'err': toast(m.msg, 5000); break;
    case 'room':
      room = m;
      if (!race) { renderLobby(); show('sLobby'); }
      break;
    case 'start': room = m; startRace(m); break;
    case 'S': if (race) { const nowT = performance.now(); for (const s of m.ps) { const r = race.remotes.get(s[0]); if (!r) continue; const el = (nowT - (r.at || nowT)) / 1000; if (el > 0.02 && el < 0.8) { r.vx = (s[1] - r.sx) / el; r.vz = (s[2] - r.sz) / el; } r.sx = r.tx = s[1]; r.sz = r.tz = s[2]; r.at = nowT; r.th = s[3]; r.p = s[4]; r.flags = s[5]; } } break;
    case 'ev': if (race && m.r === race.id) race.pred.onEvent(m.k, m.c); break;
    case 'item': if (m.kind && (m.kind !== myItem || m.n > myCount)) { flash(ITEM_NAME[m.kind] + (isTouch ? '' : ' — press E'), 1100, 'xs'); audio.ready(); } setItem(m.kind, m.n); break;
    case 'box': items.takeBox(m.i, m.ms); break;
    case 'ban': if (m.add) items.addBanana(m.add[0], m.add[1], m.add[2]); else items.delBanana(m.del); break;
    case 'fx': if (race && m.k === 'magnet' && m.from === me.id) flash('MAGNET!', 700, 'xs'); break;
    case 'p': netq.onPong(m.c); break;
    case 'done': if (race) { const r = race.remotes.get(m.id); if (r) { r.done = true; r.place = m.place; } } break;
    case 'grace': if (race && !race.finished) flash('45 seconds left!', 1600, true); break;
    case 'finish':
      me.best = m.best; me.rank = m.rank;
      if (race) race.myResult = m;
      audio.beep(880, 0.4); setTimeout(() => audio.beep(1320, 0.5), 180);
      break;
    case 'end': if (race) { race.over = true; race.queue = []; } showResults(m.results); break;
  }
}

// ------------------------------------------------------------------ skid marks (fade out over a few seconds)
const SKID_N = 480;
const skid = (() => {
  const pos = new Float32Array(SKID_N * 12), col = new Float32Array(SKID_N * 16), life = new Float32Array(SKID_N), idx = [];
  for (let i = 0; i < SKID_N; i++) { const a = i * 4; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 4);
  geo.setAttribute('position', pa); geo.setAttribute('color', ca); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
  mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  let head = 0, live = 0;
  const last = new Map();
  return {
    add(key, x, y, z, nx, nz) {
      const p = last.get(key);
      if (!p) { last.set(key, { x, z, nx, nz }); return; }
      if ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < 0.12) return;
      const i = head, w = 0.19; head = (head + 1) % SKID_N;
      pos.set([p.x - p.nx * w, y, p.z - p.nz * w, p.x + p.nx * w, y, p.z + p.nz * w, x - nx * w, y, z - nz * w, x + nx * w, y, z + nz * w], i * 12);
      life[i] = 1; live = SKID_N; pa.needsUpdate = true;
      p.x = x; p.z = z; p.nx = nx; p.nz = nz;
    },
    cut(key) { last.delete(key); },
    wheels(key, x, y, z, h) { // both rear tyres of a kart at (x, z) with heading h
      const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
      this.add(key + 'L', x - fx * 1.0 - rx * 0.92, y + 0.07, z - fz * 1.0 - rz * 0.92, rx, rz);
      this.add(key + 'R', x - fx * 1.0 + rx * 0.92, y + 0.07, z - fz * 1.0 + rz * 0.92, rx, rz);
    },
    lift(key) { last.delete(key + 'L'); last.delete(key + 'R'); },
    update(dt) {
      if (live <= 0) return;
      let any = false;
      for (let i = 0; i < SKID_N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt * 0.26; any = true;
        const a = life[i] > 0 ? Math.min(0.62, life[i] * 0.9) : 0, o = i * 16;
        for (let v = 0; v < 4; v++) { col[o + v * 4] = 0.03; col[o + v * 4 + 1] = 0.03; col[o + v * 4 + 2] = 0.04; col[o + v * 4 + 3] = a; }
      }
      ca.needsUpdate = true; if (!any) live = 0;
    },
    clear() { life.fill(0); col.fill(0); ca.needsUpdate = true; last.clear(); },
  };
})();
const fxEl = $('fx');
const setT = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v; } };
const setC = (el, cls, on) => { const k = '_c' + cls; if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); } };
function kickFx() {
  fxEl.classList.add('kick'); setTimeout(() => fxEl.classList.remove('kick'), 110);
  const b = $('cNitro'); b.classList.remove('burst'); void b.offsetWidth; b.classList.add('burst');
}

// ------------------------------------------------------------------ items + connection quality
const items = createItems(scene, track);
let myItem = null, myCount = 0;
const ITEM_NAME = { banana: 'BANANA ×2', magnet: 'MAGNET', nitro: 'NITRO ITEM' };
const ITEM_ICON = { banana: '#i-banana', magnet: '#i-magnet', nitro: '#i-bolt' };
function setItem(kind, n) {
  myItem = kind; myCount = n; const b = $('cItem');
  b.classList.toggle('hidden', !kind);
  if (kind) { b.querySelector('use').setAttribute('href', ITEM_ICON[kind]); b.querySelector('span').textContent = n > 1 ? '×' + n : ''; }
}
function useItem() { if (myItem && race && !race.finished && net.ready) net.ws.send(JSON.stringify({ t: 'use' })); }
// Latency probe every 2 s. On a weak connection we send fewer, larger input packets and ask the server for fewer
// position updates; the player's own kart never waits for the network, so their driving stays smooth regardless.
const netq = {
  rtt: 0, low: false, batch: 6, sentAt: 0, waiting: false,
  onPong(c) { const r = performance.now() - c; this.rtt = this.rtt ? this.rtt * 0.6 + r * 0.4 : r; this.waiting = false; this.judge(); },
  judge(lost) {
    const low = lost || this.rtt > 320 || (this.low && this.rtt > 200);
    if (low !== this.low) { this.low = low; this.batch = low ? 12 : 6; if (net.ready) net.ws.send(JSON.stringify({ t: 'net', low })); }
    const el = $('hNet'); el.dataset.q = lost || this.rtt > 320 ? '1' : this.rtt > 150 ? '2' : '3'; el.title = Math.round(this.rtt) + ' ms';
  },
};
setInterval(() => {
  if (!net.ready || !me.id) return;
  if (netq.waiting) { netq.rtt = Math.max(netq.rtt, 2000); netq.judge(true); }
  netq.waiting = true; net.ws.send(JSON.stringify({ t: 'p', c: performance.now() }));
}, 2000);

// ------------------------------------------------------------------ race
let race = null;
const N = track.N;

function flash(text, ms = 900, small = false) { // small: true = medium banner, 'xs' = small pill that never hides the road
  const el = $('hMsg'); el.textContent = text; el.classList.toggle('sm', small === true); el.classList.toggle('xs', small === 'xs');
  clearTimeout(flash.t); if (ms) flash.t = setTimeout(() => { el.textContent = ''; }, ms);
}

function startRace(m) {
  endRaceView();
  const mine = m.players.find(p => p.id === me.id);
  const car = createCar(track, mine ? mine.slot : 0, m.grid[me.id]);
  const mesh = carOf(me.look, null, me.team);
  scene.add(mesh);
  const remotes = new Map();
  for (const p of m.players) {
    if (p.id === me.id) continue;
    const rg = gridPlace(track, p.slot), rh = m.grid[p.id];
    const rm = carOf(p.look, p.name, p.team);
    scene.add(rm);
    remotes.set(p.id, { mesh: rm, sx: rg.x, sz: rg.z, vx: 0, vz: 0, at: 0, x: rg.x, z: rg.z, h: rh, tx: rg.x, tz: rg.z, th: rh, p: rg.lapIdx / N, flags: 0, px: rg.x, pz: rg.z, name: p.name, team: p.team });
  }
  items.reset(); setItem(null, 0);
  race = { id: m.race, over: false, pred: new Predictor(track, pads, car, m.laps), car, mesh, remotes, startAt: performance.now() + m.countdown, laps: m.laps, finished: false, lastCount: 5, camH: car.h, time: 0,
    acc: 0, last: 0, queue: [], sent: 0, prev: { x: car.x, z: car.z, h: car.h }, myResult: null };
  $('hPosOf').textContent = '/' + m.players.length;
  $('hBest').textContent = me.best != null ? 'Best ' + fmtTime(me.best) : '';
  show(null);
  $('hud').classList.remove('hidden');
  skid.clear(); audio.setIntense(true);
}

function endRaceView() {
  if (!race) return;
  scene.remove(race.mesh);
  for (const r of race.remotes.values()) scene.remove(r.mesh);
  race = null;
  flash('', 0);
  $('hWrong').classList.add('hidden');
  audio.setEngine(0, false); audio.setScreech(0); audio.setIntense(false);
  setC(fxEl, 'boost', false); setC(fxEl, 'slow', false); setC($('cNitro'), 'tap', false); setItem(null, 0);
}

function showResults(results) {
  const mine = results.find(r => r.id === me.id);
  const mr = race && race.myResult;
  $('rsMine').innerHTML = mine && mine.time != null
    ? `Your time<b>${fmtTime(mine.time)}</b>${mr && mr.record ? '<span class="pb">🏆 NEW COMPANY RECORD!</span>' : mr && mr.pb ? '<span class="pb">★ New personal best</span>' : ''}${me.rank ? ` · Overall rank #${me.rank}` : ''}`
    : 'You did not finish in time — try again!';
  $('rsList').innerHTML = results.map((r, i) => `<li class="${r.id === me.id ? 'me-row' : ''}"><span class="n">${r.time != null ? i + 1 : '–'}</span><i style="background:${esc(teamColor[r.team] || '#888')}"></i><span class="nm">${esc(r.name)}</span><span class="tm">${r.time != null ? fmtTime(r.time) : 'DNF'}</span></li>`).join('');
  $('btnAgain').textContent = room && !room.pub ? 'BACK TO LOBBY' : 'RACE AGAIN';
  if (room && room.pub) room = null;
  show('sResult');
}

const wrap = a => { a = (a + Math.PI) % (Math.PI * 2); return a < 0 ? a + Math.PI : a - Math.PI; };

// Advance the local kart by whole 1/60 s ticks and stream the button states to the server,
// which runs the very same simulation and decides the official time.
function simulate(now) {
  const c = race.car;
  if (!race.last) race.last = race.startAt;
  race.acc = Math.min(race.acc + (now - race.last), 5000); race.last = now; // keep the backlog: every real millisecond must be simulated
  let n = 0;
  while (race.acc >= TICK_MS && n++ < 12) {
    race.acc -= TICK_MS;
    const bits = (inp.left ? IN.LEFT : 0) | (inp.right ? IN.RIGHT : 0) | (inp.drift ? IN.DRIFT : 0) | (inp.brake ? IN.BRAKE : 0) | (inp.nitro && !(race.jump && c.tick < 45) ? IN.NITRO : 0);
    inp.nitro = false;
    race.prev.x = c.x; race.prev.z = c.z; race.prev.h = c.h;
    race.pred.step(bits);
    race.queue.push(bits);
    if (race.queue.length >= netq.batch) flushInputs();
  }
  if (c.ev) {
    const e = c.ev; c.ev = 0;
    if (e & EV.TAP) { audio.boost(0.35); kickFx(); flash(c.tick < 60 ? 'PERFECT START!' : 'BOOST!', 650, 'xs'); }
    if (e & EV.WINDOW) audio.beep(1320, 0.07, 0.07, 'triangle');
    if (e & EV.STOCK) { audio.ready(); flash('NITRO READY', 900, 'xs'); const g = $('hGauge').parentElement; g.classList.remove('full'); void g.offsetWidth; g.classList.add('full'); }
    if (e & EV.NITRO) { audio.boost(1); kickFx(); }
    if (e & EV.SHORTCUT) { flash('SHORTCUT BOOST!', 800, 'xs'); audio.boost(0.35); kickFx(); }
    if (e & EV.WALL) audio.beep(90, 0.12, 0.1);
    if (e & EV.PAD) audio.beep(740, 0.18);
    if (e & EV.SLOW) { flash('SLOWED!', 700, 'xs'); audio.beep(130, 0.3, 0.12, 'sawtooth'); }
    if (e & EV.HIT) { flash('BANANA!', 700, 'xs'); audio.beep(300, 0.12, 0.12); setTimeout(() => audio.beep(180, 0.25, 0.12), 110); }
    if (e & EV.PULL) { audio.boost(0.45); kickFx(); }
    if ((e & EV.LAP) && c.finishMs === null) { flash(c.lap === race.laps - 1 ? 'FINAL LAP!' : `LAP ${c.lap + 1}`, 1400, true); audio.beep(660, 0.2); }
  }
  // "finished" follows the simulation itself, so it stays right even after a rewind caused by an item
  const fin = c.finishMs !== null;
  if (fin && !race.finished) flash('FINISH!', 2500, true);
  race.finished = fin;
  race.time = fin ? c.finishMs : c.tick * TICK_MS;
}
function flushInputs() {
  if (!race.queue.length) return;
  if (net.ready) net.ws.send(JSON.stringify({ t: 'i', r: race.id, k: race.sent, b: race.queue }));
  race.sent += race.queue.length; race.queue = [];
}

// minimap
const mini = $('mini'), mctx = mini.getContext('2d');
let mb = null;
function miniSetup() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of track.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const sc = (mini.width - 36) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (mini.width - (maxX - minX) * sc) / 2, oz = (mini.height - (maxZ - minZ) * sc) / 2;
  // mirror X so the map reads the same way round as the chase camera at the start
  mb = { fx: x => mini.width - (ox + (x - minX) * sc), fz: z => oz + (z - minZ) * sc };
  const bg = document.createElement('canvas'); bg.width = mini.width; bg.height = mini.height;
  const g = bg.getContext('2d');
  g.lineJoin = g.lineCap = 'round';
  const path = () => { g.beginPath(); track.samples.forEach((s, i) => i ? g.lineTo(mb.fx(s.x), mb.fz(s.z)) : g.moveTo(mb.fx(s.x), mb.fz(s.z))); g.closePath(); };
  path(); g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 15; g.stroke();
  path(); g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 8; g.stroke();
  g.strokeStyle = '#35c8f5'; g.lineWidth = 3; g.setLineDash([5, 4]);
  for (const q of track.shortcuts) { g.beginPath(); g.moveTo(mb.fx(q.ax), mb.fz(q.az)); g.lineTo(mb.fx(q.bx), mb.fz(q.bz)); g.stroke(); }
  g.setLineDash([]);
  const s0 = track.samples[0]; g.fillStyle = '#35c8f5'; g.fillRect(mb.fx(s0.x) - 5, mb.fz(s0.z) - 5, 10, 10);
  mb.bg = bg;
}
miniSetup();
function drawMini() {
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.drawImage(mb.bg, 0, 0);
  for (const r of race.remotes.values()) {
    mctx.fillStyle = teamColor[r.team] || '#888'; mctx.strokeStyle = '#000'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(mb.fx(r.x), mb.fz(r.z), 7, 0, 7); mctx.fill(); mctx.stroke();
  }
  const c = race.car;
  mctx.fillStyle = '#fff'; mctx.strokeStyle = teamColor[me.team]; mctx.lineWidth = 5;
  mctx.beginPath(); mctx.arc(mb.fx(c.x), mb.fz(c.z), 9, 0, 7); mctx.fill(); mctx.stroke();
}

// ------------------------------------------------------------------ main loop
const clock = new THREE.Clock();
const focus = new THREE.Vector3(), look = new THREE.Vector3();
let attractShot = -1;
let frames = 0, fpsT = 0, lowCount = 0, tick = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const now = performance.now(), t = now / 1000;
  tick++;
  const portrait = innerHeight > innerWidth;

  if (race) {
    const c = race.car;
    const toStart = race.startAt - now;
    const started = toStart <= 0;
    // countdown
    if (!started) {
      const n = Math.ceil(toStart / 1000);
      if (n !== race.lastCount && n <= 3) { race.lastCount = n; flash(String(n), 0); audio.beep(440, 0.18); }
      if (inp.nitro && toStart > 90) { inp.nitro = false; if (toStart < 1500 && !race.jump) { race.jump = true; flash('TOO EARLY!', 600, true); audio.beep(160, 0.25); race.lastCount = 9; } }
    } else if (race.lastCount !== 0) { race.lastCount = 0; flash('GO!', 800); audio.beep(880, 0.5); }

    if (started && !race.over) simulate(now);
    const lapsDone = c.lap;

    // local car visuals (interpolated between the last two ticks for smoothness on any refresh rate)
    const a = Math.min(1, race.acc / TICK_MS), pv = race.prev;
    const rxp = pv.x + (c.x - pv.x) * a, rzp = pv.z + (c.z - pv.z) * a, rhp = pv.h + wrap(c.h - pv.h) * a;
    race.mesh.position.set(rxp, c.y, rzp);
    race.mesh.rotation.y = rhp;
    const lvl = c.drift ? (c.charge >= 1.7 ? 2 : c.charge >= 0.75 ? 1 : 0.5) : 0;
    race.mesh.userData.animate(c.vf, c.steer, lvl >= 1 ? lvl : 0, c.boostT > 0, dt, t, c.drift * -0.22);
    if (c.drift && started) skid.wheels('me', rxp, c.y, rzp, rhp); else skid.lift('me');
    audio.setScreech(c.drift ? Math.min(1, Math.abs(c.vf) / 28) : c.wall > 0.2 ? 0.35 : 0);
    setC(fxEl, 'boost', c.boostT > 0); setC(fxEl, 'slow', c.slowT > 0);
    setC($('cNitro'), 'tap', started && !race.finished && c.tapWin > 0 && !(race.jump && c.tick < 45));

    // remote cars: smooth towards last reported state
    let ahead = 0;
    const myP = c.prog / N;
    for (const r of race.remotes.values()) {
      if (r.at && now - r.at < 600) { r.tx += (r.vx || 0) * dt; r.tz += (r.vz || 0) * dt; } // keep moving between updates
      const k = Math.min(1, dt * (netq.low ? 6 : 9));
      r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.h += wrap(r.th - r.h) * k;
      const sp = Math.hypot(r.x - r.px, r.z - r.pz) / Math.max(dt, 1e-3); r.px = r.x; r.pz = r.z;
      const ri = ((Math.round(r.p * N) % N) + N) % N;
      r.mesh.position.set(r.x, track.samples[ri].y, r.z);
      r.mesh.rotation.y = r.h;
      r.mesh.userData.animate(sp, 0, r.flags & 1 ? 1 : 0, !!(r.flags & 2), dt, t);
      if (r.flags & 1) skid.wheels(r.name + r.team, r.x, track.samples[ri].y, r.z, r.h); else skid.lift(r.name + r.team);
      if (race.finished ? (r.done && r.place < (race.myResult ? race.myResult.place : 99)) : (r.done || r.p > myP)) ahead++;
    }

    // HUD
    if (tick % 3 === 0) {
      setT($('hPos'), ahead + 1);
      setT($('hLap'), Math.min(race.laps, Math.max(1, lapsDone + 1)));
      setT($('hTime'), fmtTime(race.time));
      setT($('hSpeed'), Math.round(Math.abs(c.vf) * 5.2));
      $('hGauge').style.width = (c.stock >= 2 ? 100 : c.gauge * 100) + '%';
      setC($('hS1'), 'on', c.stock >= 1); setC($('hS2'), 'on', c.stock >= 2);
      setC($('cNitro'), 'ready', c.stock > 0);
      setC($('hWrong'), 'hidden', !c.wrong);
      drawMini();
    }
    audio.setEngine(c.vf, true);

    // cameras: countdown fly-around -> chase cam (leans into corners, shakes on nitro) -> victory orbit
    const speed = Math.hypot(c.vx, c.vz);
    const velH = speed > 4 ? Math.atan2(c.vx, c.vz) : rhp;
    const want = rhp + wrap(velH - rhp) * 0.55;
    race.camH += wrap(want - race.camH) * Math.min(1, dt * 5.5);
    const dist = portrait ? 9.5 : 7.4, height = portrait ? 4.6 : 3.3;
    const boostK = c.boostT > 0 ? 1 : 0;
    let fovT = (portrait ? 76 : 62) + boostK * 9 + speed * 0.12;
    if (!started) {
      // sweep from a low front three-quarter view round to the driving position during 3-2-1
      const k = Math.min(1, Math.max(0, 1 - (toStart - 500) / 3300)), e = k * k * (3 - 2 * k);
      const a = rhp + (1 - e) * 2.75, d = dist + (1 - e) * 2.5, hgt = 1.1 + e * (height - 1.1);
      camera.position.set(rxp - Math.sin(a) * d, c.y + hgt, rzp - Math.cos(a) * d);
      look.set(rxp + Math.sin(rhp) * 5 * e, c.y + 1.1 + 0.2 * e, rzp + Math.cos(rhp) * 5 * e);
      fovT = (portrait ? 70 : 50) + e * 12;
    } else if (race.finished) {
      race.orbit = (race.orbit ?? 0) + dt * 0.55;
      const a = rhp + Math.PI + race.orbit;
      camera.position.set(rxp - Math.sin(a) * (dist + 1), c.y + 1.6, rzp - Math.cos(a) * (dist + 1));
      look.set(rxp, c.y + 1.0, rzp);
      fovT = portrait ? 66 : 48;
    } else {
      camera.position.set(rxp - Math.sin(race.camH) * dist, c.y + height, rzp - Math.cos(race.camH) * dist);
      look.set(rxp + Math.sin(race.camH) * 5, c.y + 1.3, rzp + Math.cos(race.camH) * 5);
    }
    camera.fov += (fovT - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    focus.set(c.x, c.y, c.z);
  } else {
    if (preview.on && preview.mesh) {
      const a = t * 0.55, p = preview.spot, far = portrait ? 8.2 : 6.4;
      preview.mesh.rotation.y = 0.6;
      camera.fov = portrait ? 62 : 46; camera.updateProjectionMatrix();
      camera.position.set(p.x + Math.sin(a) * far, p.y + 2.3, p.z + Math.cos(a) * far);
      const side = portrait ? 0 : 2.3; // in landscape the panel sits on the right, so frame the kart on the left
      camera.lookAt(p.x + Math.cos(a) * side, p.y + (portrait ? -0.6 : 0.9), p.z - Math.sin(a) * side);
      preview.mesh.userData.animate(0, Math.sin(t * 1.3) * 0.6, 0, false, dt, t);
      focus.copy(p);
    } else {
    // attract mode: alternate a low trackside dolly with a high crane shot
    const shot = Math.floor(t / 9) % 2, i = Math.floor((t * (shot ? 9 : 16)) % N), s = track.samples[i], s2 = track.samples[(i + (shot ? 34 : 22)) % N];
    camera.fov += ((portrait ? 78 : shot ? 56 : 68) - camera.fov) * 0.05; camera.updateProjectionMatrix();
    if (shot) look.set(s.x - s.tx * 12 + s.nx * 3, s.y + 8.5, s.z - s.tz * 12 + s.nz * 3);
    else look.set(s.x + s.nx * (track.half - 2.2), s.y + 1.15, s.z + s.nz * (track.half - 2.2));
    camera.position.lerp(look, attractShot === shot ? 0.06 : 1); attractShot = shot;
    camera.lookAt(s2.x, s2.y + (shot ? 1 : 2.2), s2.z);
    focus.set(s2.x, s2.y, s2.z);
    }
    if (room && room.pub && current === 'sLobby') {
      const left = Math.max(0, Math.ceil((room.startAtLocal - now) / 1000));
      $('lbInfo').textContent = `Starting in ${left}s · ${room.players.length}/${cfg.roomSize} karts`;
    }
  }
  skid.update(dt); items.update(t);
  world.update(focus);
  if (bloomOn) composer.render(); else renderer.render(scene, camera);

  // adaptive quality: drop resolution, then shadows, if the phone can't keep up
  frames++; fpsT += dt;
  if (fpsT >= 2) {
    const fps = frames / fpsT; frames = 0; fpsT = 0;
    if (fps < 40 && ++lowCount >= 2) {
      lowCount = 0;
      if (bloomOn) bloomOn = false;
      else if (pixelRatio > 0.8) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
      else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; world.sun.castShadow = false; }
      else if (!audio.musicOff) { audio.stopMusic(); $('btnMute').classList.add('nomusic'); } // last resort on a struggling phone: free the CPU the music uses
    } else if (fps >= 40) lowCount = 0;
  }
}

net.connect();
if (me.name && me.team) { renderHome(); show('sHome'); } else openProfile();
if (qs.get('room') && me.name && me.team) {
  const iv = setInterval(() => { if (net.ready && me.id) { clearInterval(iv); net.send({ t: 'join', code: qs.get('room') }); } }, 200);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.setEngine(0, false); });
frame();
if (cfg.testHooks) window.__game = { get race() { return race; }, inp, track, me }; // automated tests only (server started with TEST_HOOKS=1)

if (!isTouch) document.body.classList.add('kbd');
$('btnPortrait').onclick = () => document.body.classList.add('allow-portrait');
