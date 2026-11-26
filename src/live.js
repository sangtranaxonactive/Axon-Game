// Commentator / organiser view. A different page, bundle and server channel from the racers' game:
// it needs the host code, only ever receives data (it cannot drive or use items), and racers cannot open it from a race.
import * as THREE from 'three';
import { fmtTime } from './track-core.js';
import { gridPlace } from './physics.js';
import { createStage } from './stage.js';
import { makeCar } from './car.js';
import { COLORS } from './looks.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cfg = await (await fetch('/api/config')).json();
let track, N, world, items, minX, maxX, minZ, maxZ;
const mapNames = Object.fromEntries(cfg.maps.map(x => [x.id, x.name]));
const teamColor = Object.fromEntries(cfg.teams.map(t => [t.id, t.color]));
$('evName').textContent = cfg.eventName; document.title = cfg.eventName + ' — Live';

const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2500);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const stage = createStage(scene, renderer, cfg);
function use(s) {
  ({ track, world, items } = s); N = track.N;
  minX = Infinity; maxX = -Infinity; minZ = Infinity; maxZ = -Infinity;
  for (const p of track.samples) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
}
use(await stage.load(cfg.map));
$('loading').remove();

// ---------------------------------------------------------------- screens
const panels = ['sCode', 'sRooms', 'sWait', 'sEnd'];
function show(id) { for (const p of panels) $(p).classList.toggle('hidden', p !== id); $('view').classList.toggle('hidden', id !== null); }
let toastT; const toast = m => { $('toast').textContent = m; $('toast').classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => $('toast').classList.add('hidden'), 3000); };

// ---------------------------------------------------------------- network (receive-only)
let ws, code = sessionStorage.getItem('hostCode') || '', watching = false, roomCode = null, listTimer = null;
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { if (code) ws.send(JSON.stringify({ t: 'watch', code })); };
  ws.onmessage = e => onMessage(JSON.parse(e.data));
  ws.onclose = () => { watching = false; setTimeout(connect, 1500); };
}
const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
$('inCode').value = code;
$('btnWatch').onclick = () => { code = $('inCode').value.trim(); if (code) send({ t: 'watch', code }); };
$('inCode').onkeydown = e => { if (e.key === 'Enter') $('btnWatch').click(); };
function openRooms() { roomCode = null; clearCars(); show('sRooms'); send({ t: 'rooms' }); clearInterval(listTimer); listTimer = setInterval(() => { if (!roomCode) send({ t: 'rooms' }); }, 2000); }
$('bRooms').onclick = $('btnBackRooms').onclick = $('btnEndRooms').onclick = openRooms;
function renderRooms(list) {
  const label = { lobby: 'WAITING', countdown: 'STARTING', racing: 'RACING' };
  $('roomList').innerHTML = list.map(r => `<button data-c="${esc(r.code)}"><span class="st">${label[r.state] || ''}</span><b>${r.pub ? 'QUICK' : esc(r.code)}</b>${esc(mapNames[r.map] || '')} — ${r.names.map(esc).join(', ') || 'empty'}</button>`).join('')
    || '<p class="sub">No races right now. Waiting for racers…</p>';
}
$('roomList').onclick = e => { const b = e.target.closest('button'); if (b) { roomCode = b.dataset.c; send({ t: 'spec', room: roomCode }); } };

