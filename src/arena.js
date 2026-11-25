// Night circuit scenery: floodlight towers with star flares, grandstands with a crowd, truss light gantries over the
// road, neon strips along the barriers, a distant skyline and stars. Everything is procedural (no image assets).
import * as THREE from 'three';
import { canvasTex, ribbon } from './world.js';
import { roadClearance } from './track-core.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Footprint test shared with tools/checkmap: walks a 3 m grid over the whole stand, front edge to back pillars.
export function standFits(track, s, sgn, base, L, rows) {
  for (let lx = base - 4; lx <= base + rows * 2.2 + 3; lx += 3) for (let lz = -L / 2 - 3; lz <= L / 2 + 3; lz += 3) {
    const wx = s.x + s.nx * sgn * lx + s.tx * lz, wz = s.z + s.nz * sgn * lx + s.tz * lz;
    if (roadClearance(track, wx, wz) < 3.5) return false;
  }
  return true;
}

export function buildArena(scene, track, map, cfg) {
  const rand = rng(4242);
  const { samples, N, half, step } = track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  scene.fog = new THREE.Fog('#04122b', 140, 720);

  // --- ground: dark infield with a faint grid
  const gTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#040d1e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,150,255' : '0,0,0'},${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = 'rgba(53,200,245,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  });
  gTex.repeat.set(120, 120);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.75, metalness: 0.15 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.04, cz); ground.receiveShadow = true;
  scene.add(ground);

  // --- stars
  const sp = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) {
    const a = rand() * Math.PI * 2, e = 0.08 + rand() * 1.4, r = 860;
    sp.set([cx + Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, cz + Math.sin(a) * Math.cos(e) * r], i * 3);
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)),
    new THREE.PointsMaterial({ color: '#cfe6ff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
  scene.add(stars);

  // --- neon strips on top of both barriers
  if (map.barriers !== false) {
    const neon = new THREE.MeshBasicMaterial({ color: '#59d2ff', side: THREE.DoubleSide, toneMapped: false });
    for (const sgn of [-1, 1]) scene.add(new THREE.Mesh(ribbon(track, sgn * (half - 0.02), 0.97, sgn * (half + 0.3), 1.04, 4), neon));
  }

  // --- shared materials / textures
  const steel = new THREE.MeshStandardMaterial({ color: '#27364f', metalness: 0.85, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#0d1a30', roughness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: '#dff3ff', toneMapped: false });
  const flareTex = canvasTex(256, 256, (g, w, h) => {
    const c = w / 2; g.clearRect(0, 0, w, h);
    const rg = g.createRadialGradient(c, c, 0, c, c, c); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.12, 'rgba(190,225,255,.8)'); rg.addColorStop(0.4, 'rgba(60,140,255,.18)'); rg.addColorStop(1, 'rgba(0,60,200,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (const [ang, len] of [[0, 1], [Math.PI / 2, 0.8], [Math.PI / 4, 0.5], [-Math.PI / 4, 0.5]]) {
      g.save(); g.translate(c, c); g.rotate(ang);
      const lg = g.createLinearGradient(-c * len, 0, c * len, 0); lg.addColorStop(0, 'rgba(160,210,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.95)'); lg.addColorStop(1, 'rgba(160,210,255,0)');
      g.fillStyle = lg; g.fillRect(-c * len, -2.2, 2 * c * len, 4.4); g.restore();
    }
  }, false);
  const flareMat = new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false });
  const flare = (x, y, z, s) => { const f = new THREE.Sprite(flareMat); f.position.set(x, y, z); f.scale.setScalar(s); scene.add(f); };

  // --- floodlight towers around the outside of the circuit
  const gapT = Math.round(150 / step);
  for (let i = Math.round(gapT / 2), k = 0; i < N; i += gapT, k++) {
    const s = samples[i];
    for (const sgn of [1, -1]) {
      const x = s.x + s.nx * sgn * (half + 30), z = s.z + s.nz * sgn * (half + 30);
      if (roadClearance(track, x, z) < 22) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 40, 8), steel); pole.position.set(x, 20, z); scene.add(pole);
      const head = new THREE.Group(); head.position.set(x, 41, z); head.lookAt(s.x, 0, s.z);
      head.add(new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.6), dark));
      for (let r = 0; r < 2; r++) for (let c2 = 0; c2 < 4; c2++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.85, 10), glow); l.position.set(-3.6 + c2 * 2.4, -1.2 + r * 2.4, 0.33); head.add(l); }
      scene.add(head);
      flare(x, 41, z, 46 + rand() * 14);
      break; // one tower per station, preferring the outer side
    }
  }

  // --- truss light gantries across the road (the streaking light bars you fly under)
  const bar = new THREE.MeshBasicMaterial({ color: '#bfe9ff', toneMapped: false });
  const gapG = Math.round(120 / step);
  for (let i = gapG; i < N - gapG / 2; i += gapG) {
    const s = samples[i], g = new THREE.Group();
    g.position.set(s.x, s.y, s.z); g.rotation.y = s.heading;
    const W = track.width + 5, H = 9.5;
    for (const sx of [-1, 1]) {
      for (const dz of [-0.7, 0.7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, H, 0.28), steel); p.position.set(sx * W / 2, H / 2, dz); g.add(p); }
      for (let y = 1.2; y < H; y += 1.7) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.2), steel); d.position.set(sx * W / 2, y, 0); d.rotation.x = (Math.round(y) % 2 ? 1 : -1) * 0.7; g.add(d); }
    }
    for (const [y, dz] of [[H, -0.7], [H, 0.7], [H - 1.5, -0.7], [H - 1.5, 0.7]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.26, 0.26), steel); b.position.set(0, y, dz); g.add(b); }
    for (let x = -W / 2 + 1; x < W / 2; x += 1.9) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), steel); d.position.set(x, H - 0.75, 0.7); d.rotation.z = (Math.round(x) % 2 ? 1 : -1) * 0.75; g.add(d); }
    for (const x of [-W / 4, W / 4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 2, 0.22, 0.5), bar); l.position.set(x, H - 1.75, 0); g.add(l); }
    scene.add(g);
  }

  // --- grandstands with a crowd along the start straight (both sides) and facing each hairpin
  const crowdGeo = new THREE.CapsuleGeometry(0.3, 0.55, 2, 6);
  const crowdMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const palette = ['#0a84e0', '#35c8f5', '#c9defa', '#12305c', '#1f6dff', '#0e3f8a', '#7fb8ff', '#0b2244', '#0b2244', '#163a70'];
  const mats = [], cols = [], dummy = new THREE.Object3D(), col = new THREE.Color();
  const screenTex = canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#0041a8'); gr.addColorStop(0.5, '#0a84e0'); gr.addColorStop(1, '#35c8f5');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = '900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((cfg.eventName || 'YEP RACING').toUpperCase(), w / 2, h / 2 + 3, w - 30);
  }, false);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  function stand(i, sgn, L, rows) {
    const s = samples[((i % N) + N) % N], g = new THREE.Group();
    g.position.set(s.x, s.y, s.z); g.rotation.y = s.heading;
    const base = half + 12;
    // reject the stand if ANY part of its footprint (seats, roof, pillars) would touch the road or a shortcut lane
    if (!standFits(track, s, sgn, base, L, rows)) return;
    g.updateMatrixWorld(true);
    for (let r = 0; r < rows; r++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, L), dark); st.position.set(sgn * (base + r * 2.2), 0.65 + r * 1.3, 0); st.scale.y = 1 + r; st.position.y = (1.3 * (1 + r)) / 2; g.add(st);
      for (let z = -L / 2 + 0.6; z < L / 2 - 0.5; z += 0.78) {
        if (rand() < 0.14) continue;
        dummy.position.set(sgn * (base + r * 2.2), 1.3 * (r + 1) + 0.55, z + (rand() - 0.5) * 0.3); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 0.85 + rand() * 0.35, 1);
        g.add(dummy); dummy.updateWorldMatrix(true, false); mats.push(dummy.matrixWorld.clone()); g.remove(dummy);
        cols.push(palette[Math.floor(rand() * palette.length)]);
      }
    }
    const top = rows * 1.3;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(rows * 2.2 + 4, 0.4, L + 4), steel); roof.position.set(sgn * (base + rows * 1.1 - 1), top + 7.5, 0); roof.rotation.z = sgn * -0.12; g.add(roof);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, L), bar); strip.position.set(sgn * (base - 2.6), top + 7.6, 0); g.add(strip);
    for (const z of [-L / 2, 0, L / 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, top + 7.5, 0.5), steel); p.position.set(sgn * (base + rows * 2.2 + 0.6), (top + 7.5) / 2, z); g.add(p); }
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(46, L * 0.45), 7), screenMat); scr.position.set(sgn * (base + rows * 2.2 + 0.2), top + 3.4, 0); scr.rotation.y = sgn * -Math.PI / 2; g.add(scr);
    scene.add(g);
  }
  const startMid = Math.round(60 / step);
  stand(startMid, 1, 190, 9); stand(startMid, -1, 190, 9);
  for (const q of track.shortcuts) { const apex = Math.round((q.from + q.to) / 2); stand(apex, 1, 60, 6); stand(apex, -1, 60, 6); }
  stand(Math.round(N * 0.5), 1, 110, 7); stand(Math.round(N * 0.5), -1, 110, 7);
  if (mats.length) {
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, mats.length);
    mats.forEach((m4, i) => { crowd.setMatrixAt(i, m4); crowd.setColorAt(i, col.set(cols[i])); });
    scene.add(crowd);
  }

  // --- distant skyline with lit windows
  const winTex = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#030b1c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 6; x++) if (Math.random() < 0.2) { g.fillStyle = Math.random() < 0.75 ? '#1f5fb8' : '#9fd0ff'; g.fillRect(x * 10 + 3, y * 8 + 2, 6, 4); }
  });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rand() * 0.1, r = 620 + rand() * 160, w = 30 + rand() * 40, h = 50 + rand() * rand() * 190;
    const t = winTex.clone(); t.repeat.set(Math.max(1, Math.round(w / 26)), Math.max(1, Math.round(h / 52))); t.needsUpdate = true;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ map: t, color: '#8fb0e0', fog: true }));
    b.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r); b.rotation.y = rand() * 3;
    scene.add(b);
  }
}
