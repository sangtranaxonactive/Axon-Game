// Generates public/maps/sample-scan.glb: a small real-scale (metres) room, standing in for an iPhone LiDAR scan,
// to prove the GLB -> map pipeline. Usage: node tools/make-sample-glb.js
const esbuild = require('esbuild'), { chromium } = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const src = `
    import * as THREE from 'three';
    import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
    const g = new THREE.Group();
    const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })); m.position.set(x, y, z); g.add(m); };
    box(13, 0.1, 10, '#8a6f52', 0, -0.05, 0);                                   // wooden floor 13 x 10 m
    box(13, 2.8, 0.15, '#e9e4da', 0, 1.4, -5); box(13, 2.8, 0.15, '#e9e4da', 0, 1.4, 5);
    box(0.15, 2.8, 10, '#dfe7ee', -6.5, 1.4, 0); box(0.15, 2.8, 10, '#dfe7ee', 6.5, 1.4, 0);
    for (const [x, z] of [[-3.2, -1.2], [0, -1.2], [3.2, -1.2], [-3.2, 1.6], [0, 1.6], [3.2, 1.6]]) {
      box(1.6, 0.05, 0.8, '#f3f0ea', x, 0.75, z);
      for (const [lx, lz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) box(0.05, 0.75, 0.05, '#555', x + lx, 0.375, z + lz);
      box(0.55, 0.34, 0.03, '#111', x, 1.05, z - 0.2); box(0.45, 0.45, 0.45, '#0a84e0', x, 0.25, z + 0.75);
    }
    box(1.2, 0.9, 0.5, '#2f3644', -5.6, 0.45, -4.4); box(0.5, 1.1, 0.5, '#3fa35b', 5.8, 0.55, 4.3);
    window.out = await new Promise((res, rej) => new GLTFExporter().parse(g, b => { const u = new Uint8Array(b); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); res(btoa(s)); }, rej, { binary: true }));`;
  const r = await esbuild.build({ stdin: { contents: src, resolveDir: path.join(__dirname, '..'), loader: 'js' }, bundle: true, format: 'esm', write: false, target: 'es2022' });
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(`<script type="module">${r.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>')}</script>`);
  await p.waitForFunction(() => window.out, null, { timeout: 30000 });
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'maps', 'sample-scan.glb'), Buffer.from(await p.evaluate(() => window.out), 'base64'));
  await b.close(); console.log('wrote public/maps/sample-scan.glb');
})();
