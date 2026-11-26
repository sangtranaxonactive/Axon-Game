// Builds the 3D world for a map: sky, light, road, barriers, scenery, optional scanned GLB model.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildOffice } from './office.js';
import { buildArena } from './arena.js';
import { buildCompany } from './company.js';
import { roadClearance } from './track-core.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Strip that follows the track between two lateral offsets / heights.
export function ribbon(track, offA, yA, offB, yB, vScale, skip) {
  const { samples, N, step } = track;
  const pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
  for (let i = 0; i <= N; i++) {
    const s = samples[i % N];
    pos.set([s.x + s.nx * offA, s.y + yA, s.z + s.nz * offA, s.x + s.nx * offB, s.y + yB, s.z + s.nz * offB], i * 6);
    uv.set([0, i * step / vScale, 1, i * step / vScale], i * 4);
    if (i < N && !(skip && skip(i))) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export async function buildWorld(scene, renderer, track, map, cfg) {
  const world = { update() {}, sun: null };
  const sky = map.sky || { top: '#3b6fd9', bottom: '#ffd9a8' };
  const sunCfg = map.sun || { azimuth: 40, elevation: 38, color: '#fff1d6', intensity: 2.6 };

  // --- sky dome + fog
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(sky.top) }, bottom: { value: new THREE.Color(sky.bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.6+0.08,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.6)),1.0); }',
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), skyMat);
  scene.add(dome);
  scene.fog = new THREE.Fog(new THREE.Color(sky.bottom).lerp(new THREE.Color(sky.top), 0.25), 120, 620);

  // --- lighting: image-based reflections + hemisphere + shadow-casting sun
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(map.ambient?.sky || sky.top, map.ambient?.ground || '#6b5a48', map.ambient?.intensity ?? 0.9));
  const sun = new THREE.DirectionalLight(sunCfg.color, sunCfg.intensity);
  const az = sunCfg.azimuth * Math.PI / 180, el = sunCfg.elevation * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  world.sun = sun;
  // Scenery shadows are static, so the shadow map is only redrawn when the player has moved a fair distance
  // (karts use cheap blob shadows instead). This removes most of the per-frame shadow cost on phones.
  sun.shadow.autoUpdate = false;
  const lastShadow = new THREE.Vector3(1e9, 0, 1e9);
  world.update = focus => {
    if (Math.abs(focus.x - lastShadow.x) + Math.abs(focus.z - lastShadow.z) < 14) return;
    lastShadow.copy(focus);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 130);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    sun.shadow.needsUpdate = true;
  };

  // --- road
  const half = track.half;
  const roadCfg = map.road || { visible: true };
  if (roadCfg.visible !== false) {
    const roadTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = roadCfg.color || '#3a3d46'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { // asphalt grain
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#f4f4f0'; g.fillRect(12, 0, 5, h); g.fillRect(w - 17, 0, 5, h);
      g.fillStyle = '#dfefff'; g.fillRect(w / 2 - 3, 0, 6, h * 0.55);
    });
    const road = new THREE.Mesh(ribbon(track, -half, 0.02, half, 0.02, 9),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: roadCfg.roughness ?? 0.82, metalness: roadCfg.metalness ?? 0.05, side: THREE.DoubleSide,
        transparent: roadCfg.opacity != null && roadCfg.opacity < 1, opacity: roadCfg.opacity ?? 1 }));
    road.receiveShadow = true;
    scene.add(road);
  }
  if (map.barriers !== false) {
    const kerbTex = canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#e8eaf0'; g.fillRect(0, 0, w, h); g.fillStyle = '#0a84e0'; g.fillRect(0, 0, w, h / 2); });
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6, side: THREE.DoubleSide });
    const wallTex = canvasTex(128, 32, (g, w, h) => {
      g.fillStyle = '#f2f4f8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0057b8'; g.beginPath(); g.moveTo(0, 0); g.lineTo(40, 0); g.lineTo(88, h); g.lineTo(48, h); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - 5, w, 5);
    });
    wallTex.rotation = Math.PI / 2;
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
    const inMouth = sgn => i => {
      for (const o of [0, 1]) {
        const s = track.samples[(i + o) % track.N], x = s.x + s.nx * sgn * half, z = s.z + s.nz * sgn * half;
        for (const q of track.shortcuts) {
          const px = x - q.ax, pz = z - q.az, t = (px * q.ux + pz * q.uz) / q.len, d = pz * q.ux - px * q.uz;
          if (t > 0 && t < 1 && Math.abs(d) < q.hw + 0.5) return true;
        }
      }
      return false;
    };
    for (const sgn of [-1, 1]) {
      const kerb = new THREE.Mesh(ribbon(track, sgn * (half - 1.1), 0.035, sgn * half, 0.035, 3), kerbMat);
      kerb.receiveShadow = true;
      const wall = new THREE.Mesh(ribbon(track, sgn * half, 0, sgn * (half + 0.25), 0.95, 4, inMouth(sgn)), wallMat);
      wall.castShadow = true; wall.receiveShadow = true;
      const cap = new THREE.Mesh(ribbon(track, sgn * (half + 0.25), 0.95, sgn * (half + 0.7), 0, 4, inMouth(sgn)), wallMat);
      scene.add(kerb, wall, cap);
    }
    // shortcut lanes: a narrow glowing strip with its own low walls
    const laneTex = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#16233a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#35c8f5'; g.lineWidth = 7; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(12, 92); g.lineTo(32, 62); g.lineTo(52, 92); g.stroke();
      g.fillStyle = '#35c8f5'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
    });
    for (const q of track.shortcuts) {
      const laneT = laneTex.clone(); laneT.repeat.set(1, q.len / 7); laneT.needsUpdate = true;
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(q.hw * 2, q.len), new THREE.MeshStandardMaterial({ map: laneT, emissiveMap: laneT, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6 }));
      lane.rotation.set(-Math.PI / 2, 0, Math.PI + Math.atan2(q.ux, q.uz));
      lane.position.set((q.ax + q.bx) / 2, (q.ya + q.yb) / 2 + 0.045, (q.az + q.bz) / 2); lane.receiveShadow = true;
      scene.add(lane);
      // walls only where the lane is outside the main road
      let t0 = null, t1 = null;
      for (let k = 0; k <= 200; k++) {
        const t = k / 200, x = q.ax + q.ux * q.len * t, z = q.az + q.uz * q.len * t;
        let d = Infinity; for (const s of track.samples) d = Math.min(d, (s.x - x) ** 2 + (s.z - z) ** 2);
        if (Math.sqrt(d) > half + 0.6) { if (t0 === null) t0 = t; t1 = t; }
      }
      if (t0 === null) continue;
      // glowing gate at the lane entrance so it can be spotted from a distance
      const gx = q.ax + q.ux * q.len * t0, gz = q.az + q.uz * q.len * t0;
      const neon = new THREE.MeshStandardMaterial({ color: '#35c8f5', emissive: '#35c8f5', emissiveIntensity: 2.4, roughness: 0.4 });
      for (const sgn of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.6, 10), neon);
        post.position.set(gx - q.uz * sgn * (q.hw + 0.5), q.ya + 2.3, gz + q.ux * sgn * (q.hw + 0.5)); scene.add(post);
      }
      const signTex = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = '#06203f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#35c8f5'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
        g.fillStyle = '#e9fbff'; g.font = '900 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SHORTCUT', w / 2, h / 2 + 2);
      }, false);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(q.hw * 2 + 1.3, 1.25, 0.2), new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: '#ffffff', emissiveIntensity: 0.9 }));
      sign.position.set(gx, q.ya + 4.4, gz); sign.rotation.y = Math.atan2(q.ux, q.uz) + Math.PI; scene.add(sign);
      const wl = (t1 - t0) * q.len, mid = (t0 + t1) / 2 * q.len;
      const wt = wallTex.clone(); wt.repeat.set(1, wl / 4); wt.needsUpdate = true;
      const wm = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.45, metalness: 0.1 });
      for (const sgn of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.95, wl), wm);
        w.position.set(q.ax + q.ux * mid - q.uz * sgn * (q.hw + 0.18), q.ya + 0.475, q.az + q.uz * mid + q.ux * sgn * (q.hw + 0.18));
        w.rotation.y = Math.atan2(q.ux, q.uz); w.castShadow = true; w.receiveShadow = true;
        scene.add(w);
      }
    }
  }

  // --- start line + arch with the event name
  const s0 = track.samples[0];
  const startTex = canvasTex(256, 32, (g, w, h) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); }
  }, false);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 2.2), new THREE.MeshStandardMaterial({ map: startTex, roughness: 0.7 }));
  line.rotation.x = -Math.PI / 2;
  const startGroup = new THREE.Group();
  startGroup.position.set(s0.x, s0.y + 0.04, s0.z);
  startGroup.rotation.y = s0.heading;
  startGroup.add(line);
  const pillarMat = new THREE.MeshPhysicalMaterial({ color: '#e9ecf2', metalness: 0.85, roughness: 0.22, clearcoat: 0.6 });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 8.4, 16), pillarMat);
    p.position.set(sx * (half + 1.4), 4.2, 0); p.castShadow = true;
    startGroup.add(p);
  }
  const bannerTex = canvasTex(1024, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#0057b8'); gr.addColorStop(0.5, '#0a84e0'); gr.addColorStop(1, '#35c8f5');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = '900 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 10;
    g.fillText((cfg.eventName || 'YEP RACING').toUpperCase(), w / 2, h / 2 + 4, w - 60);
  }, false);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(track.width + 4.4, 2.3, 0.5),
    new THREE.MeshStandardMaterial({ map: bannerTex, emissiveMap: bannerTex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.5 }));
  banner.position.y = 7.6; banner.castShadow = true;
  startGroup.add(banner);
  scene.add(startGroup);

  // --- boost pads
  world.pads = (map.boostPads || []).map(f => Math.floor(f * track.N) % track.N);
  const padTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#0b2a4a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#35f0ff'; g.lineWidth = 14; g.lineJoin = 'round';
    for (const y of [100, 60, 20]) { g.beginPath(); g.moveTo(22, y + 20); g.lineTo(64, y - 12); g.lineTo(106, y + 20); g.stroke(); }
  }, false);
  const padMat = new THREE.MeshStandardMaterial({ map: padTex, emissiveMap: padTex, emissive: '#ffffff', emissiveIntensity: 1.3, roughness: 0.4 });
  for (const i of world.pads) {
    const s = track.samples[i];
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), padMat);
    pad.rotation.set(-Math.PI / 2, 0, Math.PI + s.heading);
    pad.position.set(s.x, s.y + 0.05, s.z);
    scene.add(pad);
  }

  // --- slow strips: red/white hazard patches; touching one slows the kart for two seconds
  if (track.slowZones.length) {
    const slowTex = canvasTex(128, 128, (g, w2, h2) => { // same design as the boost pad, in red, no lettering
      g.fillStyle = '#4a0a10'; g.fillRect(0, 0, w2, h2);
      g.strokeStyle = '#ff3b4a'; g.lineWidth = 14; g.lineJoin = 'round';
      for (const y of [100, 60, 20]) { g.beginPath(); g.moveTo(22, y + 20); g.lineTo(64, y - 12); g.lineTo(106, y + 20); g.stroke(); }
    }, false);
    const slowMat = new THREE.MeshStandardMaterial({ map: slowTex, emissiveMap: slowTex, emissive: '#ffffff', emissiveIntensity: 1.1, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const zn of track.slowZones) {
      const s = track.samples[zn.idx];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(zn.hw * 2, (zn.len * 2 + 1) * track.step), slowMat);
      m.rotation.set(-Math.PI / 2, 0, Math.PI + s.heading);
      m.position.set(s.x + s.nx * zn.lat, s.y + 0.045, s.z + s.nz * zn.lat); m.receiveShadow = true;
      scene.add(m);
    }
  }

  // --- scanned / modelled company map (GLB)
  if (map.model && map.model.url) {
    try {
      const gltf = await new GLTFLoader().loadAsync(map.model.url);
      const m = gltf.scene;
      const sc2 = map.model.scale ?? 1;
      m.scale.setScalar(sc2);
      m.rotation.y = (map.model.rotationY || 0) * Math.PI / 180;
      m.position.fromArray(map.model.position || [0, 0, 0]);
      m.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = !!map.model.castShadow; } });
      scene.add(m);
      world.model = m;
    } catch (e) { console.warn('Could not load map model:', e); }
  }

  const theme = map.theme || (map.scenery === false ? 'none' : 'campus');
  if (theme === 'office') { buildOffice(scene, track, map, cfg); scene.fog = new THREE.Fog('#dfe6f0', 160, 700); dome.visible = false; scene.background = new THREE.Color('#dfe6f0'); }
  else if (theme === 'company') { buildCompany(scene, track, map, cfg); dome.visible = false; }
  else if (theme === 'arena') { buildArena(scene, track, map, cfg); scene.environmentIntensity = 0.3; }
  else if (theme === 'campus') buildScenery(scene, track, map);
  return world;
}

