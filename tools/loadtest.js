// Usage: node tools/loadtest.js [players=400] [url=ws://localhost:3000] [seconds=90]
// Simulated phones: join quick-play rooms, drive with real button inputs (60/s), finish, re-queue.
// timeMismatches must be 0: it counts finishes where the bot's own simulation disagreed with the server's.
const WebSocket = require('ws');
const fs = require('fs'), path = require('path');
const N = Number(process.argv[2] || 400), URL_ = process.argv[3] || 'ws://localhost:3000', SECS = Number(process.argv[4] || 90);
const TEAMS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];
const NAMES = ['Alex', 'Binh', 'Chau', 'Dung', 'Emma', 'Giang', 'Hoa', 'Khoa', 'Linh', 'Minh', 'Nhi', 'Oanh', 'Phuc', 'Quan', 'Son', 'Thao', 'Uyen', 'Vy'];
let open = 0, closed = 0, msgsIn = 0, bytesIn = 0, finishes = 0, errors = 0, mismatches = 0; const times = [];
(async () => {
  const { buildTrack } = await import('../src/track-core.js');
  const sim = await import('../src/physics.js');
  const cfg = await (await fetch(URL_.replace(/^ws/, 'http') + '/api/config')).json();
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'maps', cfg.map + '.json')));
  const track = buildTrack(map), pads = sim.padIndices(track, map);
  const bot = i => {
    const ws = new WebSocket(URL_);
    const pid = 'loadtest-bot-' + String(i).padStart(6, '0');
    const look = 7 + Math.floor(Math.random() * 6), sloppy = Math.random() * 0.12; // driving skill varies per bot
    let timer = null, myId = 0, car = null;
    ws.on('open', () => { open++; ws.send(JSON.stringify({ t: 'hello', pid, name: NAMES[i % NAMES.length] + ' ' + i, team: TEAMS[i % TEAMS.length] })); setTimeout(() => ws.send(JSON.stringify({ t: 'quick' })), Math.random() * 8000); });
    ws.on('message', raw => {
      msgsIn++; bytesIn += raw.length;
      const m = JSON.parse(raw);
      if (m.t === 'welcome') myId = m.id;
      else if (m.t === 'start') {
        const t0 = Date.now() + m.countdown;
        car = sim.createCar(track, m.players.find(p => p.id === myId).slot, m.grid[myId]);
        clearInterval(timer);
        timer = setInterval(() => { // a real (if mediocre) driver: steers at a point ahead on the road, 60 inputs per second
          const due = Math.floor((Date.now() - t0) / sim.TICK_MS);
          while (car.tick < due && car.finishMs === null) {
            const k = car.tick, b = [];
            while (car.tick < due && b.length < 30 && car.finishMs === null) {
              let s = track.samples[(car.idx + look) % track.N];
              // half of the bots dive into the shortcut lanes
              const q = i % 2 ? null : car.sc >= 0 ? track.shortcuts[car.sc] : track.shortcuts.find(q => car.idx > q.from - 22 && car.idx <= q.from + 4);
              if (q) { const along = Math.min((car.x - q.ax) * q.ux + (car.z - q.az) * q.uz + 13, q.len + 8); s = { x: q.ax + q.ux * along, z: q.az + q.uz * along }; }
              let d = Math.atan2(s.x - car.x, s.z - car.z) - car.h; d = Math.atan2(Math.sin(d), Math.cos(d));
              const bits = (d > 0.05 + sloppy ? sim.IN.LEFT : 0) | (d < -0.05 - sloppy ? sim.IN.RIGHT : 0) | (Math.abs(d) > 0.3 ? sim.IN.DRIFT : 0) | (car.stock > 0 ? sim.IN.NITRO : 0);
              sim.stepCar(track, pads, car, bits, m.laps); b.push(bits);
            }
            ws.send(JSON.stringify({ t: 'i', r: m.race, k, b }));
          }
          if (car.finishMs !== null) clearInterval(timer);
        }, 100);
      } else if (m.t === 'finish') { finishes++; times.push((i % 2 ? 'road ' : 'lanes ') + m.time); if (car && m.time !== car.finishMs) mismatches++; }
      else if (m.t === 'err') { errors++; if (errors < 5) console.log('server said:', m.msg); }
      else if (m.t === 'end') { clearInterval(timer); setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'quick' })), 1000 + Math.random() * 3000); }
    });
    ws.on('close', () => { closed++; clearInterval(timer); });
    ws.on('error', () => { errors++; });
    return ws;
  };
  const all = [];
  for (let i = 0; i < N; i++) { all.push(bot(i)); if (i % 25 === 24) await new Promise(r => setTimeout(r, 100)); }
  const t0 = Date.now();
  const iv = setInterval(async () => {
    const st = await (await fetch(URL_.replace(/^ws/, 'http') + '/api/stats')).json().catch(() => ({}));
    console.log(`t=${Math.round((Date.now() - t0) / 1000)}s open=${open} closed=${closed} errors=${errors} finishes=${finishes} in=${(bytesIn / 1024 / 1024).toFixed(1)}MB server=${JSON.stringify(st)}`);
  }, 10000);
  setTimeout(() => { clearInterval(iv); console.log(`RESULT players=${N} connected=${open} dropped=${closed} errors=${errors} finishes=${finishes} timeMismatches=${mismatches}`); const avg = k => { const v = times.filter(x => x.startsWith(k)).map(x => +x.split(' ')[1]); return v.length ? Math.round(v.reduce((a, b) => a + b) / v.length) + ' ms over ' + v.length + ' runs' : 'n/a'; }; console.log('avg finish — main road only:', avg('road'), '| using shortcut lanes:', avg('lanes')); all.forEach(w => w.close()); setTimeout(() => process.exit(0), 500); }, SECS * 1000);
})();