// ---------------------------------------------------------------- race state
let race = null; const cars = new Map();
function clearCars() { for (const c of cars.values()) scene.remove(c.mesh); cars.clear(); race = null; $('board').innerHTML = ''; $('big').textContent = ''; }
async function startRace(m) {
  clearCars();
  const t0 = performance.now();
  use(await stage.load(m.map)); // each room has its own map
  for (const p of m.players) {
    const g = gridPlace(track, p.slot), h = m.grid[p.id] ?? g.heading;
    const mesh = makeCar(COLORS[p.look?.[2]] || COLORS[0], p.name, { char: p.look?.[0] | 0, charColor: COLORS[p.look?.[1]] || COLORS[0], tag: teamColor[p.team] });
    mesh.traverse(o => { if (o.isSprite) { o.scale.multiplyScalar(1.7); o.position.y = 3.6; } }); // names readable from the air
    scene.add(mesh);
    cars.set(p.id, { id: p.id, name: p.name, team: p.team, mesh, x: g.x, z: g.z, h, tx: g.x, tz: g.z, th: h, sx: g.x, sz: g.z, vx: 0, vz: 0, at: 0, p: g.lapIdx / N, flags: 0, px: g.x, pz: g.z, place: 0 });
  }
  race = { ended: false, startAt: t0 + m.countdown - (m.elapsed || 0), laps: m.laps, last: 9, places: 0, code: m.code, pub: m.pub };
  for (const [id, time] of m.done || []) { const c = cars.get(id); if (c) { c.place = ++race.places; c.time = time; } }
  items.reset(m.boxes, m.bananas);
  $('roomTag').textContent = (m.pub ? 'QUICK RACE' : 'ROOM ' + m.code) + ' · ' + (mapNames[m.map] || '').toUpperCase();
  if (!cars.has(follow)) follow = m.players[0]?.id ?? null;
  show(null); renderBoard(true);
}
function onMessage(m) {
  switch (m.t) {
    case 'err': toast(m.msg); break;
    case 'watching': watching = true; sessionStorage.setItem('hostCode', code); if (roomCode) send({ t: 'spec', room: roomCode }); else { renderRooms(m.rooms); openRooms(); } break;
    case 'rooms': renderRooms(m.rooms); break;
    case 'room': if (m.state === 'lobby' && roomCode) { clearCars(); stage.load(m.map).then(use); $('waitTitle').textContent = (m.pub ? 'QUICK RACE' : 'ROOM ' + m.code) + ' — WAITING'; $('waitList').innerHTML = m.players.map(p => `<li><i style="background:${esc(teamColor[p.team] || '#888')}"></i>${esc(p.name)}</li>`).join(''); show('sWait'); } break;
    case 'start': startRace(m); break;
    case 'S': { const nowT = performance.now(); for (const s of m.ps) { const c = cars.get(s[0]); if (!c) continue; const el = (nowT - (c.at || nowT)) / 1000; if (el > 0.02 && el < 0.8) { c.vx = (s[1] - c.sx) / el; c.vz = (s[2] - c.sz) / el; } c.sx = c.tx = s[1]; c.sz = c.tz = s[2]; c.at = nowT; c.th = s[3]; c.p = s[4]; c.flags = s[5]; } break; }
    case 'done': { const c = cars.get(m.id); if (c && race) { c.place = m.place; c.time = m.time; } break; }
    case 'box': items.takeBox(m.i, m.ms, m.bomb); break;
    case 'ban': if (m.add) items.addBanana(m.add[0], m.add[1], m.add[2]); else items.delBanana(m.del); break;
    case 'end': if (race) { $('endList').innerHTML = m.results.map((r, i) => `<li><span class="n">${r.time != null ? i + 1 : '–'}</span><i style="background:${esc(teamColor[r.team] || '#888')}"></i><span class="nm">${esc(r.name)}</span><span class="tm">${r.time != null ? fmtTime(r.time) : 'DNF'}</span></li>`).join(''); race.ended = true; $('sEnd').classList.remove('hidden'); } break;
    case 'gone': if (roomCode && !(race && race.ended)) openRooms(); break; // after a finish, keep the results up until the commentator moves on
  }
}

