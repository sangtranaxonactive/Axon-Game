// YEP Racing server — static files + WebSocket rooms + leaderboard.
// Single Node process; comfortably handles 500+ concurrent players (see tools/loadtest.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');
const PORT = Number(process.env.PORT) || 3000;

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
if (process.env.ADMIN_KEY) config.adminKey = process.env.ADMIN_KEY;
if (!config.adminKey || config.adminKey === 'change-me') {
  config.adminKey = require('crypto').randomBytes(9).toString('base64url');
  console.log('[admin] adminKey not set -> temporary key for this run:', config.adminKey);
}
process.on('uncaughtException', e => console.error('[uncaught]', e));
process.on('unhandledRejection', e => console.error('[unhandled]', e));
if (process.env.MAP) config.map = process.env.MAP;
const teamIds = new Set(config.teams.map(t => t.id));
const publicConfig = () => ({
  eventName: config.eventName, subtitle: config.subtitle, prize: config.prize,
  map: config.map, laps: config.laps, teams: config.teams, roomSize: config.roomSize, teamTopN: config.teamTopN,
  testHooks: process.env.TEST_HOOKS === '1' || undefined,
  company: typeof config.company === 'string' ? config.company.slice(0, 40) : undefined,
  values: Array.isArray(config.values) ? config.values.slice(0, 6).map(v => String(v).slice(0, 24)) : undefined,
  music: typeof config.music === 'string' && /^\/music\/[\w.-]+$/.test(config.music) ? config.music : undefined,
});