function buildScenery(scene, track, map) {
  const rand = rng(20261231);
  const { samples, N, half } = track;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
  const distToTrack = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < N; i += 2) { const s = samples[i]; d = Math.min(d, (s.x - x) ** 2 + (s.z - z) ** 2); }
    return Math.sqrt(d);
  };

  // ground
  const groundTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5fa052'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `hsla(${95 + Math.random() * 30},${40 + Math.random() * 25}%,${28 + Math.random() * 22}%,0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  });
  groundTex.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true;
  scene.add(ground);

  // office towers: glass + steel
  const winTex = hue => canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = `hsl(${hue},25%,22%)`; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const lit = Math.random();
      g.fillStyle = lit > 0.82 ? '#ffe9a8' : `hsl(${hue + 10},${45 + lit * 20}%,${48 + lit * 22}%)`;
      g.fillRect(x * 16 + 2, y * 16 + 2, 12, 11);
    }
  });
  const towerMats = [205, 190, 222, 28].map(h => {
    const t = winTex(h);
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.18, metalness: 0.55, clearcoat: 0.5, envMapIntensity: 1.4 });
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#c9ced8', roughness: 0.7 });
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < 46; tries++) {
    const w = 14 + rand() * 16, d = 14 + rand() * 16, h = 16 + rand() * rand() * 70;
    const x = minX - 90 + rand() * (maxX - minX + 180), z = minZ - 90 + rand() * (maxZ - minZ + 180);
    if (roadClearance(track, x, z) < 7 + Math.hypot(w, d) / 2) continue;
    const mat = towerMats[Math.floor(rand() * towerMats.length)].clone();
    mat.map = mat.map.clone(); mat.map.repeat.set(Math.max(1, Math.round(w / 16)), Math.max(1, Math.round(h / 28))); mat.map.needsUpdate = true;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    placed++;
  }

  // trees (instanced)
  const TREES = 260;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 }), TREES);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), TREES);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  let ti = 0;
  for (let tries = 0; tries < 4000 && ti < TREES; tries++) {
    const x = minX - 70 + rand() * (maxX - minX + 140), z = minZ - 70 + rand() * (maxZ - minZ + 140);
    const d = roadClearance(track, x, z) + half;
    if (d < half + 4 || d > 60) continue;
    const s = 0.8 + rand() * 0.9;
    m4.compose(new THREE.Vector3(x, 1.2 * s, z), q, new THREE.Vector3(s, s, s)); trunk.setMatrixAt(ti, m4);
    m4.compose(new THREE.Vector3(x, 3.6 * s, z), q.setFromEuler(new THREE.Euler(rand(), rand() * 6, rand())), new THREE.Vector3(s, s * 1.15, s)); crown.setMatrixAt(ti, m4);
    crown.setColorAt(ti, rand() < 0.15 ? col.setHSL(0.93 + rand() * 0.05, 0.7, 0.72) : col.setHSL(0.27 + rand() * 0.1, 0.55, 0.3 + rand() * 0.14));
    q.identity();
    ti++;
  }
  trunk.count = crown.count = ti; trunk.castShadow = crown.castShadow = true;
  scene.add(trunk, crown);

  // lamp posts along the track + party balloons near the start
  const postGeo = new THREE.CylinderGeometry(0.09, 0.13, 6, 8), bulbGeo = new THREE.SphereGeometry(0.42, 12, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: '#2a2d35', metalness: 0.8, roughness: 0.35 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd77a', emissiveIntensity: 2.2 });
  const gap = Math.round(34 / track.step);
  for (let i = gap, k = 0; i < N - gap / 2; i += gap, k++) {
    const s = samples[i], side = k % 2 ? 1 : -1, off = half + 2.2;
    const post = new THREE.Mesh(postGeo, postMat); post.position.set(s.x + s.nx * off * side, 3, s.z + s.nz * off * side); post.castShadow = true;
    const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.set(post.position.x, 6.2, post.position.z);
    scene.add(post, bulb);
  }
  const balloonGeo = new THREE.SphereGeometry(0.7, 16, 12);
  const s0 = samples[0];
  for (let i = 0; i < 36; i++) {
    const side = i % 2 ? 1 : -1, along = (rand() - 0.5) * 26, off = half + 3 + rand() * 5;
    const mat = new THREE.MeshPhysicalMaterial({ color: col.setHSL(rand(), 0.85, 0.55).clone(), roughness: 0.15, clearcoat: 1, metalness: 0.1 });
    const b = new THREE.Mesh(balloonGeo, mat);
    b.scale.y = 1.2;
    b.position.set(s0.x + s0.nx * off * side + s0.tx * along, 3 + rand() * 6, s0.z + s0.nz * off * side + s0.tz * along);
    b.castShadow = true;
    scene.add(b);
  }
}
