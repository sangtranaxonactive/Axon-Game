// Security / anti-cheat regression test. Usage: node tools/cheattest.js [http://localhost:3000]
// Every line must say PASS. Run it after any change to server.js or src/physics.js.
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://localhost:3000', WS = BASE.replace(/^http/, 'ws');
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(pid) {
  const ws = new WebSocket(WS), msgs = [];
  ws.on('message', r => msgs.push(JSON.parse(r))); ws.on('error', () => {});
  const send = o => ws.readyState === 1 && ws.send(JSON.stringify(o));
  const wait = async (t, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = msgs.find(x => x.t === t); if (m) return m; await sleep(50); } return null; };
  return new Promise(res => ws.on('open', () => { if (pid) send({ t: 'hello', pid, name: 'Cheater', team: 'red' }); res({ ws, msgs, send, wait }); }));
}
async function startedRace(pid) {
  const c = await client(pid); await c.wait('welcome'); c.send({ t: 'create' }); await c.wait('room'); c.send({ t: 'go' });
  const st = await c.wait('start'); await sleep(st.countdown + 200); c.race = st.race; return c;
}
(async () => {
  // --- HTTP: nothing but the built game is downloadable, and malformed URLs don't crash the server
  for (const [p, want] of [['//', 400], ['/%00', 400], ['/%E0%A4%A', 400], ['/../server.js', 404], ['/..%2f..%2fserver.js', 403], ['/src/physics.js', 404], ['/js/main.js', 404], ['/config.json', 404],
    ['/data/leaderboard.json', 404], ['/dist/game.js.map', 404], ['/editor', 403], ['/dist/editor.js', 403], ['/api/admin/export.csv', 403], ['/api/admin/export.csv?key=change-me', 403], ['/package.json', 404], ['/server.js', 404]]) {
    const r = await fetch(BASE + p).catch(e => ({ status: 'ERR ' + e.message }));
    check(`GET ${p}`, r.status === want || (want === 404 && r.status === 403) || (want === 403 && r.status === 404) || (want === 400 && r.status === 404), `-> ${r.status}`);
  }
  const reset = await fetch(BASE + '/api/admin/reset', { method: 'POST' });
  check('POST admin reset without key', reset.status === 403, `-> ${reset.status}`);
  const lb0 = await (await fetch(BASE + '/api/leaderboard')).text();
  check('leaderboard API leaks no player ids', !/pid/.test(lb0));
  const game = await (await fetch(BASE + '/dist/game.js')).text();
  check('served game code is minified (no readable function names or comments)', !/function stepCar|automated tests only|createCar/.test(game));

  // --- WebSocket identity abuse
  let c = await client(); c.send({ t: 'hello', pid: '__proto__', name: 'x', team: 'red' }); await sleep(400);
  check('pid "__proto__" rejected', c.ws.readyState !== 1);
  c = await client(); c.send({ t: 'hello', pid: 'constructor-prototype-x', name: '<img src=x onerror=alert(1)>', team: 'nope' });
  const w = await c.wait('welcome'); check('hostile name accepted only after sanitising', !!w); c.ws.close();

  // --- old-style "I finished" messages are ignored
  c = await startedRace('cheat-test-fake-lap-000001');
  for (let i = 1; i <= 5; i++) { c.send({ t: 'lap', n: i, time: 1000 }); c.send({ t: 's', s: [0, 0, 0, i, 0] }); }
  await sleep(600); check('fake lap/state messages do not finish a race', !c.msgs.some(m => m.t === 'finish')); c.ws.close();

  // --- fast-forward: sending a whole race of inputs at once
  c = await startedRace('cheat-test-fast-fwd-000001');
  for (let k = 0; k < 300; k += 30) c.send({ t: 'i', r: c.race, k, b: Array(30).fill(0) }); // 5 s of driving sent in one burst
  await sleep(800);
  check('fast-forwarded inputs rejected', c.msgs.some(m => m.t === 'err') && !c.msgs.some(m => m.t === 'finish')); c.ws.close();

  // --- skipping ticks / invalid buttons
  c = await startedRace('cheat-test-tick-gap-0000001'); c.send({ t: 'i', r: c.race, k: 500, b: [0, 0, 0] }); await sleep(300);
  check('tick gap rejected', c.msgs.some(m => m.t === 'err')); c.ws.close();
  c = await startedRace('cheat-test-bad-bits-0000001'); c.send({ t: 'i', r: c.race, k: 0, b: [0, 999, -1, 1.5, 'x'] }); await sleep(300);
  check('invalid button values rejected', c.msgs.some(m => m.t === 'err')); c.ws.close();

  // --- items and the commentator channel
  c = await startedRace('cheat-test-item-spam-00001'); for (let i = 0; i < 20; i++) c.send({ t: 'use' }); c.send({ t: 'ev', k: 5, c: 1 }); await sleep(400);
  check('using items you do not hold does nothing', !c.msgs.some(m => m.t === 'ev' || m.t === 'ban' || m.t === 'fx')); c.ws.close();
  c = await client(); c.send({ t: 'watch', code: 'wrong-code' }); await sleep(300);
  check('live view needs the host code', c.msgs.some(m => m.t === 'err') && !c.msgs.some(m => m.t === 'watching'));
  c.send({ t: 'rooms' }); c.send({ t: 'spec', room: '1234' }); await sleep(300);
  check('no room data without the host code', !c.msgs.some(m => m.t === 'rooms' || m.t === 'room' || m.t === 'start'));
  for (let i = 0; i < 6; i++) c.send({ t: 'watch', code: 'guess' + i }); await sleep(400);
  check('guessing the host code gets disconnected', c.ws.readyState !== 1);

  // --- flooding
  c = await client('cheat-test-flooder-00000001'); await c.wait('welcome');
  for (let i = 0; i < 500; i++) c.ws.send(i % 2 ? '{}' : 'garbage');
  await sleep(600); check('message flood disconnects the sender', c.ws.readyState !== 1);
  c = await client('cheat-test-bigmsg-000000001'); await c.wait('welcome'); c.send({ t: 'i', k: 0, b: Array(5000).fill(0) }); await sleep(400);
  check('oversized message disconnects the sender', c.ws.readyState !== 1);

  const lb = await (await fetch(BASE + '/api/leaderboard')).json().catch(() => null);
  check('server still alive after all probes', !!lb);
  check('no cheater on any leaderboard', lb && Object.values(lb.maps).every(b => !b.top.some(e => e.name === 'Cheater')));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
