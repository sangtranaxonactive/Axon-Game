import { buildTrack, fmtTime } from './track-core.js';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = new URLSearchParams(location.search);
const cfg = await (await fetch('/api/config')).json();
// One leaderboard per map. The screen rotates through them (or stays on ?map=<id>).
const tracks = {};
for (const { id } of cfg.maps) tracks[id] = buildTrack(await (await fetch(`/maps/${id}.json`)).json());
const fixed = cfg.maps.some(x => x.id === qs.get('map')) ? qs.get('map') : null;
let cur = fixed || cfg.maps[0].id, track = tracks[cur], lastBoard = null;
function showMap(id) { cur = id; track = tracks[id]; layout(); shown.clear(); $('mapName').textContent = (cfg.maps.find(x => x.id === id) || {}).name || id; if (lastBoard) renderBoard(lastBoard, true); }
if (!fixed && cfg.maps.length > 1) setInterval(() => showMap(cfg.maps[(cfg.maps.findIndex(x => x.id === cur) + 1) % cfg.maps.length].id), Number(qs.get('rotate')) * 1000 || 14000);
const teamColor = Object.fromEntries(cfg.teams.map(t => [t.id, t.color]));
$('title').textContent = cfg.eventName; $('prize').textContent = cfg.prize || ''; document.title = cfg.eventName + ' — Big Screen';
$('teamRule').textContent = `· average of each team's ${cfg.teamTopN} best times`;
// ?url=... lets the host show a short link / the public address instead of the current one
const joinUrl = qs.get('url') || location.origin + '/';
$('qr').src = '/api/qr.svg?u=' + encodeURIComponent(joinUrl);
$('url').textContent = joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
const ROWS = Number(qs.get('rows')) || 10;

function renderBoard(all, quiet) {
  lastBoard = all;
  const m = { ...(all.maps[cur] || { top: [], total: 0, teams: [] }), recent: all.recent, record: quiet ? null : all.record };
  $('sTotal').textContent = m.total;
  const prev = quiet ? new Map() : new Map([...$('top').children].map((li, i) => [li.dataset.k, i]));
  $('top').innerHTML = m.top.slice(0, ROWS).map((e, i) => {
    const k = e.name + '|' + e.team + '|' + e.best;
    return `<li data-k="${esc(k)}" class="${prev.size && !prev.has(k) ? 'flash' : ''}"><span class="n">${i + 1}</span><i style="background:${esc(teamColor[e.team] || '#888')}"></i><span class="nm">${esc(e.name)}</span><span class="tm">${fmtTime(e.best)}</span></li>`;
  }).join('') || '<div class="empty">No finishers yet.<br>Scan the QR code and set the first record!</div>';
  setTimeout(() => document.querySelectorAll('li.flash').forEach(li => li.classList.remove('flash')), 2500);
  $('teams').innerHTML = m.teams.map((t, i) => `<li><span class="n">${i + 1}</span><i style="background:${esc(t.color)}"></i><span class="nm">${esc(t.name)} <span class="sm">${t.counted}/${cfg.teamTopN} counted · ${t.members} racers</span></span><span class="tm">${t.avg != null ? fmtTime(t.avg) : '—'}</span></li>`).join('');
  $('feed').innerHTML = m.recent.slice(0, 6).map(r => `<li><i style="background:${esc(teamColor[r.team] || '#888')}"></i><span class="nm">${esc(r.name)} ${r.record ? '🏆' : r.pb ? '★' : ''}</span><span class="tm">${fmtTime(r.time)}</span></li>`).join('') || '<div class="empty">Waiting for racers…</div>';
  if (m.record) {
    $('rWho').textContent = m.record.name; $('rTime').textContent = fmtTime(m.record.time); $('rMap').textContent = ((cfg.maps.find(x => x.id === m.record.map) || {}).name || '').toUpperCase();
    $('record').classList.add('on'); setTimeout(() => $('record').classList.remove('on'), 6000);
  }
}

// live minimap
const cv = $('map'), g = cv.getContext('2d');
let cars = [], shown = new Map(), fit = null;
function layout() {
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  cv.width = Math.max(10, r.width * dpr); cv.height = Math.max(10, r.height * dpr);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of track.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const pad = 26 * dpr, sc = Math.min((cv.width - pad * 2) / (maxX - minX), (cv.height - pad * 2) / (maxZ - minZ));
  const ox = (cv.width - (maxX - minX) * sc) / 2, oz = (cv.height - (maxZ - minZ) * sc) / 2;
  fit = { x: x => cv.width - (ox + (x - minX) * sc), z: z => oz + (z - minZ) * sc, sc, dpr };
}
addEventListener('resize', layout); layout(); showMap(cur);
function draw() {
  requestAnimationFrame(draw);
  g.clearRect(0, 0, cv.width, cv.height);
  g.lineJoin = g.lineCap = 'round';
  const path = () => { g.beginPath(); track.samples.forEach((s, i) => i ? g.lineTo(fit.x(s.x), fit.z(s.z)) : g.moveTo(fit.x(s.x), fit.z(s.z))); g.closePath(); };
  path(); g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = track.width * fit.sc + 6 * fit.dpr; g.stroke();
  path(); g.strokeStyle = '#0a4f94'; g.lineWidth = track.width * fit.sc; g.stroke();
  g.strokeStyle = '#35c8f5'; g.lineWidth = 2.5 * fit.dpr; g.setLineDash([6 * fit.dpr, 5 * fit.dpr]);
  for (const q of track.shortcuts) { g.beginPath(); g.moveTo(fit.x(q.ax), fit.z(q.az)); g.lineTo(fit.x(q.bx), fit.z(q.bz)); g.stroke(); }
  g.setLineDash([]);
  const s0 = track.samples[0]; g.fillStyle = '#35c8f5'; g.beginPath(); g.arc(fit.x(s0.x), fit.z(s0.z), 5 * fit.dpr, 0, 7); g.fill();
  const seen = new Set();
  for (const [id, x, z, team, mi] of cars) {
    if (cfg.maps[mi] && cfg.maps[mi].id !== cur) continue;
    seen.add(id);
    let p = shown.get(id); if (!p) shown.set(id, p = { x, z });
    p.x += (x - p.x) * 0.15; p.z += (z - p.z) * 0.15;
    g.fillStyle = teamColor[team] || '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5 * fit.dpr;
    g.beginPath(); g.arc(fit.x(p.x), fit.z(p.z), 5.5 * fit.dpr, 0, 7); g.fill(); g.stroke();
  }
  for (const id of shown.keys()) if (!seen.has(id)) shown.delete(id);
}
draw();

function connect() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { $('off').style.display = 'none'; ws.send(JSON.stringify({ t: 'screen' })); };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'board') renderBoard(m);
    else if (m.t === 'live') { cars = m.cars; $('sOnline').textContent = m.online; $('sRacing').textContent = m.racing; }
  };
  ws.onclose = () => { $('off').style.display = 'block'; setTimeout(connect, 1500); };
}
connect();
