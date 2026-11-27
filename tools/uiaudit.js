// Mobile UI audit. Usage: node tools/uiaudit.js [http://localhost:3000]   (server must run with TEST_HOOKS=1)
// Opens every menu screen at phone sizes and reports: panels that need scrolling or leave the screen,
// tap targets under 44 px, text under 12 px, and text inputs under 16 px (iOS zooms the page on those).
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let bad = 0;
  for (const [w, h, tag] of [[667, 375, 'small-landscape'], [844, 390, 'landscape'], [390, 844, 'portrait']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await p.goto(BASE + '/'); await p.waitForSelector('#sProfile:not(.hidden)', { timeout: 150000 });
    await p.evaluate(() => document.body.classList.add('allow-portrait'));
    const audit = async name => {
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => {
        const panel = document.querySelector('.panel:not(.hidden)'); if (!panel) return null;
        const pr = panel.getBoundingClientRect(), out = [];
        if (panel.scrollHeight > panel.clientHeight + 2) out.push(`needs scrolling (${panel.scrollHeight - panel.clientHeight}px hidden)`);
        if (pr.top < 0 || pr.bottom > innerHeight + 1 || pr.left < 0 || pr.right > innerWidth + 1) out.push('panel leaves the screen');
        for (const el of panel.querySelectorAll('button, a, input')) {
          const q = el.getBoundingClientRect(); if (!q.width || el.closest('.hidden')) continue;
          const label = (el.id || el.textContent || el.placeholder || '').trim().slice(0, 18);
          if (q.height < 43.5 || q.width < 43.5) out.push(`small tap target ${Math.round(q.width)}×${Math.round(q.height)}: ${label}`);
          if (el.tagName === 'INPUT' && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`input font < 16px: ${label}`);
        }
        const kids = [...panel.children].filter(k => k.getBoundingClientRect().height && !k.classList.contains('hidden'));
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
          const x = kids[i].getBoundingClientRect(), y = kids[j].getBoundingClientRect();
          if (x.left < y.right - 1 && y.left < x.right - 1 && x.top < y.bottom - 1 && y.top < x.bottom - 1) out.push(`overlap: ${kids[i].id || kids[i].className} × ${kids[j].id || kids[j].className}`);
        }
        const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
        const small = new Set(); for (let n; (n = tw.nextNode());) { if (!n.textContent.trim() || n.parentElement.closest('.hidden')) continue; const fs = parseFloat(getComputedStyle(n.parentElement).fontSize); if (fs < 12) small.add(n.textContent.trim().slice(0, 16) + ' (' + fs + 'px)'); }
        for (const s of small) out.push('small text: ' + s);
        return out;
      });
      await p.screenshot({ path: `shots/ui-${tag}-${name}.png` });
      if (r && r.length) { bad += r.length; console.log(`[${tag}] ${name}:\n   - ` + r.join('\n   - ')); } else console.log(`[${tag}] ${name}: OK`);
    };
    await audit('profile');
    await p.fill('#inName', 'Nguyen Thi Xuan'); await p.tap('#teamPick button:nth-child(2)'); await p.tap('#btnEnter'); await audit('home');
    await p.tap('#btnGarage'); await audit('garage'); await p.tap('#btnGarageDone');
    await p.tap('#btnBoard'); await p.waitForTimeout(500); await audit('leaderboard'); await p.tap('#btnBack');
    await p.tap('#btnCreate'); await p.waitForSelector('#btnGo:not(.hidden)'); await audit('lobby');
    await p.evaluate(() => { const r = []; for (let i = 0; i < 8; i++) r.push({ id: i ? 900 + i : window.__game.me.id, name: 'Racer Name ' + i, team: 'blue', time: i < 6 ? 95000 + i * 2100 : null }); document.getElementById('rsMine').innerHTML = 'Your time<b>1:35.000</b><span class="pb">★ New personal best</span> · HQ Classic rank #12'; document.getElementById('rsList').innerHTML = r.map((x, i) => `<li><span class="n">${i + 1}</span><i style="background:#2f8bff"></i><span class="nm">${x.name}</span><span class="tm">${x.time ? '1:3' + i + '.000' : 'DNF'}</span></li>`).join(''); for (const s of document.querySelectorAll('.panel')) s.classList.add('hidden'); document.getElementById('sResult').classList.remove('hidden'); });
    await audit('results');
    await p.close();
  }
  console.log(bad ? `\n${bad} issue(s)` : '\nALL SCREENS OK');
  await b.close();
})();