// ---------------------------------------------------------------- leaderboard + camera controls
let follow = null, mode = 'chase', auto = false, yaw = 0, pitch = 0, zoom = 1, order = [];
function ranking() { return [...cars.values()].sort((a, b) => (a.place || 99) - (b.place || 99) || b.p - a.p); }
let boardKey = '';
function renderBoard(force) {
  order = ranking();
  const key = order.map(c => c.id + ':' + Math.floor(c.p) + ':' + c.place).join('|') + '#' + follow;
  if (key === boardKey && !force) return; boardKey = key;
  $('board').innerHTML = order.map((c, i) => `<button data-id="${c.id}" class="${c.id === follow ? 'on' : ''}"><span class="n">${i + 1}</span><i style="background:${esc(teamColor[c.team] || '#888')}"></i><span class="nm">${esc(c.name)}</span><span class="lp">${c.place ? fmtTime(c.time ?? 0) : 'LAP ' + Math.min(race.laps, Math.max(1, Math.floor(c.p) + 1)) + '/' + race.laps}</span></button>`).join('');
}
$('board').onclick = e => { const b = e.target.closest('button'); if (b) { follow = +b.dataset.id; auto = false; $('bAuto').classList.remove('on'); renderBoard(true); } };
$('cam').onclick = e => { const m = e.target.dataset.m; if (!m) return; mode = m; yaw = pitch = 0; zoom = 1; for (const b of $('cam').querySelectorAll('[data-m]')) b.classList.toggle('on', b.dataset.m === m); };
$('bAuto').onclick = () => { auto = !auto; $('bAuto').classList.toggle('on', auto); };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '8') { const c = order[+e.key - 1]; if (c) { follow = c.id; auto = false; $('bAuto').classList.remove('on'); renderBoard(true); } }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = order.findIndex(c => c.id === follow), n = order.length; if (n) { follow = order[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n].id; auto = false; $('bAuto').classList.remove('on'); renderBoard(true); } }
  else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
  else if (e.key === 'a' || e.key === 'A') $('bAuto').click();
});
let drag = null; const gl = $('gl');
gl.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; gl.setPointerCapture(e.pointerId); });
gl.addEventListener('pointermove', e => { if (!drag) return; yaw -= (e.clientX - drag.x) * 0.006; pitch = Math.max(-0.5, Math.min(1.1, pitch + (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; });
gl.addEventListener('pointerup', () => { drag = null; });
gl.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.4, Math.min(4, zoom * (e.deltaY > 0 ? 1.12 : 0.9))); }, { passive: false });
gl.addEventListener('dblclick', () => { yaw = pitch = 0; zoom = 1; });

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock(), look = new THREE.Vector3(), want = new THREE.Vector3(), focus = new THREE.Vector3();
const wrap = a => { a = (a + Math.PI) % (Math.PI * 2); return a < 0 ? a + Math.PI : a - Math.PI; };
let camH = 0, tick = 0; const ST = { spin: -1, air: -1 };
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05), now = performance.now(), t = now / 1000; tick++;
  if (race) {
    for (const c of cars.values()) {
      if (c.at && now - c.at < 600) { c.tx += c.vx * dt; c.tz += c.vz * dt; }
      const k = Math.min(1, dt * 8);
      c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.h += wrap(c.th - c.h) * k;
      const sp = Math.hypot(c.x - c.px, c.z - c.pz) / Math.max(dt, 1e-3); c.px = c.x; c.pz = c.z;
      c.mesh.position.set(c.x, track.samples[((Math.round(c.p * N) % N) + N) % N].y, c.z); c.mesh.rotation.y = c.h;
      c.spinPh = c.flags & 16 ? Math.min(1, (c.spinPh || 0) + dt / 2) : 0; c.airPh = c.flags & 32 ? Math.min(1, (c.airPh || 0) + dt / 2) : 0;
      ST.spin = c.flags & 16 ? c.spinPh : -1; ST.air = c.flags & 32 ? c.airPh : -1;
      c.mesh.userData.animate(sp, 0, c.flags & 1 ? 1 : 0, !!(c.flags & 2), dt, t, 0, ST);
    }
    const toStart = race.startAt - now, n = Math.ceil(toStart / 1000);
    if (toStart > 0) { if (n !== race.last && n <= 3) { race.last = n; $('big').textContent = n; } }
    else if (race.last !== 0) { race.last = 0; $('big').textContent = 'GO!'; setTimeout(() => { $('big').textContent = ''; }, 900); }
    if (!race.ended) $('clock').textContent = fmtTime(Math.max(0, -toStart)).slice(0, -2);
    if (tick % 10 === 0) { renderBoard(); if (auto && order[0] && order[0].id !== follow) { follow = order[0].id; renderBoard(true); } }
    const f = cars.get(follow) || order[0];
    if (f && mode !== 'map') {
      camH += wrap(f.h - camH) * Math.min(1, dt * 3.5);
      // behind and above the racer so the road ahead and the karts around them stay in frame
      const P = { chase: [10, 5.2, 9, 58], high: [22, 17, 14, 55], top: [3, 55, 10, 50], front: [-11, 4, 0, 50] }[mode];
      const a = camH + yaw, d = P[0] * zoom, hgt = Math.max(1.5, P[1] * zoom + pitch * 30);
      const fy = f.mesh.position.y;
      want.set(f.x - Math.sin(a) * d, fy + hgt, f.z - Math.cos(a) * d);
      camera.position.lerp(want, Math.min(1, dt * 6));
      look.set(f.x + Math.sin(camH) * P[2], fy + 1.2, f.z + Math.cos(camH) * P[2]);
      camera.fov += (P[3] - camera.fov) * 0.1; camera.updateProjectionMatrix();
      camera.lookAt(look); focus.set(f.x, 0, f.z);
    }
  }
  if (!race || mode === 'map') { // whole circuit from the sky (also the idle shot)
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, span = Math.max(maxX - minX, maxZ - minZ), a = (race ? 0 : t * 0.05) + yaw;
    want.set(cx + Math.sin(a) * span * 0.55 * zoom, Math.min(37, span * 0.6) * zoom + pitch * 20, cz + Math.cos(a) * span * 0.55 * zoom);
    camera.position.lerp(want, 0.08); camera.fov = 60; camera.updateProjectionMatrix(); camera.lookAt(cx, 0, cz); focus.set(cx, 0, cz);
  }
  items.update(t); world.update(focus);
  renderer.render(scene, camera);
}
connect(); show('sCode'); frame();
