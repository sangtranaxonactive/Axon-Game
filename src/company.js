// "Company" scenery — a giant-scale recreation of the real office, modelled detail by detail from the 360° reference
// photos. Colours below were sampled from those photos. There is no asphalt and no barrier on this map: karts race
// on the office floor itself, and the course is marked only by yellow floor lines, like the real guide lines.
//   ceiling  : light concrete, crinkled-foil silver ducts, black conduits + pendant lamps, red sprinkler pipes,
//              orange perforated cable trays, white AC cassettes, big skylight panels, black arched trusses
//   floor    : warm polished concrete with yellow guide lines and arcs
//   rooms    : round-cornered cobalt meeting rooms with bright blue glass, white table, black/chrome chairs, clock
//   walls    : brand blue with diagonal slashes and the big "A", orange curved walls with TV + clocks + bar stools,
//              blue numeral walls, charcoal lockers with yellow numbered doors, white quote / values walls
//   objects  : hexagonal yellow planters with dracaena plants under yellow hoods with purple grow lamps, workstation
//              pods in black frames with white end panels and twin LED bars, dark round columns on hexagonal bases,
//              vintage motorbike, cyclo, server room with blue-lit racks, blue reception desk, mountain mural + bench
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
// second pass: colours re-sampled from the sharper phone photos (the 360° set was over-saturated)
const BLUE = '#3f62c4', FRAME = '#2f55b8', LIGHTBLUE = '#8fb4e6', ORANGE = '#e8862e', YELLOW = '#f0d02c', MAGENTA = '#c618f2', LINE = '#f4b400', FILM = '#0a86c8', CREAM = '#e9dfc8',
  TRAY = '#e85a2a', COLUMN = '#55565c', CHARCOAL = '#33363d', NAVY = '#101a55';