// ---------------------------------------------------------------- leaderboard
fs.mkdirSync(DATA_DIR, { recursive: true });
let board = Object.create(null); // pid -> { name, team, best, races, at }
try { Object.assign(board, JSON.parse(fs.readFileSync(LB_FILE, 'utf8'))); } catch { /* first run */ }
function flushBoard() { try { fs.writeFileSync(LB_FILE, JSON.stringify(board)); } catch (e) { console.error(e); } }
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flushBoard(); process.exit(0); });
let saveTimer = null;
function saveBoard() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(LB_FILE + '.tmp', JSON.stringify(board), err => {
      if (!err) fs.rename(LB_FILE + '.tmp', LB_FILE, () => {});
    });
  }, 1000);
}
let lbCache = null;
function leaderboard() {
  if (lbCache) return lbCache;
  const all = Object.entries(board).filter(([, e]) => e.best != null)
    .map(([, e]) => ({ name: e.name, team: e.team, best: e.best, races: e.races }))
    .sort((a, b) => a.best - b.best);
  const byTeam = {};
  for (const e of all) (byTeam[e.team] ||= []).push(e.best);
  const N = config.teamTopN;
  const teams = config.teams.map(t => {
    const times = (byTeam[t.id] || []).slice(0, N);
    return {
      id: t.id, name: t.name, color: t.color, members: (byTeam[t.id] || []).length, counted: times.length,
      avg: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    };
  }).sort((a, b) => {
    // Teams with a full squad of N rank above incomplete ones, then by average time.
    if ((a.counted >= N) !== (b.counted >= N)) return a.counted >= N ? -1 : 1;
    if (a.avg == null || b.avg == null) return (a.avg == null) - (b.avg == null);
    return a.avg - b.avg;
  });
  lbCache = { top: all.slice(0, 100), total: all.length, teams };
  return lbCache;
}
function rankOf(pid) {
  const e = board[pid];
  if (!e || e.best == null) return null;
  let r = 1;
  for (const k in board) if (board[k].best != null && board[k].best < e.best) r++;
  return r;
}
const recent = []; // latest finishes for the big screen

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
};
const qrCache = new Map();
const gzCache = new Map(); // file -> { mtime, buf }
function sendFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache };
    const compressible = /\.(html|js|json|css|svg|gltf)$/.test(ext);
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      const hit = gzCache.get(file);
      if (hit && hit.mtime === st.mtimeMs) {
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': hit.buf.length });
        return res.end(hit.buf);
      }
      return fs.readFile(file, (e, raw) => {
        if (e) { res.writeHead(500); return res.end(); }
        const buf = zlib.gzipSync(raw);
        gzCache.set(file, { mtime: st.mtimeMs, buf });
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': buf.length });
        res.end(buf);
      });
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}
function json(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => { console.error('[http]', e.message); if (!res.headersSent) res.writeHead(500); res.end(); });
});
async function handle(req, res) {
  let url, p;
  try { url = new URL(req.url, 'http://x'); p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.includes('\0')) { res.writeHead(400); return res.end(); }

  if (p === '/api/config') return json(res, publicConfig());
  if (p === '/api/leaderboard') return json(res, leaderboard());
  if (p === '/api/stats') return json(res, { online: players.size, screens: screens.size, rooms: rooms.size, racing: countRacing() });
  if (p === '/api/qr.svg') {
    const target = url.searchParams.get('u') || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/`;
    const key = target.slice(0, 300);
    let svg = qrCache.get(key);
    if (!svg) {
      if (qrCache.size >= 50) qrCache.clear();
      svg = await QRCode.toString(key, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      qrCache.set(key, svg);
    }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(svg);
  }
  if (p.startsWith('/api/admin/')) {
    if ((req.headers['x-admin-key'] || url.searchParams.get('key')) !== config.adminKey) return json(res, { error: 'forbidden' }, 403);
    if (p === '/api/admin/reset' && req.method === 'POST') {
      fs.writeFileSync(path.join(DATA_DIR, `leaderboard-backup-${Date.now()}.json`), JSON.stringify(board));
      board = Object.create(null); lbCache = null; recent.length = 0; saveBoard(); pushBoard();
      return json(res, { ok: true });
    }
    if (p === '/api/admin/remove' && req.method === 'POST') {
      delete board[url.searchParams.get('pid')]; lbCache = null; saveBoard(); pushBoard();
      return json(res, { ok: true });
    }
    if (p === '/api/admin/export.csv') {
      const teamName = Object.fromEntries(config.teams.map(t => [t.id, t.name]));
      const rows = Object.entries(board).filter(([, e]) => e.best != null).sort((a, b) => a[1].best - b[1].best)
        .map(([pid, e], i) => [i + 1, `"${String(e.name).replace(/"/g, '""')}"`, `"${teamName[e.team] || e.team}"`, (e.best / 1000).toFixed(3), e.races, pid].join(','));
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="yep-racing.csv"' });
      return res.end('﻿rank,name,team,best_seconds,races,pid\n' + rows.join('\n'));
    }
    return json(res, { error: 'not found' }, 404);
  }

  if (p.startsWith('/vendor/font/')) {
    const f = safeJoin(path.join(ROOT, 'node_modules', '@fontsource', 'barlow-condensed', 'files'), p.slice('/vendor/font/'.length));
    if (!f) { res.writeHead(403); return res.end(); }
    return sendFile(req, res, f, 'public, max-age=604800, immutable');
  }
  if (p === '/') p = '/index.html';
  if (p === '/editor' || p === '/editor.html' || p === '/dist/editor.js') {
    // organiser tool: needs the admin key (?key=...), which then rides along as a cookie for the script
    const key = url.searchParams.get('key') || decodeURIComponent((/(?:^|; )ek=([^;]+)/.exec(req.headers.cookie || '') || [])[1] || '');
    if (key !== config.adminKey) { res.writeHead(403); return res.end('Admin key required: /editor?key=...'); }
    if (url.searchParams.get('key')) res.setHeader('Set-Cookie', `ek=${encodeURIComponent(key)}; Path=/; HttpOnly; SameSite=Strict`);
  }
  if (['/screen', '/editor', '/admin'].includes(p)) p += '.html';
  if (p.endsWith('.map')) { res.writeHead(404); return res.end(); }
  const f = safeJoin(PUB, p);
  if (!f) { res.writeHead(403); return res.end(); }
  sendFile(req, res, f, /\.(glb|png|jpg|webp|mp3)$/.test(f) ? 'public, max-age=86400' : 'no-cache');
}

