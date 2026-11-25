// Regression: private room raced twice in a row (stale packets must not void race 2) + team lock after first finish.
const WebSocket = require('ws'), fs = require('fs'), path = require('path');
const URL_ = process.argv[2] || 'ws://localhost:3000';
(async () => {
  const { buildTrack } = await import('../src/track-core.js'); const sim = await import('../src/physics.js');
  const cfg = await (await fetch(URL_.replace(/^ws/, 'http') + '/api/config')).json();
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'maps', cfg.map + '.json')));
  const track = buildTrack(map), pads = sim.padIndices(track, map);
  const ws = new WebSocket(URL_); let id, finishes = 0, errs = [], races = 0, lastRace = 0, timer;
  const send = o => ws.send(JSON.stringify(o));
  ws.on('open', () => send({ t: 'hello', pid: 'roomtest-' + Date.now() + '-abcdef', name: 'RoomTest', team: 'blue' }));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome' && !id) { id = m.id; send({ t: 'create' }); }
    else if (m.t === 'welcome') { console.log(m.team === 'blue' ? 'PASS  team stays locked after a recorded finish' : 'FAIL  team changed to ' + m.team); console.log(finishes === 2 && !errs.length ? 'PASS  two consecutive private-room races both counted' : `FAIL  finishes=${finishes} errs=${errs}`); process.exit(finishes === 2 && !errs.length && m.team === 'blue' ? 0 : 1); }
    else if (m.t === 'room' && m.state === 'lobby' && races < 2 && races === finishes) { races++; send({ t: 'go' }); }
    else if (m.t === 'start') {
      lastRace = m.race; const t0 = Date.now() + m.countdown, car = sim.createCar(track, 0, m.grid[id]);
      timer = setInterval(() => {
        const due = Math.floor((Date.now() - t0) / sim.TICK_MS), k = car.tick, b = [];
        while (car.tick < due && b.length < 30 && car.finishMs === null) {
          const s = track.samples[(car.idx + 9) % track.N]; let d = Math.atan2(s.x - car.x, s.z - car.z) - car.h; d = Math.atan2(Math.sin(d), Math.cos(d));
          const bits = (d > 0.05 ? 1 : 0) | (d < -0.05 ? 2 : 0) | (Math.abs(d) > 0.3 ? 4 : 0) | (car.stock ? 16 : 0); sim.stepCar(track, pads, car, bits, m.laps); b.push(bits);
        }
        if (b.length) send({ t: 'i', r: m.race, k, b }); if (car.finishMs !== null) clearInterval(timer);
      }, 100);
    } else if (m.t === 'finish') finishes++;
    else if (m.t === 'err') errs.push(m.msg);
    else if (m.t === 'end') { send({ t: 'i', r: lastRace, k: 99999, b: [0, 0] }); if (finishes === 2) setTimeout(() => send({ t: 'hello', pid: 'x', name: 'RoomTest', team: 'red' }), 500); }
  });
})();