// rounded rectangle helpers (footprint in X/Z, extruded upwards)
function rr(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const slab = (w, d, r, h) => new THREE.ExtrudeGeometry(rr(w, d, r), { depth: h, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2);
function band(w, d, r, t, h) {
  const s = rr(w, d, r); s.holes.push(rr(w - 2 * t, d - 2 * t, Math.max(0.5, r - t)));
  return new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2);
}
// grey-scale noise canvas used as a bump map (gives paint, concrete, fabric and foil their surface grain)
function grain(size, dots, alpha, blobs = 0) {
  const t = canvasTex(size, size, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < dots; i++) { const v = Math.random() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    for (let i = 0; i < blobs; i++) { const v = Math.random() < 0.5 ? 255 : 0, r = 6 + Math.random() * 26; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); }
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function buildCompany(scene, track, map, cfg) {
  const rand = rng(909);
  const { samples, N, half, step } = track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const M = 40, x0 = minX - M, x1 = maxX + M, z0 = minZ - M, z1 = maxZ + M;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = 40;
  scene.fog = new THREE.Fog('#aab0bd', 320, 1150);
  scene.background = new THREE.Color('#aab0bd');

  // --- materials: physically based, each with the surface character of the real thing
  const std = o => new THREE.MeshStandardMaterial(o);
  const phys = o => new THREE.MeshPhysicalMaterial(o);
  const basic = o => new THREE.MeshBasicMaterial(o);
  const paintBump = grain(128, 2500, 0.5); paintBump.repeat.set(4, 4);
  const fabricBump = grain(64, 2600, 0.9); fabricBump.repeat.set(6, 6);
  const paint = (color, o = {}) => std({ color, roughness: 0.62, bumpMap: paintBump, bumpScale: 0.25, ...o });           // rolled wall paint
  const powder = (color, o = {}) => phys({ color, roughness: 0.38, metalness: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.4, ...o }); // powder-coated sheet steel
  const mat = {
    blue: paint(BLUE), frame: powder(FRAME), orange: paint(ORANGE), yellow: powder(YELLOW),
    black: phys({ color: '#141519', roughness: 0.42, metalness: 0.75, clearcoat: 0.2 }),                                   // black steel sections
    white: phys({ color: '#f3f4f6', roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25 }),                           // laminate / whiteboard
    column: std({ color: COLUMN, roughness: 0.85, bumpMap: paintBump, bumpScale: 0.5 }), charcoal: powder(CHARCOAL),
    chrome: std({ color: '#e3e6ea', roughness: 0.12, metalness: 1, envMapIntensity: 1.6 }),
    red: phys({ color: '#cf2a2a', roughness: 0.35, metalness: 0.3, clearcoat: 0.6 }), tray: powder(TRAY),
    soil: std({ color: '#2d2119', roughness: 1 }), trunk: std({ color: '#8a7a55', roughness: 0.95 }),
    wood: std({ color: '#c9772e', roughness: 0.7 }),
    carpet: std({ color: '#0c3f8f', roughness: 1, bumpMap: fabricBump, bumpScale: 0.6 }),
    fabric: std({ color: '#17181c', roughness: 0.95, bumpMap: fabricBump, bumpScale: 0.8 }),                               // mesh task chairs
    rubber: std({ color: '#0e0e10', roughness: 0.9 }), leather: phys({ color: '#1a1512', roughness: 0.5, sheen: 0.6, sheenRoughness: 0.5 }),
    plastic: phys({ color: '#101114', roughness: 0.3, clearcoat: 0.6 }),                                                    // monitor bezels
    light: basic({ color: '#ffffff' }), purple: basic({ color: MAGENTA }),
    glass: phys({ color: '#1c8cf0', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8, specularIntensity: 1 }),
  };

  // --- floor: warm polished concrete (mottled colour + bump for trowel marks, low roughness so lights smear on it)
  const conc = canvasTex(512, 512, (g, w, h) => {
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { // four large stone-look tiles, each a slightly different grey
      const v = 84 + Math.floor(Math.random() * 14); g.fillStyle = `rgb(${v + 5},${v + 4},${v + 2})`; g.fillRect(tx * 256, ty * 256, 256, 256);
      for (let i = 0; i < 46; i++) { const r = 14 + Math.random() * 60, c = Math.random() < 0.5 ? '235,232,225' : '70,70,74'; const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, `rgba(${c},${0.06 + Math.random() * 0.1})`); gr.addColorStop(1, `rgba(${c},0)`); g.save(); g.translate(tx * 256 + Math.random() * 256, ty * 256 + Math.random() * 256); g.scale(1 + Math.random() * 2, 0.5 + Math.random() * 0.6); g.rotate(Math.random() * 3); g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore(); }
    }
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.04})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = 'rgba(52,52,56,.75)'; g.lineWidth = 2.5; g.strokeRect(0, 0, 256, 256); g.strokeRect(256, 0, 256, 256); g.strokeRect(0, 256, 256, 256); g.strokeRect(256, 256, 256, 256);
  });
  conc.repeat.set(W / 26, D / 26);
  const concBump = grain(256, 5000, 0.5, 120); concBump.repeat.set(W / 30, D / 30);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), phys({ map: conc, bumpMap: concBump, bumpScale: 0.35, roughness: 0.55, metalness: 0.02, clearcoat: 0.18, clearcoatRoughness: 0.45, envMapIntensity: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, -0.03, cz); floor.receiveShadow = true; scene.add(floor);

  // --- the course: two yellow floor lines (open where a shortcut branches off), plus yellow-edged shortcut lanes
  const yellowFlat = basic({ color: LINE, side: THREE.DoubleSide });
  const inMouth = sgn => i => {
    for (const o of [0, 1]) {
      const s = samples[(i + o) % N], x = s.x + s.nx * sgn * half, z = s.z + s.nz * sgn * half;
      for (const q of track.shortcuts) { const px = x - q.ax, pz = z - q.az, t = (px * q.ux + pz * q.uz) / q.len, d = pz * q.ux - px * q.uz; if (t > 0 && t < 1 && Math.abs(d) < q.hw + 0.4) return true; }
    }
    return false;
  };
  for (const sgn of [-1, 1]) scene.add(new THREE.Mesh(ribbon(track, sgn * (half - 0.05), 0.03, sgn * (half + 0.75), 0.03, 4, inMouth(sgn)), yellowFlat));
  const dashTex = canvasTex(32, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(12, 6, 8, 30); }); dashTex.repeat.set(1, track.length / 9);
  scene.add(new THREE.Mesh(ribbon(track, -0.45, 0.025, 0.45, 0.025, 9), basic({ map: dashTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }))); // faint centre dashes
  const chev = canvasTex(64, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = YELLOW; g.lineWidth = 8; g.lineJoin = 'round'; g.beginPath(); g.moveTo(12, 92); g.lineTo(32, 62); g.lineTo(52, 92); g.stroke(); });
  for (const q of track.shortcuts) {
    const ry = Math.atan2(q.ux, q.uz);
    let t0 = null, t1 = null;
    for (let k = 0; k <= 200; k++) { const t = k / 200, x = q.ax + q.ux * q.len * t, z = q.az + q.uz * q.len * t; let dd = Infinity; for (const s of samples) dd = Math.min(dd, (s.x - x) ** 2 + (s.z - z) ** 2); if (Math.sqrt(dd) > half - 0.2) { if (t0 === null) t0 = t; t1 = t; } }
    if (t0 === null) continue;
    const len = (t1 - t0) * q.len, mid = (t0 + t1) / 2 * q.len, mx = q.ax + q.ux * mid, mz = q.az + q.uz * mid;
    for (const sgn of [-1, 1]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.8, len), yellowFlat); l.rotation.set(-Math.PI / 2, 0, Math.PI + ry); l.position.set(mx - q.uz * sgn * (q.hw + 0.35), 0.03, mz + q.ux * sgn * (q.hw + 0.35)); scene.add(l); }
    const ct = chev.clone(); ct.repeat.set(1, q.len / 8); ct.needsUpdate = true;
    const arrows = new THREE.Mesh(new THREE.PlaneGeometry(q.hw * 1.5, q.len), basic({ map: ct, transparent: true, depthWrite: false })); arrows.rotation.set(-Math.PI / 2, 0, Math.PI + ry); arrows.position.set((q.ax + q.bx) / 2, 0.035, (q.az + q.bz) / 2); scene.add(arrows);
  }

  // --- brand walls: blue with white / light-blue diagonal slashes and the giant "A"
  const drawA = (g, x, y, s) => { // x,y = bottom-left of a box s wide, s*0.95 tall
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.2, y); g.lineTo(x + s * 0.5, y - s * 0.72); g.lineTo(x + s * 0.8, y); g.lineTo(x + s, y); g.lineTo(x + s * 0.6, y - s * 0.95); g.lineTo(x + s * 0.4, y - s * 0.95); g.closePath(); g.fill();
  };
  const brandTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = BLUE; g.fillRect(0, 0, w, h);
    const slash = (x, width, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x, h); g.lineTo(x + width, h); g.lineTo(x + width + 110, 0); g.lineTo(x + 110, 0); g.closePath(); g.fill(); };
    slash(40, 70, '#ffffff'); slash(130, 26, LIGHTBLUE); slash(176, 12, '#4f6dff');
    slash(600, 24, LIGHTBLUE); slash(646, 96, FRAME); slash(760, 14, '#ffffff');
    drawA(g, 330, 240, 236);
    g.fillStyle = NAVY; g.fillRect(0, h - 9, w, 9);
  });
  const mkWall = (w, x, z, ry) => {
    const t = brandTex.clone(); t.repeat.set(Math.max(1, Math.round(w / 170)), 1); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), std({ map: t, roughness: 0.7, bumpMap: paintBump, bumpScale: 0.2 })); m.position.set(x, H / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
  };
  mkWall(W, cx, z0, 0); mkWall(W, cx, z1, Math.PI); mkWall(D, x0, cz, Math.PI / 2); mkWall(D, x1, cz, -Math.PI / 2);

  // --- ceiling: light concrete, with everything that hangs under it
  const ceilTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9bcc5'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,50'},${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.strokeStyle = 'rgba(90,92,104,.5)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });
  ceilTex.repeat.set(W / 48, D / 48);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), basic({ map: ceilTex })); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, H, cz); scene.add(ceil);
  const inst = (geo, m, list, shadow = false) => { // list of [x, y, z, ry?]
    if (!list.length) return; const im = new THREE.InstancedMesh(geo, m, list.length), o = new THREE.Object3D();
    list.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(p[4] || 0, p[3] || 0, p[5] || 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); im.castShadow = shadow; scene.add(im);
  };
  // foil ducts (crinkled silver) along X, with collars
  const foil = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#b8bfc9'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '70,80,95'},${0.15 + Math.random() * 0.35})`; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + Math.random() * 22 - 11, y + Math.random() * 22 - 11); g.lineTo(x + Math.random() * 22 - 11, y + Math.random() * 22 - 11); g.fill(); } });
  foil.repeat.set(30, 2);
  const foilBump = grain(128, 1200, 0.9, 260); foilBump.repeat.set(30, 2);
  const foilM = std({ map: foil, bumpMap: foilBump, bumpScale: 1.4, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.5 });
  const collars = [];
  for (let k = 0; k < 4; k++) {
    const z = z0 + D * (0.13 + k * 0.245), duct = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, W - 20, 14), foilM);
    duct.rotation.z = Math.PI / 2; duct.position.set(cx, H - 4.4, z); scene.add(duct);
    for (let x = x0 + 30; x < x1 - 20; x += 50) collars.push([x, H - 4.4, z, Math.PI / 2]);
    for (const dz of [14, -19]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(dz > 0 ? 0.45 : 0.3, dz > 0 ? 0.45 : 0.3, W - 10, 8), dz > 0 ? mat.red : mat.black); p.rotation.z = Math.PI / 2; p.position.set(cx, H - (dz > 0 ? 8.5 : 6.5), z + dz); scene.add(p); }
  }
  inst(new THREE.TorusGeometry(3.25, 0.2, 6, 16), mat.black, collars);
  // orange perforated cable trays, both directions
  const perf = canvasTex(64, 64, (g, w, h) => { g.fillStyle = TRAY; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(60,15,0,.55)'; for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); } });
  const trayM = (rx, rz) => { const t = perf.clone(); t.repeat.set(rx, rz); t.needsUpdate = true; return phys({ map: t, roughness: 0.4, metalness: 0.2, clearcoat: 0.3 }); };
  for (let z = z0 + 40; z < z1 - 30; z += 84) { const t = new THREE.Mesh(new THREE.BoxGeometry(W - 30, 0.45, 5.5), trayM((W - 30) / 3, 2)); t.position.set(cx, H - 10.2, z); scene.add(t); }
  for (let x = x0 + 70; x < x1 - 40; x += 150) { const t = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.45, D - 30), trayM(2, (D - 30) / 3)); t.position.set(x, H - 11.4, cz); scene.add(t); }
  // skylight panels, AC cassettes, linear lights and black pendant lamps
  const skyTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9d3e2'; g.lineWidth = 4; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } }, false);
  const skyM = basic({ map: skyTex });
  for (const [fx, fz] of [[0.22, 0.3], [0.62, 0.72], [0.8, 0.22], [0.36, 0.82]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), skyM); p.rotation.x = Math.PI / 2; p.position.set(x0 + W * fx, H - 0.2, z0 + D * fz); scene.add(p); }
  const acTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#eef0f3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8f96a3'; g.lineWidth = 2; for (let i = 8; i < 30; i += 5) g.strokeRect(i, i, w - 2 * i, h - 2 * i); }, false);
  const ac = [], bars = [], lamps = [], rods = [];
  for (let x = x0 + 36; x < x1 - 20; x += 66) for (let z = z0 + 26; z < z1 - 12; z += 50) {
    bars.push([x, H - 7.5, z]);
    if ((Math.round(x + z) & 1) === 0) ac.push([x + 30, H - 0.5, z + 22]);
    lamps.push([x + 18, H - 9, z - 16]); rods.push([x + 18, H - 4.5, z - 16]);
  }
  inst(new THREE.BoxGeometry(30, 0.45, 1.5), mat.light, bars);
  inst(new THREE.BoxGeometry(9, 0.9, 9), [mat.white, mat.white, mat.white, basic({ map: acTex }), mat.white, mat.white], ac);
  inst(new THREE.ConeGeometry(2.1, 2.3, 14, 1, true), phys({ color: '#141519', roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }), lamps);
  inst(new THREE.SphereGeometry(0.9, 10, 8), mat.light, lamps.map(l => [l[0], l[1] - 0.7, l[2]]));
  inst(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), mat.black, rods);
  // coloured rectangles painted on the concrete soffit, flat LED panels, and black track spotlights
  const patch = { '#d23a34': [], '#f0c628': [], '#2f55c8': [] }, pk = Object.keys(patch);
  for (let i = 0; i < 170; i++) patch[pk[i % 3]].push([x0 + 10 + rand() * (W - 20), H - 0.12, z0 + 10 + rand() * (D - 20), 0, Math.PI / 2]);
  for (const k of pk) inst(new THREE.PlaneGeometry(7, 2.4), basic({ color: k }), patch[k]);
  inst(new THREE.PlaneGeometry(17, 8.5), mat.light, bars.map(b => [b[0] + 33, H - 0.3, b[2] + 4, 0, Math.PI / 2]));
  const spots = [];
  for (let x = x0 + 58; x < x1 - 30; x += 132) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, D - 40), mat.black); rail.position.set(x, H - 6, cz); scene.add(rail); for (let z = z0 + 30; z < z1 - 24; z += 17) spots.push([x, H - 7.2, z]); }
  inst(new THREE.CylinderGeometry(0.55, 0.55, 2, 10), mat.black, spots);

  // --- black arched trusses spanning the course (the barrel-vault steelwork from the photos)
  const struts = [];
  const gapA = Infinity; // arches removed: the real steelwork is straight — the curves in the 360° photos were lens distortion
  for (let i = Math.round(gapA * 0.6); i < N - gapA / 2; i += gapA) {
    const s = samples[i], R = half + 6.5;
    if ([1, -1].some(sg => roadClearance(track, s.x + s.nx * sg * R, s.z + s.nz * sg * R) < 2.5)) continue;
    const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); g.rotation.y = s.heading; scene.add(g);
    for (const [r, dz] of [[R, -0.9], [R, 0.9], [R - 1.7, -0.9], [R - 1.7, 0.9]]) { const a = new THREE.Mesh(new THREE.TorusGeometry(r, 0.24, 6, 30, Math.PI), mat.black); a.position.z = dz; a.castShadow = true; g.add(a); }
    g.updateMatrixWorld(true);
    for (let k = 0; k < 22; k++) { // zig-zag web between the chords
      const a = (k + 0.5) / 22 * Math.PI, o = new THREE.Object3D(); o.position.set(Math.cos(a) * (R - 0.85), Math.sin(a) * (R - 0.85), k % 2 ? 0.9 : -0.9); o.rotation.z = a + (k % 2 ? 0.6 : -0.6); g.add(o); o.updateWorldMatrix(true, false); struts.push(o.matrixWorld.clone()); g.remove(o);
    }
  }
  if (struts.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.2, 0.2), mat.black, struts.length); struts.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im); }

  // --- placement: every prop keeps its whole footprint outside the yellow lines and the shortcut lanes,
  //     but as close to them as possible so the office feels tight around the karts
  const placed = [];
  const fits = (x, z, ry, w, d, margin) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let lx = -w / 2; lx <= w / 2 + 0.01; lx += Math.min(3, w)) for (let lz = -d / 2; lz <= d / 2 + 0.01; lz += Math.min(3, d)) {
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      if (wx < x0 + 3 || wx > x1 - 3 || wz < z0 + 3 || wz > z1 - 3 || roadClearance(track, wx, wz) < margin) return false;
    }
    return true;
  };
  const spot = (w, d, margin = 2.2, near = 46, outline = false) => {
    const r = Math.hypot(w, d) / 2;
    for (let t = 0; t < 900; t++) {
      const x = x0 + 6 + rand() * (W - 12), z = z0 + 6 + rand() * (D - 12), ry = Math.floor(rand() * 4) * Math.PI / 2;
      if (roadClearance(track, x, z) > near + r) continue;
      if (!fits(x, z, ry, w, d, margin) || !placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r + 1.5)) continue;
      placed.push({ x, z, r });
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); g.updateMatrixWorld(true);
      if (outline) { // yellow floor line around the zone, like the guide lines in the office
        for (const [bw, bd, bx, bz] of [[w + 1.6, 0.6, 0, d / 2 + 0.8], [w + 1.6, 0.6, 0, -d / 2 - 0.8], [0.6, d + 1.6, w / 2 + 0.8, 0], [0.6, d + 1.6, -w / 2 - 0.8, 0]]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), yellowFlat); l.rotation.x = -Math.PI / 2; l.position.set(bx, 0.03, bz); g.add(l); }
      }
      return g;
    }
    return null;
  };
  const add = (g, geo, m, x, y, z, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; g.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // instanced furniture
  const batch = {}, dummy = new THREE.Object3D();
  const part = (k, geo, m) => { batch[k] = { geo, m, list: [] }; };
  const put = (g, k, x, y, z, ry = 0, rx = 0, rz = 0, sc = 1) => { dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz, 'YXZ'); dummy.scale.setScalar(sc); g.add(dummy); dummy.updateWorldMatrix(true, false); batch[k].list.push(dummy.matrixWorld.clone()); g.remove(dummy); };
  part('seat', B(4.4, 0.7, 4.4), mat.fabric); part('back', B(4.2, 5.6, 0.5), mat.fabric);
  part('stem', new THREE.CylinderGeometry(0.28, 0.28, 4, 8), mat.chrome); part('base', new THREE.CylinderGeometry(2.6, 2.9, 0.3, 5), mat.chrome);
  part('arm', B(0.4, 0.4, 3.4), mat.chrome);
  part('desk', B(20, 0.5, 8.5), mat.white); part('leg', B(0.5, 7.3, 0.5), mat.black);
  part('mon', B(6, 3.5, 0.3), mat.plastic); part('mstand', new THREE.CylinderGeometry(0.2, 0.8, 1.4, 8), mat.plastic);
  const scrTex = canvasTex(128, 72, (g, w, h) => { g.fillStyle = '#16181d'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { g.fillStyle = ['#6fb7ff', '#c9a6ff', '#8fe38f', '#ffffff', '#ffb86b'][i % 5]; g.fillRect(8 + (i % 3) * 6, 8 + i * 7, 20 + Math.random() * 70, 3); } }, false);
  part('scr', new THREE.PlaneGeometry(5.6, 3.1), basic({ map: scrTex }));
  part('leafA', B(0.95, 0.1, 6.4), phys({ color: '#4f9e3a', roughness: 0.45, clearcoat: 0.4 })); part('leafB', B(0.75, 0.1, 5.6), phys({ color: '#9ad36a', roughness: 0.45, clearcoat: 0.4 }));
  const chair = (g, x, z, ry) => { put(g, 'base', x, 0.2, z); put(g, 'stem', x, 2.2, z); put(g, 'seat', x, 4.4, z, ry); put(g, 'back', x - Math.sin(ry) * 2.2, 7.4, z - Math.cos(ry) * 2.2, ry, -0.12); for (const s of [-1, 1]) put(g, 'arm', x + Math.cos(ry) * 2.3 * s, 6, z - Math.sin(ry) * 2.3 * s, ry); };
  const desk = (g, x, z, facing) => {
    put(g, 'desk', x, 7.55, z); for (const [lx, lz] of [[-9.5, -3.8], [9.5, -3.8], [-9.5, 3.8], [9.5, 3.8]]) put(g, 'leg', x + lx, 3.65, z + lz);
    for (const mx of [-5, 5]) { put(g, 'mstand', x + mx, 8.5, z - facing * 2.4); put(g, 'mon', x + mx, 10.8, z - facing * 2.4); put(g, 'scr', x + mx, 10.8, z - facing * 2.4 + facing * 0.17, facing > 0 ? 0 : Math.PI); chair(g, x + mx, z + facing * 7.5, facing > 0 ? Math.PI : 0); }
  };
  // dracaena: thin trunk with a tuft of long arching two-tone leaves
  const dracaena = (g, x, z, ph) => {
    add(g, new THREE.CylinderGeometry(0.28, 0.42, ph, 6), mat.trunk, x, 5 + ph / 2, z);
    for (const [ty, n] of [[5 + ph, 13], [5 + ph * 0.72, 7]]) for (let l = 0; l < n; l++) { const a = l / n * Math.PI * 2 + rand(), droop = 0.25 + rand() * 0.75; put(g, l % 2 ? 'leafA' : 'leafB', x + Math.sin(a) * 2.6 * Math.cos(droop), ty + 1.6 - droop * 1.6, z + Math.cos(a) * 2.6 * Math.cos(droop), a, droop - 0.55); }
  };
  const glowTex = canvasTex(128, 128, (g, w) => { const c = w / 2, gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(198,24,242,.5)'); gr.addColorStop(1, 'rgba(198,24,242,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, false);
  const glowM = basic({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const slatTex = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#c9772e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(90,45,10,${0.1 + Math.random() * 0.25})`; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(20, y + 3, 44, y - 3, w, y + 1); g.stroke(); } });
  const woodM = std({ map: slatTex, roughness: 0.65 });
  // hexagonal yellow planter + matching hood with wooden slats and purple grow lamps
  const planter = (g, x, z, r = 7.5) => {
    add(g, new THREE.CylinderGeometry(r, r * 0.92, 5, 6), mat.yellow, x, 2.5, z); add(g, new THREE.CylinderGeometry(r - 0.7, r - 0.7, 0.4, 6), mat.soil, x, 5, z, false);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + rand(); dracaena(g, x + Math.sin(a) * r * 0.42, z + Math.cos(a) * r * 0.42, 9 + rand() * 8); }
    add(g, new THREE.CylinderGeometry(r + 0.6, r + 0.6, 3.2, 6, 1, true), powder(YELLOW, { side: THREE.DoubleSide }), x, 28.6, z);
    add(g, new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.3, 6), woodM, x, 29.6, z, false);
    for (let k = -2; k <= 2; k++) add(g, B(r * 1.7, 0.5, 0.5), woodM, x, 28.2, z + k * 2.4, false);
    for (const [lx, lz] of [[-2.4, 0], [2.4, 1.2], [0, -2.6]]) add(g, new THREE.SphereGeometry(0.9, 10, 8), mat.purple, x + lx, 27.6, z + lz, false);
    for (const [lx, lz] of [[-r * 0.7, 0], [r * 0.7, 0]]) add(g, new THREE.CylinderGeometry(0.14, 0.14, H - 30, 5), mat.black, x + lx, 30 + (H - 30) / 2, z + lz, false);
    const gl = add(g, new THREE.PlaneGeometry(r * 5.5, r * 5.5), glowM, x, 0.06, z, false); gl.rotation.x = -Math.PI / 2;
  };

  // --- round-cornered cobalt meeting rooms with bright blue glass
  const lettering = text => { const t = canvasTex(512, 96, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = 'italic 300 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = 'rgba(190,225,255,.95)'; g.lineWidth = 2.2; g.strokeText(text, w / 2, h / 2); }, false); return basic({ map: t, transparent: true, depthWrite: false }); };
  const chevTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = BLUE; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(60, 30); g.lineTo(120, 30); g.lineTo(200, 128); g.lineTo(120, 226); g.lineTo(60, 226); g.lineTo(140, 128); g.closePath(); g.fill(); g.fillStyle = LIGHTBLUE; g.beginPath(); g.moveTo(10, 60); g.lineTo(40, 60); g.lineTo(96, 128); g.lineTo(40, 196); g.lineTo(10, 196); g.lineTo(66, 128); g.closePath(); g.fill(); }, false);
  const clock = (g, x, y, z) => { const c = add(g, new THREE.CylinderGeometry(1.5, 1.5, 0.3, 20), mat.white, x, y, z, false); c.rotation.x = Math.PI / 2; add(g, new THREE.TorusGeometry(1.5, 0.14, 6, 20), mat.black, x, y, z + 0.1, false); add(g, B(0.14, 1.1, 0.08), mat.black, x, y + 0.45, z + 0.2, false); add(g, B(0.8, 0.14, 0.08), mat.black, x + 0.35, y, z + 0.2, false); };
  const filmA = basic({ color: FILM, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }), filmB = basic({ color: FRAME, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const w = 58, d = 44, h = 27, r = 1.6, g = spot(w + 3, d + 3, 2.2, 46, true); if (!g) break;
    add(g, slab(w - 1, d - 1, r, 0.3), mat.carpet, 0, 0, 0, false).receiveShadow = true;
    add(g, band(w, d, r, 1.3, 1.8), mat.frame, 0, 0, 0);
    add(g, band(w - 0.8, d - 0.8, r - 0.4, 0.35, h - 5.4), mat.glass, 0, 1.8, 0, false);
    add(g, band(w, d, r, 1.3, 3.6), mat.frame, 0, h - 3.6, 0); add(g, slab(w, d, r, 0.6), mat.frame, 0, h, 0);
    const lt = add(g, new THREE.PlaneGeometry(34, 6.4), lettering(i % 3 === 2 ? 'FOCUS ROOM' : 'MEETING ROOM'), 0, h - 8.5, d / 2 + 0.25, false); lt.renderOrder = 3;
    add(g, new THREE.CylinderGeometry(0.22, 0.22, 9, 6), mat.chrome, 9, 9, d / 2 + 0.6, false); // door handle
    for (const [fx, fy, rot, fw, fh, m] of [[-17, 10, 0.42, 12, 22, filmA], [16, 13, -0.6, 15, 13, filmB], [-27, 16, -0.3, 8, 12, filmB]]) { const f = add(g, new THREE.PlaneGeometry(fw, fh), m, fx, fy, d / 2 + 0.3, false); f.rotation.z = rot; f.renderOrder = 2; }
    add(g, B(w - 2 * r, h - 5.4, 0.8), [mat.blue, mat.blue, mat.blue, mat.blue, std({ map: chevTex, roughness: 0.6 }), mat.blue], 0, 1.8 + (h - 5.4) / 2, -d / 2 + 2.2, false);
    clock(g, -w / 2 + r + 5, h - 9, -d / 2 + 2.7);
    add(g, B(28, 0.7, 11), mat.white, 0, 7.5, 2); for (const lx of [-11, 11]) add(g, B(1, 7.2, 7), mat.white, lx, 3.6, 2);
    for (const cxx of [-9, 0, 9]) { chair(g, cxx, 11, Math.PI); chair(g, cxx, -7, 0); }
    for (let k = 0; k < 4; k++) add(g, B(3.6, 0.6, 3.6), mat.black, -w / 2 + 8, 0.6 + k * 1.1, 8, false); // the stack of stools
    for (const [sx, sz] of [[-10, -6], [10, -6], [-10, 8], [10, 8], [0, 1]]) add(g, B(3, 0.2, 3), mat.light, sx, h - 0.2, sz, false);
  }

  // --- curved orange walls: TV, two wall clocks, three black bar stools on chrome bases, black arch above
  const tvTex = canvasTex(512, 288, (g, w, h) => {
    g.fillStyle = '#eaf3ff'; g.fillRect(0, 0, w, h); g.fillStyle = BLUE; g.fillRect(0, 0, w, 44);
    g.fillStyle = '#fff'; g.font = '700 26px system-ui, sans-serif'; g.fillText((cfg.company || cfg.eventName || '').toUpperCase(), 16, 31);
    for (const [x, y, r, c] of [[110, 160, 62, BLUE], [250, 150, 44, '#2f6bff'], [350, 190, 28, LIGHTBLUE], [430, 130, 36, ORANGE]]) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText((cfg.eventName || 'YEP').toUpperCase().split(' ')[0], 110, 170);
  }, false);
  const orangeD = paint(ORANGE, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const g = spot(46, 32, 2.2, 46, true); if (!g) break;
    add(g, B(42, 30, 2), orangeD, 0, 15, 7).receiveShadow = true; add(g, B(9, 21, 0.4), paint('#c96a1c'), 13, 10.5, 8.1, false);
    add(g, B(20, 11.5, 0.5), mat.plastic, -2, 15, 8.3); add(g, new THREE.PlaneGeometry(19, 10.5), basic({ map: tvTex }), -2, 15, 8.6, false);
    clock(g, -16, 24, 8.2); clock(g, -11.5, 24, 8.2);
    for (const sx of [-9, -2, 5]) { add(g, B(3.4, 0.7, 3.4), mat.leather, sx, 8.4, 14); add(g, B(3.4, 3, 0.5), mat.leather, sx, 10, 12.4); add(g, new THREE.CylinderGeometry(0.28, 0.28, 8, 6), mat.chrome, sx, 4.2, 14); add(g, new THREE.CylinderGeometry(2, 2.1, 0.3, 14), mat.chrome, sx, 0.2, 14); }
  }

  // --- blue walls with big white numerals, and free-standing "A" walls
  for (let n = 1; n <= 6; n++) {
    const g = spot(38, 12); if (!g) break;
    const t = canvasTex(256, 256, (c, w, h) => { c.fillStyle = BLUE; c.fillRect(0, 0, w, h); c.fillStyle = '#f4f6ff'; c.font = '900 236px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), w / 2 - 36, h / 2 + 14); }, false);
    const face = std({ map: t, roughness: 0.6, bumpMap: paintBump, bumpScale: 0.2 });
    add(g, B(34, 30, 9), [mat.blue, mat.blue, mat.blue, mat.blue, face, face], 0, 15, 0).receiveShadow = true;
  }
  const aTex = canvasTex(512, 384, (g, w, h) => { g.fillStyle = BLUE; g.fillRect(0, 0, w, h); g.fillStyle = LIGHTBLUE; g.beginPath(); g.moveTo(0, h); g.lineTo(80, h); g.lineTo(230, 0); g.lineTo(150, 0); g.closePath(); g.fill(); drawA(g, 150, 356, 310); }, false);
  for (let i = 0; i < 8; i++) { const g = spot(42, 6); if (!g) break; const f = std({ map: aTex, roughness: 0.6, bumpMap: paintBump, bumpScale: 0.2 }); add(g, B(40, 30, 3), [mat.blue, mat.blue, mat.blue, mat.blue, f, f], 0, 15, 0).receiveShadow = true; }

  // --- planters (many, right at the edge of the course)
  for (let i = 0; i < 22; i++) { const g = spot(17, 17, 2.2, 16); if (!g) break; planter(g, 0, 0); }

  // --- workstation pods: black frame, white end panels, twin LED bars, rows of white desks
  for (let i = 0; i < 18; i++) {
    const w = 50, d = 36, h = 24, g = spot(w + 3, d + 3, 2.2, 46, true); if (!g) break;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(g, B(0.8, h, 0.8), mat.black, sx * w / 2, h / 2, sz * d / 2);
    for (const sz of [1, -1]) add(g, B(w, 0.8, 0.8), mat.black, 0, h, sz * d / 2);
    for (const sx of [1, -1, 0]) add(g, B(0.8, 0.8, d), mat.black, sx * w / 2, h, 0);
    for (const sz of [1, -1]) { const p = add(g, B(1, h - 1, d * 0.42), mat.white, -w / 2, (h - 1) / 2, sz * d * 0.27); p.receiveShadow = true; add(g, B(1.15, h - 1, 0.5), mat.black, -w / 2, (h - 1) / 2, sz * (d * 0.48), false); }
    for (const z of [-4.5, 4.5]) { add(g, B(w - 8, 0.35, 0.9), mat.light, 0, h - 3.2, z, false); for (const x of [-w / 2 + 6, w / 2 - 6]) add(g, new THREE.CylinderGeometry(0.06, 0.06, 3.2, 4), mat.black, x, h - 1.6, z, false); }
    for (const x of [-12, 12]) { desk(g, x, -6.2, -1); desk(g, x, 6.2, 1); }
  }
  for (let i = 0; i < 12; i++) { const g = spot(22, 22); if (!g) break; desk(g, 0, 0, 1); }

  // --- charcoal lockers with yellow numbered doors
  for (let i = 0; i < 7; i++) {
    const g = spot(38, 10, 2.2, 46, true); if (!g) break;
    const t = canvasTex(512, 384, (c, w, h) => {
      c.fillStyle = CHARCOAL; c.fillRect(0, 0, w, h); c.fillStyle = YELLOW; c.fillRect(22, 14, w - 44, h - 28);
      c.fillStyle = '#dcb70f'; c.font = 'italic 900 80px system-ui, sans-serif'; c.textAlign = 'left';
      [['DELIVER WORKING', 'SOFTWARE', 'FREQUENTLY', 'SHORTER'], ['FROM A COUPLE', 'OF WEEKS', 'TO A COUPLE', 'OF MONTHS'], ['INDIVIDUALS', 'INTERACTIONS', 'WORKING', 'TOGETHER']][i % 3].forEach((t, k) => c.fillText(t, 32, 92 + k * 88, w - 64));
      const cw = (w - 44) / 6, ch = (h - 28) / 4;
      c.strokeStyle = 'rgba(60,50,0,.3)'; c.lineWidth = 2; c.font = 'italic 800 30px system-ui, sans-serif'; c.textAlign = 'right';
      for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) { c.strokeRect(22 + q * cw, 14 + r * ch, cw, ch); c.fillStyle = '#2f55c8'; c.fillText(String(127 + i * 24 + r * 6 + q), 22 + (q + 1) * cw - 8, 14 + (r + 1) * ch - 10); c.fillStyle = '#b9bcc2'; c.beginPath(); c.arc(22 + q * cw + 10, 14 + r * ch + ch / 2, 3.5, 0, 7); c.fill(); }
    }, false);
    const face = phys({ map: t, roughness: 0.38, metalness: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.4 });
    add(g, B(36, 27, 7), [mat.charcoal, mat.charcoal, mat.charcoal, mat.charcoal, face, face], 0, 13.5, 0).receiveShadow = true;
  }

  // --- dark round columns on hexagonal bases, ringed by yellow floor arcs
  for (let i = 0; i < 14; i++) {
    const g = spot(7, 7, 4, 30); if (!g) break;
    add(g, new THREE.CylinderGeometry(2.5, 2.5, H, 18), mat.column, 0, H / 2, 0); add(g, new THREE.CylinderGeometry(3.6, 4.4, 2.6, 6), mat.charcoal, 0, 1.3, 0);
    for (const a of [0.4, 2.6, 4.5]) { const ring = add(g, new THREE.RingGeometry(6.2, 6.9, 28, 1, a, 1.2), yellowFlat, 0, 0.05, 0, false); ring.rotation.x = -Math.PI / 2; }
  }

  // --- the black vintage motorbike
  for (let i = 0; i < 2; i++) {
    const g = spot(26, 12, 2.5, 20); if (!g) break;
    for (const z of [-8, 8]) { const wh = add(g, new THREE.TorusGeometry(3.3, 0.9, 8, 20), mat.rubber, 0, 4.2, z); wh.rotation.y = Math.PI / 2; add(g, new THREE.CylinderGeometry(2.6, 2.6, 0.2, 14), mat.chrome, 0, 4.2, z, false).rotation.z = Math.PI / 2; }
    add(g, B(2.4, 3, 8), mat.black, 0, 6, 0); add(g, new THREE.SphereGeometry(1.9, 12, 10), phys({ color: '#0d0d10', roughness: 0.15, metalness: 0.6, clearcoat: 1 }), 0, 8.6, 2.6).scale.set(0.8, 0.75, 1.5); add(g, B(2.4, 1.1, 7.5), mat.leather, 0, 8.9, -3.4);
    add(g, new THREE.CylinderGeometry(0.28, 0.28, 7.5, 6), mat.chrome, 0, 8.3, 7).rotation.x = -0.45; add(g, new THREE.CylinderGeometry(0.22, 0.22, 6.4, 6), mat.chrome, 0, 11.6, 5.5).rotation.z = Math.PI / 2;
    add(g, new THREE.SphereGeometry(1.05, 10, 8), basic({ color: '#fff6c9' }), 0, 9.9, 7.3, false); add(g, new THREE.CylinderGeometry(0.42, 0.5, 8, 8), mat.chrome, 1.5, 4.4, -5).rotation.x = Math.PI / 2; add(g, B(2.6, 0.3, 4.4), mat.black, 0, 7.8, -8.4);
  }

  // --- server room: orange frame, glass, black racks with vertical blue light, "SERVER" down the corner
  {
    const g = spot(52, 42, 2.2, 46, true);
    if (g) {
      const w = 48, d = 38, h = 27;
      add(g, B(w + 2, 2, d + 2), mat.orange, 0, h + 1, 0); for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(g, B(2.2, h, 2.2), mat.orange, sx * w / 2, h / 2, sz * d / 2);
      add(g, B(w, h, 1), mat.orange, 0, h / 2, -d / 2); add(g, B(1, h, d), mat.orange, -w / 2, h / 2, 0);
      const sg = phys({ color: '#2230ff', roughness: 0.03, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, envMapIntensity: 1.8 });
      add(g, new THREE.PlaneGeometry(w, h), sg, 0, h / 2, d / 2, false); add(g, new THREE.PlaneGeometry(d, h), sg, w / 2, h / 2, 0, false).rotation.y = Math.PI / 2;
      const rackGlow = basic({ color: '#3d5bff' });
      for (const x of [-14, 0, 14]) { add(g, B(8, 21, 10), mat.black, x, 10.5, -6); for (const dx of [-2.6, 0, 2.6]) add(g, B(0.5, 19, 0.3), rackGlow, x + dx, 10.5, -0.8, false); }
      const st = canvasTex(64, 256, (c, w2, h2) => { c.fillStyle = ORANGE; c.fillRect(0, 0, w2, h2); c.save(); c.translate(w2 / 2, h2 / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#a85410'; c.font = '900 50px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SERVER', 0, 2); c.restore(); }, false);
      add(g, B(2.4, h, 0.3), std({ map: st }), w / 2, h / 2, d / 2 + 1.2, false);
    }
  }

  // --- reception: blue back wall and angled blue desk with the company name, TV, white orchids
  const company = (cfg.company || '').toUpperCase();
  {
    const g = spot(62, 32, 2.2, 40, true);
    if (g) {
      const brandName = (company || (cfg.eventName || '').toUpperCase()).replace(/A/g, '\u039b');
      const nameTex = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#f6f7f9'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a2f3a'; c.font = '300 64px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(brandName.split('').join('\u200a'), w / 2, h / 2 + 3, w - 40); }, false);
      const recTex = canvasTex(1024, 512, (c, w, h) => {
        c.fillStyle = BLUE; c.fillRect(0, 0, w, h); c.fillStyle = CREAM; c.textAlign = 'left';
        c.font = '300 92px system-ui, sans-serif'; c.fillText(brandName.split('').join('\u200a'), 150, 190, 640);
        c.font = '400 52px system-ui, sans-serif'; c.fillText('\u25b8 Focusing on your agility', 150, 262, 640);
        c.font = '400 26px system-ui, sans-serif'; c.fillText('HCMC  |  DA NANG  |  CAN THO  |  SAN FRANCISCO  |  LUCERNE', 150, 340, 640);
        c.font = '400 34px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(cfg.website || 'axonactive.com', 470, 420);
        // mountain strip with the Swiss flag on the right
        const mx = 860, sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#2f7fe0'); sky.addColorStop(0.6, '#cfe6ff'); c.fillStyle = sky; c.fillRect(mx, 0, w - mx, h);
        c.fillStyle = '#f4f8ff'; c.beginPath(); c.moveTo(mx, 300); c.lineTo(mx + 50, 150); c.lineTo(mx + 90, 230); c.lineTo(mx + 130, 120); c.lineTo(w, 260); c.lineTo(w, h); c.lineTo(mx, h); c.fill();
        c.fillStyle = '#3f7a45'; c.beginPath(); c.moveTo(mx, 400); c.lineTo(mx + 80, 340); c.lineTo(w, 390); c.lineTo(w, h); c.lineTo(mx, h); c.fill();
        c.fillStyle = '#d5d8dc'; c.fillRect(mx + 96, 180, 4, 300); c.fillStyle = '#e02a2a'; c.fillRect(mx + 30, 190, 66, 66); c.fillStyle = '#fff'; c.fillRect(mx + 56, 202, 14, 42); c.fillRect(mx + 42, 216, 42, 14);
      }, false);
      const nm = std({ map: nameTex, roughness: 0.4 });
      const dk = add(g, B(32, 11, 6), [mat.white, mat.white, mat.white, mat.white, nm, mat.white], 2, 5.5, 8); dk.rotation.y = -0.12; add(g, B(32, 0.5, 0.6), basic({ color: '#dff1ff' }), 2, 0.6, 11.3, false).rotation.y = -0.12;
      add(g, B(58, 30, 2), [mat.blue, mat.blue, mat.blue, mat.blue, std({ map: recTex, roughness: 0.7 }), mat.blue], 0, 15, -12);
      add(g, B(11, 6.5, 0.5), mat.plastic, -23.5, 9, -10.8); add(g, new THREE.PlaneGeometry(10.2, 5.8), basic({ map: tvTex }), -23.5, 9, -10.5, false);
      add(g, new THREE.CylinderGeometry(2.2, 1.6, 3, 12), mat.white, -22, 1.5, 10); for (let k = 0; k < 9; k++) add(g, new THREE.SphereGeometry(1.1, 8, 6), mat.white, -22 + (rand() - 0.5) * 6, 5 + rand() * 4, 10 + (rand() - 0.5) * 5, false);
      chair(g, -4, 2, 0); chair(g, 9, 2, 0);
    }
  }

  // --- mountain mural wall with the blue bench
  {
    const g = spot(70, 12, 2.2, 46, true);
    if (g) {
      const mural = canvasTex(512, 256, (c, w, h) => {
        const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#2b6fd6'); sky.addColorStop(1, '#bfe2ff'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
        for (const [base, col, amp] of [[150, '#eef5ff', 85], [185, '#9fc3ea', 60], [222, '#3f7f4f', 26]]) { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 14) c.lineTo(x, base - Math.abs(Math.sin(x * 0.021 + base)) * amp - Math.random() * 8); c.lineTo(w, h); c.fill(); }
      }, false);
      const mf = std({ map: mural, roughness: 0.7 });
      add(g, B(66, 28, 2), [mat.white, mat.white, mat.white, mat.white, mf, mf], 0, 14, 0);
      const cushion = std({ color: BLUE, roughness: 0.95, bumpMap: fabricBump, bumpScale: 0.7 });
      add(g, B(50, 3, 6), cushion, 0, 4.5, 4.5); add(g, B(50, 7, 1.5), cushion, 0, 9.5, 2); add(g, B(50, 3, 5.4), mat.charcoal, 0, 1.5, 4.5);
    }
  }

  // --- the cyclo on display (black frame, blue seat and canopy)
  {
    const g = spot(22, 18, 2.5, 24);
    if (g) {
      for (const x of [-6.5, 6.5]) { const wh = add(g, new THREE.TorusGeometry(5, 0.4, 6, 24), mat.rubber, x, 5.4, 4); wh.rotation.y = Math.PI / 2; for (let k = 0; k < 6; k++) { const sp = add(g, B(0.1, 9.6, 0.1), mat.chrome, x, 5.4, 4, false); sp.rotation.x = k * Math.PI / 6; } }
      const rear = add(g, new THREE.TorusGeometry(4.6, 0.4, 6, 24), mat.rubber, 0, 5, -9); rear.rotation.y = Math.PI / 2;
      const seat = std({ color: BLUE, roughness: 0.9, bumpMap: fabricBump, bumpScale: 0.7 });
      add(g, B(10.5, 1.4, 8), seat, 0, 6.6, 4.5); add(g, B(10.5, 7.5, 1.4), seat, 0, 10.5, 0.8); add(g, B(11.6, 0.6, 10), seat, 0, 18, 3.4); add(g, B(11.6, 2, 0.5), seat, 0, 17, 8.2);
      for (const x of [-5.5, 5.5]) { add(g, new THREE.CylinderGeometry(0.18, 0.18, 11.5, 6), mat.black, x, 12.2, -0.3); add(g, new THREE.CylinderGeometry(0.18, 0.18, 11, 6), mat.black, x, 12.6, 7.8); }
      add(g, new THREE.CylinderGeometry(0.28, 0.28, 12, 6), mat.black, 0, 7.5, -4).rotation.x = 0.9; add(g, B(2, 0.8, 3), mat.leather, 0, 11.2, -8);
    }
  }

  // --- the big 3D brand letter with the little waiting corner (round white table, two light-blue shell chairs)
  const lam = new THREE.Shape(); lam.moveTo(0, 0); lam.lineTo(4.4, 0); lam.lineTo(9, 14.6); lam.lineTo(13.6, 0); lam.lineTo(18, 0); lam.lineTo(11.2, 21); lam.lineTo(6.8, 21); lam.closePath();
  const lamGeo = new THREE.ExtrudeGeometry(lam, { depth: 4.5, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 }).translate(-9, 0, -2.25);
  const shell = phys({ color: '#7fd6df', roughness: 0.35, clearcoat: 0.6 });
  for (let i = 0; i < 4; i++) {
    const g = spot(34, 14, 2.2, 26); if (!g) break;
    add(g, lamGeo, mat.blue, 7, 0, -2).rotation.x = -0.06;
    add(g, new THREE.CylinderGeometry(3.6, 3.6, 0.4, 24), mat.white, -9, 7.6, 1); for (let k = 0; k < 3; k++) { const l = add(g, new THREE.CylinderGeometry(0.16, 0.22, 7.6, 6), woodM, -9 + Math.sin(k * 2.1) * 1.8, 3.8, 1 + Math.cos(k * 2.1) * 1.8); l.rotation.set(Math.cos(k * 2.1) * 0.18, 0, -Math.sin(k * 2.1) * 0.18); }
    for (const cx2 of [-14.5, -4]) { add(g, B(3.8, 0.5, 3.8), shell, cx2, 4.4, -3.2); add(g, B(3.8, 3.6, 0.5), shell, cx2, 6.4, -5); for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) add(g, new THREE.CylinderGeometry(0.14, 0.14, 4.2, 5), woodM, cx2 + lx, 2.1, -3.2 + lz, false); }
  }
  // --- white bookshelves full of books
  const bookM = ['#e6b422', '#d23a34', '#2f55c8', '#f4f4f0', '#2f9a6a', '#f08a2c'].map(c => std({ color: c, roughness: 0.7 }));
  for (let i = 0; i < 5; i++) {
    const g = spot(24, 8, 2.2, 30); if (!g) break;
    add(g, B(22, 25, 0.6), mat.white, 0, 12.5, -2.8); for (const x of [-11, 0, 11]) add(g, B(0.6, 25, 6), mat.white, x, 12.5, 0); for (let y = 0; y <= 4; y++) add(g, B(22, 0.6, 6), mat.white, 0, 0.3 + y * 6.1, 0);
    for (let y = 0; y < 4; y++) for (const sx of [-1, 1]) { let x = sx * 10.2; const n = 4 + Math.floor(rand() * 6); for (let k = 0; k < n; k++) { const bw = 0.5 + rand() * 0.5, bh = 3.6 + rand() * 1.4; add(g, B(bw, bh, 3.6), bookM[Math.floor(rand() * 6)], x - sx * bw / 2, 0.6 + y * 6.1 + bh / 2, 0.4, false); x -= sx * (bw + 0.06); } }
  }
  // --- red fire-extinguisher cabinets and white square columns carrying a portrait poster screen
  const redM = phys({ color: '#c8262c', roughness: 0.35, clearcoat: 0.6 });
  for (let i = 0; i < 5; i++) { const g = spot(7, 6, 2.2, 22); if (!g) break; add(g, B(5.4, 11, 3.6), redM, 0, 5.5, 0); add(g, B(4.2, 7, 0.2), phys({ color: '#1b1d22', roughness: 0.1, transparent: true, opacity: 0.6 }), 0, 6.2, 1.85, false); add(g, new THREE.CylinderGeometry(0.9, 0.9, 5, 10), redM, 0, 5.2, 0.4, false); }
  const posterTex = canvasTex(256, 448, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b9a6ff'); gr.addColorStop(0.55, '#ffc7e6'); gr.addColorStop(1, '#4a8f6a'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(24, 90, w - 48, 130); c.fillStyle = '#3a3f55'; c.font = '700 26px system-ui, sans-serif'; c.textAlign = 'center'; ['Mind your', 'surroundings', 'and stay alert!'].forEach((t, k) => c.fillText(t, w / 2, 130 + k * 34)); c.fillStyle = '#f2a51c'; c.beginPath(); c.moveTo(70, 400); c.lineTo(128, 300); c.lineTo(186, 400); c.fill(); }, false);
  for (let i = 0; i < 5; i++) { const g = spot(9, 9, 3, 26); if (!g) break; add(g, B(7.5, H, 7.5), paint('#f1f2f4'), 0, H / 2, 0); add(g, B(5.6, 9.6, 0.4), mat.plastic, 0, 12, 3.9); add(g, new THREE.PlaneGeometry(5, 9), basic({ map: posterTex }), 0, 12, 4.15, false); }

  // --- text walls on the perimeter: values, "We do what we say", and the Agile quote with a blue bench
  const textWall = (x, z, ry, w, draw, opts = {}) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const t = canvasTex(1024, 512, (c, cw, ch) => { c.fillStyle = '#fbfbfd'; c.fillRect(0, 0, cw, ch); if (opts.purple) { const gr = c.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, 'rgba(198,24,242,.42)'); gr.addColorStop(0.55, 'rgba(198,24,242,0)'); c.fillStyle = gr; c.fillRect(0, 0, cw, ch); } draw(c, cw, ch); }, false);
    add(g, B(w, 34, 1), [mat.white, mat.white, mat.white, mat.white, std({ map: t, roughness: 0.6 }), mat.white], 0, 17, 0, false);
    if (opts.purple) { add(g, B(w + 2, 3, 6), mat.yellow, 0, 33, 3.2); add(g, B(w, 0.3, 4.6), mat.purple, 0, 31.4, 3.2, false); add(g, B(w + 4, 5, 9), mat.yellow, 0, 2.5, 6.5); for (let px = -w / 2 + 6; px <= w / 2 - 6; px += 9) dracaena(g, px, 6.5, 5 + rand() * 4); }
    if (opts.bench) { add(g, B(w * 0.7, 3, 6), mat.blue, 0, 4.5, 4); add(g, B(w * 0.7, 7, 1.5), mat.blue, 0, 9.5, 1.6); add(g, B(w * 0.7, 3, 5.4), mat.charcoal, 0, 1.5, 4); }
  };
  const values = Array.isArray(cfg.values) && cfg.values.length ? cfg.values.slice(0, 6).map(String) : ['OPENNESS', 'COURAGE', 'RESPECT', 'FOCUS', 'COMMITMENT'];
  textWall(cx - W * 0.2, z1 - 0.7, Math.PI, 64, (c, w, h) => { c.font = '700 70px system-ui, sans-serif'; c.textAlign = 'center'; values.forEach((v, i) => { c.fillStyle = '#1b2440'; c.fillText(v.toUpperCase(), w / 2, 118 + i * 84, w - 60); }); }, { purple: true });
  textWall(cx + W * 0.22, z1 - 0.7, Math.PI, 64, (c, w, h) => { c.textAlign = 'center'; c.font = '800 84px system-ui, sans-serif'; c.fillStyle = '#1b2440'; c.fillText('We do', w / 2, 150); c.fillText('We say', w / 2, 330); c.fillStyle = BLUE; c.font = '600 60px system-ui, sans-serif'; c.fillText('what we say', w / 2, 226); c.fillText('what we do', w / 2, 406); }, { purple: true });
  textWall(x0 + 0.7, cz, Math.PI / 2, 110, (c, w, h) => {
    c.fillStyle = '#16181d'; c.font = '500 52px system-ui, sans-serif'; c.textAlign = 'right';
    c.fillText('Our highest priority is to', w - 60, 110); c.fillText('through early and continuous delivery of', w - 60, 250);
    c.fillStyle = BLUE; c.font = '800 58px system-ui, sans-serif'; c.fillText('satisfy the customer', w - 60, 180); c.fillText('valuable software', w - 60, 322);
  }, { bench: true });

  // flush instanced furniture
  for (const k in batch) {
    const b = batch[k]; if (!b.list.length) continue;
    const im = new THREE.InstancedMesh(b.geo, b.m, b.list.length);
    b.list.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.castShadow = k !== 'scr' && !k.startsWith('leaf'); im.receiveShadow = k === 'desk';
    scene.add(im);
  }
}