// ---------------------------------------------------------------- game state
const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false });
const players = new Map(); // ws -> player
const screens = new Set();
const rooms = new Map();   // code -> room
let nextId = 1;

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj) {
  const s = JSON.stringify(obj);
  for (const pl of room.players) if (pl.ws.readyState === 1) pl.ws.send(s);
}
function countRacing() { let n = 0; for (const r of rooms.values()) if (r.state === 'racing' || r.state === 'countdown') n += r.players.length; return n; }
// Cosmetic look [character, characterColour, kartColour] — never used by the simulation.
function cleanLook(l) {
  const ok = (v, max) => Number.isInteger(v) && v >= 0 && v < max ? v : 0;
  return Array.isArray(l) ? [ok(l[0], 8), ok(l[1], 10), ok(l[2], 10)] : [0, 0, 0];
}
function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Racer';
}
function roomInfo(room) {
  return {
    t: 'room', code: room.code, pub: room.pub, state: room.state, host: room.host ? room.host.id : null,
    startsIn: room.autoAt ? Math.max(0, room.autoAt - Date.now()) : null,
    players: room.players.map(p => ({ id: p.id, name: p.name, team: p.team, slot: p.slot, look: p.look })),
  };
}
function newRoom(pub) {
  if (rooms.size >= 2000) return null;
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  const room = { code, pub, state: 'lobby', players: [], host: null, autoAt: null, timers: [] };
  rooms.set(code, room);
  return room;
}
function joinRoom(pl, room) {
  if (pl.room === room) return send(pl.ws, roomInfo(room));
  leaveRoom(pl);
  const used = new Set(room.players.map(p => p.slot));
  let slot = 0; while (used.has(slot)) slot++;
  pl.slot = slot; pl.room = room;
  room.players.push(pl);
  if (!room.host) room.host = pl;
  if (room.pub && !room.autoAt) {
    room.autoAt = Date.now() + config.publicWaitMs;
    room.timers.push(setTimeout(() => startRace(room), config.publicWaitMs));
  }
  broadcast(room, roomInfo(room));
  if (room.pub && room.players.length >= config.roomSize) startRace(room);
}
function leaveRoom(pl) {
  const room = pl.room;
  if (!room) return;
  pl.room = null;
  room.players = room.players.filter(p => p !== pl);
  if (!room.players.length) { room.timers.forEach(clearTimeout); rooms.delete(room.code); return; }
  if (room.host === pl) room.host = room.players[0];
  broadcast(room, roomInfo(room));
  if (room.state === 'racing') checkRaceEnd(room);
}
function startRace(room) {
  if (room.state !== 'lobby' || !room.players.length) return;
  room.timers.forEach(clearTimeout); room.timers = [];
  room.state = 'countdown';
  room.autoAt = null;
  const COUNT = 4000;
  room.startAt = Date.now() + COUNT;
  room.results = [];
  room.raceId = (room.raceId || 0) + 1;
  const grid = {};
  for (const p of room.players) {
    const h = sim.gridPlace(track, p.slot).heading;
    p.car = sim.createCar(track, p.slot, h); p.finished = false; grid[p.id] = h;
  }
  broadcast(room, { ...roomInfo(room), t: 'start', countdown: COUNT, laps: config.laps, grid, race: room.raceId });
  room.timers.push(setTimeout(() => { room.state = 'racing'; }, COUNT));
  room.timers.push(setTimeout(() => endRace(room), COUNT + 6 * 60000)); // hard cap
}
function checkRaceEnd(room) {
  if (room.state !== 'racing') return;
  if (room.players.every(p => p.finished)) return endRace(room);
  if (room.results.length === 1 && !room.graceSet) {
    room.graceSet = true;
    broadcast(room, { t: 'grace', ms: 45000 });
    room.timers.push(setTimeout(() => endRace(room), 45000));
  }
}
function endRace(room) {
  if (room.state !== 'racing' && room.state !== 'countdown') return;
  room.timers.forEach(clearTimeout); room.timers = [];
  room.graceSet = false;
  const dnf = room.players.filter(p => !p.finished).map(p => ({ id: p.id, name: p.name, team: p.team, time: null }));
  broadcast(room, { t: 'end', results: [...room.results, ...dnf] });
  if (room.pub) {
    // Public rooms are single-use: players re-queue from the results screen.
    for (const p of room.players) p.room = null;
    rooms.delete(room.code);
  } else {
    room.state = 'lobby';
    broadcast(room, roomInfo(room));
  }
}
const MAX_TICKS = 6 * 60 * 60 + 600;
function desync(pl, why) {
  pl.car = null;
  send(pl.ws, { t: 'err', msg: 'Out of sync with the server — this run will not count (' + why + ')' });
}
// The only way to move a kart: send button states, one per 1/60 s tick. The server drives the kart itself.
function onInput(pl, m) {
  const room = pl.room, car = pl.car;
  if (!room || !car || (room.state !== 'racing' && room.state !== 'countdown')) return;
  if (m.r !== room.raceId) return; // late packet from a previous race in this room
  const b = m.b;
  if (!Array.isArray(b) || b.length < 1 || b.length > 40) return desync(pl, 'bad packet');
  if (m.k !== car.tick) return desync(pl, 'tick gap');
  // Inputs may never run ahead of real time (no fast-forwarding).
  if (car.tick + b.length > (Date.now() - room.startAt) / sim.TICK_MS + 20 || car.tick > MAX_TICKS) return desync(pl, 'clock');
  for (let i = 0; i < b.length; i++) if (!Number.isInteger(b[i]) || b[i] < 0 || b[i] > 31) return desync(pl, 'bad input');
  for (let i = 0; i < b.length; i++) sim.stepCar(track, pads, car, b[i], config.laps);
  if (car.finishMs !== null && !pl.finished) onFinish(pl);
}
function onFinish(pl) {
  const room = pl.room, now = Date.now();
  // Official time = simulated time. Running the simulation slower than real time (slow motion) is capped.
  const wall = now - room.startAt;
  const time = Math.round(Math.max(pl.car.finishMs, wall - 1500));
  pl.finished = true;
  pl.finished = true;
  const entry = board[pl.pid] || (board[pl.pid] = { name: pl.name, team: pl.team, best: null, races: 0 });
  entry.name = pl.name; entry.team = pl.team; entry.races++; entry.at = now;
  const prevTop = leaderboard().top[0];
  const pb = entry.best == null || time < entry.best;
  if (pb) entry.best = time;
  lbCache = null; saveBoard();
  const res = { id: pl.id, name: pl.name, team: pl.team, time };
  room.results.push(res);
  const record = pb && (!prevTop || time < prevTop.best);
  send(pl.ws, { t: 'finish', time, place: room.results.length, pb, best: entry.best, rank: rankOf(pl.pid), record });
  broadcast(room, { t: 'done', id: pl.id, time, place: room.results.length });
  recent.unshift({ name: pl.name, team: pl.team, time, pb, record, at: now });
  recent.length = Math.min(recent.length, 12);
  pushBoard(record ? res : null);
  checkRaceEnd(room);
}

