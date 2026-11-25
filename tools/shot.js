// Dev helper: drive one browser player and take screenshots.
const { chromium } = require('playwright');
(async () => {
  const [w, h, tag] = [Number(process.argv[2] || 844), Number(process.argv[3] || 390), process.argv[4] || 'land'];
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true });
  p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:3000/');
  await p.waitForSelector('#sProfile:not(.hidden)', { timeout: 60000 });
  await p.screenshot({ path: `shots/${tag}-1-profile.png` });
  await p.fill('#inName', 'Tester ' + tag);
  await p.click('#teamPick button:nth-child(2)');
  await p.click('#btnEnter');
  await p.screenshot({ path: `shots/${tag}-2-home.png` });
  await p.click('#btnQuick'); await p.waitForSelector('#sLobby:not(.hidden)');
  await p.screenshot({ path: `shots/${tag}-3-lobby.png` });
  await p.waitForFunction(() => window.__game.race, null, { timeout: 30000 });
  await p.waitForTimeout(9000);
  await p.screenshot({ path: `shots/${tag}-4-race.png` });
  // autopilot: steer towards the track tangent a few samples ahead
  await p.evaluate(() => {
    const g = window.__game;
    window.__auto = setInterval(() => {
      const r = g.race; if (!r) return;
      const c = r.car, t = g.track; let s = t.samples[(c.idx + 9) % t.N];
      const q = c.sc >= 0 ? t.shortcuts[c.sc] : t.shortcuts.find(q => c.idx > q.from - 22 && c.idx <= q.from + 4);
      if (q) { const al = Math.min((c.x - q.ax) * q.ux + (c.z - q.az) * q.uz + 13, q.len + 8); s = { x: q.ax + q.ux * al, z: q.az + q.uz * al }; }
      let d = Math.atan2(s.x - c.x, s.z - c.z) - c.h; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.inp.left = d > 0.05; g.inp.right = d < -0.05; g.inp.drift = Math.abs(d) > 0.3;
      if (c.tapWin > 0 || c.stock > 1) g.inp.nitro = true;
      if (c.drift && !window.__s1) { window.__s1 = 1; }
    }, 30);
  });
  await p.waitForFunction(() => window.__game.race.car.sc >= 0, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(700);
  await p.screenshot({ path: `shots/${tag}-5b-lane.png` });
  await p.waitForFunction(() => window.__game.race.car.drift && window.__game.race.car.charge > 0.5, null, { timeout: 60000 }).catch(() => {});
  await p.screenshot({ path: `shots/${tag}-5c-drift.png` });
  await p.waitForFunction(() => window.__game.race.car.boostT > 1.5, null, { timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(250);
  await p.screenshot({ path: `shots/${tag}-5d-nitro.png` });
  await p.waitForFunction(() => window.__game.race && window.__game.race.myResult, null, { timeout: 240000 });
  console.log('client-simulated ms:', await p.evaluate(() => window.__game.race.car.finishMs), ' server-official ms:', await p.evaluate(() => window.__game.race.myResult.time));
  await p.waitForSelector('#sResult:not(.hidden)', { timeout: 240000 });
  await p.screenshot({ path: `shots/${tag}-6-result.png` });
  console.log(await p.evaluate(() => document.querySelector('#rsMine').innerText));
  await b.close();
})();
