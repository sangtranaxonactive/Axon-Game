// "Sunset Coast" scenery: a sand island in a calm sea at golden hour — palms, rocks, beach huts and umbrellas,
// a striped lighthouse, sail boats, and a channel of water under the elevated bridge section of the road.
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

export function buildCoast(scene, track, map) {
  const rand = rng(31337);
  const { samples, N } = track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, rx = (maxX - minX) / 2 + 70, rz = (maxZ - minZ) / 2 + 70;
  scene.fog = new THREE.Fog('#f3b48a', 260, 1300);
  const std = o => new THREE.MeshStandardMaterial(o);

  // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshPhysicalMaterial({ color: '#1c6f9a', roughness: 0.12, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.6 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(cx, -1.4, cz); scene.add(sea);
  // sand island (ellipse) with a lighter wet rim
  const sandTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e4c98f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,244,214' : '150,118,70'},${Math.random() * 0.16})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = 'rgba(160,125,75,.18)'; g.lineWidth = 3; for (let y = 10; y < h; y += 26) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(70, y + 9, 170, y - 9, w, y + 4); g.stroke(); }
  });
  sandTex.repeat.set(rx / 9, rz / 9);
  const rim = new THREE.Mesh(new THREE.CircleGeometry(1, 72), std({ color: '#c9b384', roughness: 0.6 }));
  rim.rotation.x = -Math.PI / 2; rim.scale.set(rx + 16, rz + 16, 1); rim.position.set(cx, -0.5, cz); scene.add(rim);
  const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 72), std({ map: sandTex, roughness: 0.95 }));
  sand.rotation.x = -Math.PI / 2; sand.scale.set(rx, rz, 1); sand.position.set(cx, -0.04, cz); sand.receiveShadow = true; scene.add(sand);

  // water channel under the highest part of the road (the bridge)
  let hi = 0; for (let i = 0; i < N; i++) if (samples[i].y > samples[hi].y) hi = i;
  if (samples[hi].y > 3) {
    let a = hi, b = hi; while (samples[(a - 1 + N) % N].y > samples[hi].y - 0.4 && hi - a < N / 3) a--; while (samples[(b + 1) % N].y > samples[hi].y - 0.4 && b - hi < N / 3) b++;
    const mid = samples[((Math.round((a + b) / 2)) % N + N) % N];
    const ch = new THREE.Mesh(new THREE.PlaneGeometry(46, 900), new THREE.MeshPhysicalMaterial({ color: '#2a86ad', roughness: 0.1, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.5 }));
    ch.rotation.set(-Math.PI / 2, 0, -mid.heading + Math.PI / 2 + Math.PI / 2); ch.position.set(mid.x, 0.02, mid.z); scene.add(ch);
  }

  // sun disc low over the water + a few clouds
  const sunTex = canvasTex(128, 128, (g, w) => { const c = w / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(0.3, 'rgba(255,200,130,.9)'); gr.addColorStop(1, 'rgba(255,150,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, false);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, toneMapped: false })); sun.scale.setScalar(260);
  const az = (map.sun?.azimuth ?? 250) * Math.PI / 180; sun.position.set(cx + Math.sin(az) * 820, 120, cz + Math.cos(az) * 820); scene.add(sun);
  const cloudM = new THREE.MeshBasicMaterial({ color: '#ffe3d0', transparent: true, opacity: 0.85, fog: false });
  for (let i = 0; i < 14; i++) { const a = rand() * Math.PI * 2, r = 500 + rand() * 250, g = new THREE.Group(); for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(18 + rand() * 16, 8, 6), cloudM); p.position.set(k * 22 - 30, rand() * 8, rand() * 10); p.scale.y = 0.45; g.add(p); } g.position.set(cx + Math.cos(a) * r, 150 + rand() * 90, cz + Math.sin(a) * r); scene.add(g); }

  // instanced palms, rocks, umbrellas
  const inst = (geo, m, list, cols) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length), c = new THREE.Color(); list.forEach((mx, i) => { im.setMatrixAt(i, mx); if (cols) im.setColorAt(i, c.set(cols[i])); }); im.castShadow = true; scene.add(im); };
  const o = new THREE.Object3D(), mk = (x, y, z, rxx, ry, rzz, sx, sy, sz) => { o.position.set(x, y, z); o.rotation.set(rxx, ry, rzz, 'YXZ'); o.scale.set(sx, sy, sz); o.updateMatrix(); return o.matrix.clone(); };
  const inside = (x, z, m) => ((x - cx) / (rx - m)) ** 2 + ((z - cz) / (rz - m)) ** 2 < 1;
  const trunks = [], fronds = [], nuts = [];
  for (let i = 0, tries = 0; i < 150 && tries < 4000; tries++) {
    const x = cx + (rand() * 2 - 1) * rx, z = cz + (rand() * 2 - 1) * rz, d = roadClearance(track, x, z);
    if (!inside(x, z, 8) || d < 5 || d > 70) continue;
    const h = 9 + rand() * 7, lean = (rand() - 0.5) * 0.35, ry = rand() * 6.28;
    trunks.push(mk(x, h / 2, z, lean, ry, 0, 1, h, 1));
    const tx = x + Math.sin(ry) * Math.sin(lean) * h * 0.5, tz = z + Math.cos(ry) * Math.sin(lean) * h * 0.5, ty = h * Math.cos(lean);
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + rand() * 0.4; fronds.push(mk(tx + Math.sin(a) * 2.6, ty - 0.5, tz + Math.cos(a) * 2.6, 0.55 + rand() * 0.3, a, 0, 1, 1, 1)); }
    for (let k = 0; k < 2; k++) nuts.push(mk(tx + (rand() - 0.5), ty - 0.7, tz + (rand() - 0.5), 0, 0, 0, 1, 1, 1));
    i++;
  }
  inst(new THREE.CylinderGeometry(0.28, 0.5, 1, 7), std({ color: '#8a6a45', roughness: 0.95 }), trunks);
  inst(new THREE.ConeGeometry(0.9, 6.6, 4).translate(0, 0, 0).rotateX(Math.PI / 2), std({ color: '#3f8f3a', roughness: 0.7, flatShading: true }), fronds);
  inst(new THREE.SphereGeometry(0.42, 7, 6), std({ color: '#5a3d1f', roughness: 0.8 }), nuts);
  const rocks = [];
  for (let i = 0, tries = 0; i < 70 && tries < 3000; tries++) { const x = cx + (rand() * 2 - 1) * (rx + 30), z = cz + (rand() * 2 - 1) * (rz + 30); if (roadClearance(track, x, z) < 6) continue; const s = 1.5 + rand() * rand() * 7; rocks.push(mk(x, s * 0.3 - (inside(x, z, 0) ? 0 : 1.2), z, rand(), rand() * 6, rand(), s, s * 0.7, s * 1.1)); i++; }
  inst(new THREE.IcosahedronGeometry(1, 0), std({ color: '#7f7a74', roughness: 0.9, flatShading: true }), rocks);
  const umb = [], poles = [], ucol = [];
  for (let i = 0, tries = 0; i < 46 && tries < 3000; tries++) { const x = cx + (rand() * 2 - 1) * rx, z = cz + (rand() * 2 - 1) * rz, d = roadClearance(track, x, z); if (!inside(x, z, 10) || d < 4.5 || d > 30) continue; umb.push(mk(x, 5.2, z, (rand() - 0.5) * 0.3, rand() * 6, 0, 1, 1, 1)); poles.push(mk(x, 2.6, z, 0, 0, 0, 1, 1, 1)); ucol.push(['#ff5d7a', '#35c8f5', '#ffd23c', '#ffffff', '#ff8a2c'][i % 5]); i++; }
  inst(new THREE.ConeGeometry(4, 1.6, 10), std({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide }), umb, ucol);
  inst(new THREE.CylinderGeometry(0.12, 0.12, 5.2, 6), std({ color: '#e9e4d8', roughness: 0.6 }), poles);

  // beach huts
  const hutCols = ['#35c8f5', '#ff8a2c', '#ffd23c', '#ff5d7a', '#7fd6a0', '#f4f1ea'];
  for (let i = 0, tries = 0; i < 12 && tries < 2000; tries++) {
    const x = cx + (rand() * 2 - 1) * rx, z = cz + (rand() * 2 - 1) * rz, d = roadClearance(track, x, z);
    if (!inside(x, z, 16) || d < 12 || d > 38) continue;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rand() * 6.28;
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 8), std({ color: hutCols[i % 6], roughness: 0.8 })); body.position.y = 3.5; body.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 4, 4), std({ color: '#f1ece0', roughness: 0.8 })); roof.position.y = 9; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.6, 0.3), std({ color: '#3a2a1e', roughness: 0.8 })); door.position.set(0, 2.3, 4.05);
    g.add(body, roof, door); scene.add(g); i++;
  }
  // lighthouse on the rim
  { const a = az + 2.2, x = cx + Math.cos(a) * (rx + 4), z = cz + Math.sin(a) * (rz + 4), g = new THREE.Group(); g.position.set(x, 0, z);
    const stripes = canvasTex(64, 256, (c, w, h) => { for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? '#e5283c' : '#f6f4ee'; c.fillRect(0, k * h / 6, w, h / 6); } }, false);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 60, 18), std({ map: stripes, roughness: 0.7 })); tower.position.y = 30; tower.castShadow = true;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 6, 14), new THREE.MeshBasicMaterial({ color: '#fff3c4' })); lamp.position.y = 63;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(5.6, 5, 14), std({ color: '#2a2d35', roughness: 0.6 })); cap.position.y = 68.5;
    g.add(tower, lamp, cap); scene.add(g); }
  // sail boats
  for (let i = 0; i < 9; i++) { const a = rand() * 6.28, r = 1.25 + rand() * 0.9, g = new THREE.Group(); g.position.set(cx + Math.cos(a) * rx * r, -1.1, cz + Math.sin(a) * rz * r); g.rotation.y = rand() * 6.28;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 15), std({ color: '#f4f1ea', roughness: 0.5 })); hull.position.y = 0.7;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 20, 6), std({ color: '#6b4a2f' })); mast.position.y = 11;
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 17); sailShape.lineTo(8, 0); sailShape.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: ['#ffffff', '#ff5d7a', '#35c8f5'][i % 3], side: THREE.DoubleSide, roughness: 0.8 })); sail.position.set(0, 2.5, 0.4); sail.rotation.y = Math.PI / 2;
    g.add(hull, mast, sail); scene.add(g); }
}