let boardDirty = false, pendingRecord = null;
function pushBoard(record) { boardDirty = true; if (record) pendingRecord = record; }
setInterval(() => {
  if (!boardDirty || !screens.size) { boardDirty = false; return; }
  boardDirty = false;
  const s = JSON.stringify({ t: 'board', ...leaderboard(), recent, record: pendingRecord });
  pendingRecord = null;
  for (const ws of screens) if (ws.readyState === 1) ws.send(s);
}, 1000);

wss.on('connection', ws => {
  if (wss.clients.size > (config.maxConnections || 1500)) return ws.terminate();
  ws.alive = true; ws.msgs = 0;
  ws.helloTimer = setTimeout(() => ws.terminate(), 15000); // must identify as player or screen
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    if (++ws.msgs > 60) return ws.terminate(); // > 60 messages per second: not a real client
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const pl = players.get(ws);
    if (m.t === 'screen') {
      if (pl || screens.has(ws) || screens.size >= 30) return;
      screens.add(ws); clearTimeout(ws.helloTimer);
      return send(ws, { t: 'board', ...leaderboard(), recent, record: null });
    }
    if (m.t === 'hello') {
      if (pl) { if (!pl.room) { pl.name = cleanName(m.name); pl.look = cleanLook(m.look); if (teamIds.has(m.team) && !board[pl.pid]) pl.team = m.team; } return send(ws, { t: 'welcome', id: pl.id, team: pl.team, best: board[pl.pid] ? board[pl.pid].best : null, rank: rankOf(pl.pid) }); }
      const pid = String(m.pid || '');
      if (!/^[A-Za-z0-9-]{16,40}$/.test(pid)) return ws.close();
      if (screens.has(ws)) return;
      const e = board[pid];
      // A racer's team is fixed by their first recorded finish (no hopping to carry a time to another team).
      const team = e && teamIds.has(e.team) ? e.team : teamIds.has(m.team) ? m.team : config.teams[0].id;
      const np = { ws, id: nextId++, pid, name: cleanName(m.name), look: cleanLook(m.look), team, room: null, car: null };
      players.set(ws, np); clearTimeout(ws.helloTimer);
      return send(ws, { t: 'welcome', id: np.id, team, best: e ? e.best : null, rank: rankOf(pid) });
    }
    if (!pl) return;
    switch (m.t) {
      case 'i': onInput(pl, m); break;
      case 'quick': {
        let room = null;
        for (const r of rooms.values()) if (r.pub && r.state === 'lobby' && r.players.length < config.roomSize) { room = r; break; }
        room = room || newRoom(true);
        if (room) joinRoom(pl, room); else send(ws, { t: 'err', msg: 'Server is full — try again in a moment' });
        break;
      }
      case 'create': { const room = newRoom(false); if (room) joinRoom(pl, room); else send(ws, { t: 'err', msg: 'Server is full — try again in a moment' }); break; }
      case 'join': {
        const room = rooms.get(String(m.code));
        if (!room || room.pub) return send(ws, { t: 'err', msg: 'Room not found: ' + String(m.code).slice(0, 6) });
        if (room.state !== 'lobby') return send(ws, { t: 'err', msg: 'That room is mid-race — try again after it ends' });
        if (room.players.length >= config.roomSize) return send(ws, { t: 'err', msg: 'Room is full' });
        joinRoom(pl, room);
        break;
      }
      case 'go': if (pl.room && !pl.room.pub && pl.room.host === pl) startRace(pl.room); break;
      case 'leave': leaveRoom(pl); break;
    }
  });
  ws.on('close', () => {
    clearTimeout(ws.helloTimer);
    screens.delete(ws);
    const pl = players.get(ws);
    if (pl) { leaveRoom(pl); players.delete(ws); }
  });
  ws.on('error', () => {});
});

