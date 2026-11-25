// "Tiny racers in a giant office" scenery. Everything is built ~10x life size so a kart feels like a toy car.
import * as THREE from 'three';
import { canvasTex } from './world.js';
import { roadClearance } from './track-core.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function buildOffice(scene, track, map, cfg) {
  const rand = rng(77);
  const { samples, N, half } = track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const M = 34; // margin between track and walls
  const x0 = minX - M, x1 = maxX + M, z0 = minZ - M, z1 = maxZ + M;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = 34;
  const distToTrack = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < N; i += 2) { const s = samples[i]; d = Math.min(d, (s.x - x) ** 2 + (s.z - z) ** 2); }
    return Math.sqrt(d);
  };
  const clear = (x, z, r) => roadClearance(track, x, z) > 1.2 + r;

  // --- floor: carpet tiles
  const carpet = canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#5d6f8c' : '#566783'; g.fillRect(x * 128, y * 128, 128, 128);
    }
    for (let i = 0; i < 9000; i++) { // woven fibre noise
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '10,15,30'},${0.03 + Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1);
    }
    g.strokeStyle = 'rgba(20,28,45,.55)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128); g.strokeRect(128, 128, 128, 128);
  });
  carpet.repeat.set(W / 10, D / 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, -0.03, cz); floor.receiveShadow = true;
  scene.add(floor);

  // --- walls, window wall, ceiling with light panels
  const wallMat = new THREE.MeshStandardMaterial({ color: '#eef0f3', roughness: 0.9 });
  const skirt = new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.6 });
  const mkWall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat); m.position.set(x, H / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.2), skirt); s.position.set(x, 0.6, z); s.rotation.y = ry; s.translateZ(0.05); scene.add(s);
  };
  mkWall(W, cx, z0, 0); mkWall(W, cx, z1, Math.PI); mkWall(D, x0, cz, Math.PI / 2); mkWall(D, x1, cz, -Math.PI / 2);
  // big bright windows on two walls
  const winTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8ec5ff'); gr.addColorStop(0.7, '#dff0ff'); gr.addColorStop(1, '#fff6e0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(Math.random() * w, 40 + Math.random() * 90, 40 + Math.random() * 30, 12, 0, 0, 7); g.fill(); }
    g.fillStyle = '#7f93ad'; for (let i = 0; i < 9; i++) { const bw = 18 + Math.random() * 22, bh = 30 + Math.random() * 70; g.fillRect(i * 29, h - bh, bw, bh); }
    g.strokeStyle = '#2f3644'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
  }, false);
  const winMat = new THREE.MeshBasicMaterial({ map: winTex, toneMapped: false });
  for (let x = x0 + 30; x < x1 - 30; x += 46) { const w = new THREE.Mesh(new THREE.PlaneGeometry(38, 20), winMat); w.position.set(x, 18, z0 + 0.1); scene.add(w); }
  for (let z = z0 + 30; z < z1 - 30; z += 46) { const w = new THREE.Mesh(new THREE.PlaneGeometry(38, 20), winMat); w.position.set(x1 - 0.1, 18, z); w.rotation.y = -Math.PI / 2; scene.add(w); }
  const ceilTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d9dce2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b9bdc6'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(24, 44, 80, 40);
  });
  ceilTex.repeat.set(W / 24, D / 24);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: ceilTex }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, H, cz); scene.add(ceil);

  // --- instanced furniture
  const dummy = new THREE.Object3D(), parent = new THREE.Object3D();
  const batches = new Map();
  const part = (key, geo, mat) => { batches.set(key, { geo, mat, mats: [], cols: [] }); };
  const put = (key, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color = null) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz);
    parent.add(dummy); dummy.updateWorldMatrix(true, false);
    const b = batches.get(key); b.mats.push(dummy.matrixWorld.clone()); b.cols.push(color);
  };
  const wood = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d7b98c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(120,80,40,${0.05 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 170, y - 6, w, y + 3); g.stroke(); }
  });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  part('top', new THREE.BoxGeometry(17, 0.5, 8.5), std({ map: wood, roughness: 0.45 }));
  part('leg', new THREE.CylinderGeometry(0.28, 0.28, 7.3, 10), std({ color: '#c9ced6', metalness: 0.9, roughness: 0.25 }));
  part('monitor', new THREE.BoxGeometry(6.2, 3.6, 0.28), std({ color: '#15171c', roughness: 0.35, metalness: 0.4 }));
  const screenTex = canvasTex(256, 144, (g, w, h) => {
    g.fillStyle = '#10203a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c7cf0'; g.fillRect(0, 0, w, 16);
    const cols = ['#2ee6a6', '#ffd23c', '#ff5d7a', '#6fb1ff'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 4]; const bh = 20 + Math.random() * 70; g.fillRect(18 + i * 15, 124 - bh, 10, bh); }
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 6; i++) g.fillRect(150, 34 + i * 15, 60 + Math.random() * 34, 6);
  }, false);
  part('screen', new THREE.PlaneGeometry(5.8, 3.2), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  part('stand', new THREE.CylinderGeometry(0.22, 0.9, 1.4, 12), std({ color: '#2a2d35', metalness: 0.7, roughness: 0.35 }));
  part('keyboard', new THREE.BoxGeometry(4.4, 0.18, 1.5), std({ color: '#e7e9ee', roughness: 0.6 }));
  part('mug', new THREE.CylinderGeometry(0.42, 0.36, 0.95, 14), std({ color: '#ffffff', roughness: 0.3 }));
  part('seat', new THREE.CylinderGeometry(2.4, 2.4, 0.7, 20), std({ color: '#ffffff', roughness: 0.85 }));
  part('back', new THREE.BoxGeometry(4.4, 4.6, 0.6), std({ color: '#ffffff', roughness: 0.85 }));
  part('stem', new THREE.CylinderGeometry(0.3, 0.3, 4.2, 10), std({ color: '#c9ced6', metalness: 0.9, roughness: 0.25 }));
  part('base', new THREE.CylinderGeometry(2.6, 2.9, 0.35, 5), std({ color: '#22252c', roughness: 0.5, metalness: 0.5 }));
  part('pot', new THREE.CylinderGeometry(2.2, 1.6, 3.6, 16), std({ color: '#f1efe9', roughness: 0.6 }));
  part('leaf', new THREE.IcosahedronGeometry(3.2, 1), std({ color: '#ffffff', roughness: 0.8, flatShading: true }));
  part('cabinet', new THREE.BoxGeometry(5, 11, 5), std({ color: '#ffffff', roughness: 0.4, metalness: 0.5 }));
  part('paper', new THREE.IcosahedronGeometry(1.1, 0), std({ color: '#fbfbf6', roughness: 0.9, flatShading: true }));
  part('pencil', new THREE.CylinderGeometry(0.22, 0.22, 7, 6).rotateZ(Math.PI / 2), std({ color: '#ffc21a', roughness: 0.5 }));

  const chairCols = ['#ff5d7a', '#2f8bff', '#20c46b', '#ffb320', '#3b4252', '#a45bff'];
  let desks = 0;
  for (let tries = 0; tries < 3000 && desks < 64; tries++) {
    const x = x0 + 16 + rand() * (W - 32), z = z0 + 16 + rand() * (D - 32);
    const ry = Math.floor(rand() * 4) * Math.PI / 2 + (rand() - 0.5) * 0.12;
    parent.position.set(x, 0, z); parent.rotation.y = ry; parent.updateMatrixWorld(true);
    // all four legs and the chair must be off the racing line; the desktop itself may bridge the road
    const pts = [[-7.8, -3.6], [7.8, -3.6], [-7.8, 3.6], [7.8, 3.6], [0, 8.5]].map(([lx, lz]) => new THREE.Vector3(lx, 0, lz).applyMatrix4(parent.matrixWorld));
    if (!pts.every((p, i) => clear(p.x, p.z, i === 4 ? 3.2 : 0.6))) continue;
    if (batches.get('top').mats.some(m => Math.hypot(m.elements[12] - x, m.elements[14] - z) < 21)) continue;
    put('top', 0, 7.55, 0);
    for (const [lx, lz] of [[-7.8, -3.6], [7.8, -3.6], [-7.8, 3.6], [7.8, 3.6]]) put('leg', lx, 3.65, lz);
    const mo = (rand() - 0.5) * 4;
    put('stand', mo, 8.5, -2.4); put('monitor', mo, 10.9, -2.4, (rand() - 0.5) * 0.3);
    dummy.rotation.set(0, 0, 0); put('screen', mo, 10.9, -2.24);
    put('keyboard', mo, 7.9, 1.2, (rand() - 0.5) * 0.2);
    put('mug', mo + 5 * (rand() < 0.5 ? -1 : 1), 8.28, 1 + rand() * 2, 0, 1, 1, 1, chairCols[Math.floor(rand() * 6)]);
    if (rand() < 0.6) put('pencil', mo - 4 + rand() * 8, 8.0, 3, rand() * 3);
    const cc = chairCols[Math.floor(rand() * chairCols.length)], cr = (rand() - 0.5) * 1.2;
    put('base', 0, 0.2, 8.5); put('stem', 0, 2.3, 8.5); put('seat', 0, 4.6, 8.5, 0, 1, 1, 1, cc);
    put('back', Math.sin(cr) * 2.2, 7.4, 8.5 + Math.cos(cr) * 2.2, cr, 1, 1, 1, cc);
    desks++;
  }
  parent.position.set(0, 0, 0); parent.rotation.y = 0; parent.updateMatrixWorld(true);
  const leafC = new THREE.Color();
  for (let tries = 0, n = 0; tries < 1600 && n < 48; tries++) {
    const x = x0 + 6 + rand() * (W - 12), z = z0 + 6 + rand() * (D - 12), d = roadClearance(track, x, z) + half;
    if (d < half + 4.5 || d > 40) continue;
    if (rand() < 0.55) {
      put('pot', x, 1.8, z);
      for (let k = 0; k < 3; k++) put('leaf', x + (rand() - 0.5) * 2.5, 5.5 + k * 2.4, z + (rand() - 0.5) * 2.5, rand() * 6, 1 - k * 0.18, 1.1, 1 - k * 0.18, '#' + leafC.setHSL(0.28 + rand() * 0.08, 0.5, 0.3 + rand() * 0.12).getHexString());
    } else if (rand() < 0.5) put('cabinet', x, 5.5, z, Math.floor(rand() * 4) * Math.PI / 2, 1, 1, 1, ['#e9ecf2', '#9fb4d6', '#f2c14e'][Math.floor(rand() * 3)]);
    else for (let k = 0; k < 3; k++) put('paper', x + rand() * 4, 0.9, z + rand() * 4, rand() * 6, 1, 0.8, 1);
    n++;
  }
  for (const [key, b] of batches) {
    if (!b.mats.length) continue;
    const im = new THREE.InstancedMesh(b.geo, b.mat, b.mats.length);
    b.mats.forEach((m, i) => { im.setMatrixAt(i, m); if (b.cols[i]) im.setColorAt(i, leafC.set(b.cols[i])); else if (b.cols.some(Boolean)) im.setColorAt(i, leafC.set('#ffffff')); });
    im.castShadow = key !== 'screen'; im.receiveShadow = key === 'top';
    scene.add(im);
  }

  // whiteboard with the event name on the far wall
  const wb = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#fdfdfb'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0a84e0'; g.font = '900 120px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText((cfg.eventName || 'YEP RACING').toUpperCase(), w / 2, 190, w - 80);
    g.fillStyle = '#2f3644'; g.font = '700 54px system-ui, sans-serif'; g.fillText(cfg.subtitle || '', w / 2, 290, w - 80);
    g.strokeStyle = '#2f8bff'; g.lineWidth = 9; g.beginPath(); g.moveTo(140, 360); g.bezierCurveTo(300, 300, 420, 470, 560, 380); g.bezierCurveTo(680, 310, 780, 440, 890, 370); g.stroke();
  }, false);
  const board = new THREE.Mesh(new THREE.BoxGeometry(60, 26, 0.6), [skirt, skirt, skirt, skirt, new THREE.MeshStandardMaterial({ map: wb, roughness: 0.25 }), skirt]);
  board.position.set(cx, 17, z1 - 0.4); board.rotation.y = Math.PI; scene.add(board);
}