// Relay positions inside each room at 12 Hz.
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.state === 'lobby' || room.players.length < 2) continue;
    const ps = [];
    for (const p of room.players) {
      const c = p.car; if (!c) continue;
      ps.push([p.id, Math.round(c.x * 100) / 100, Math.round(c.z * 100) / 100, Math.round(c.h * 1000) / 1000, Math.round(c.prog / track.N * 10000) / 10000, (c.drift ? 1 : 0) | (c.boostT > 0 ? 2 : 0)]);
    }
    if (!ps.length) continue;
    const s = JSON.stringify({ t: 'S', ps });
    for (const p of room.players) if (p.ws.readyState === 1 && p.ws.bufferedAmount < 65536) p.ws.send(s);
  }
}, 83);

// Big screens get every racer on track at 5 Hz + online counters.
setInterval(() => {
  if (!screens.size) return;
  const cars = [];
  for (const room of rooms.values()) {
    if (room.state === 'lobby') continue;
    for (const p of room.players) if (p.car && !p.finished) cars.push([p.id, Math.round(p.car.x), Math.round(p.car.z), p.team]);
  }
  const s = JSON.stringify({ t: 'live', cars, online: players.size, racing: countRacing() });
  for (const ws of screens) if (ws.readyState === 1 && ws.bufferedAmount < 262144) ws.send(s);
}, 200);

setInterval(() => { for (const ws of wss.clients) ws.msgs = 0; }, 1000);

// Drop dead connections.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 20000);

// Load the shared simulation + the track, then start listening.
let sim, track, pads;
(async () => {
  sim = await import('./src/physics.js');
  const { buildTrack } = await import('./src/track-core.js');
  const map = JSON.parse(fs.readFileSync(path.join(PUB, 'maps', config.map + '.json'), 'utf8'));
  track = buildTrack(map); pads = sim.padIndices(track, map);
  await require('./tools/build.js'); // browser bundle is always rebuilt from the same sources the server simulates with
  server.listen(PORT, () => console.log(`YEP Racing: http://localhost:${PORT}  |  big screen: /screen  |  map: ${config.map} (${Math.round(track.length)} m)`));
})().catch(e => { console.error('Startup failed:', e); process.exit(1); });
