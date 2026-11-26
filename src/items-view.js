// Renders the things racers interact with: orange lucky boxes and dropped banana peels. Used by the game and the live view.
import * as THREE from 'three';
import { canvasTex } from './world.js';

export function createItems(scene, track) {
  const tex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffb23a'); gr.addColorStop(1, '#f26a0f'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff3d6'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff'; g.font = '900 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 + 6);
  }, false);
  const boxMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.35 });
  const boxGeo = new THREE.BoxGeometry(2.3, 2.3, 2.3);
  const boxes = track.itemBoxes.map(b => { const m = new THREE.Mesh(boxGeo, boxMat); m.position.set(b.x, b.y + 1.9, b.z); m.userData.backAt = 0; scene.add(m); return m; });
  const peelMat = new THREE.MeshStandardMaterial({ color: '#ffd92e', roughness: 0.5 }), tipMat = new THREE.MeshStandardMaterial({ color: '#5a3d12', roughness: 0.8 });
  const peelGeo = new THREE.TorusGeometry(0.75, 0.3, 8, 14, Math.PI * 1.15), tipGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const bananas = new Map();
  // short-lived bursts (box collected, bomb going off)
  const burstGeo = new THREE.SphereGeometry(1, 14, 10), ringGeo = new THREE.RingGeometry(0.7, 1, 28).rotateX(-Math.PI / 2);
  const bursts = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group(); g.visible = false;
    const ball = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    g.add(ball, ring); scene.add(g); bursts.push({ g, ball, ring, t0: 0, dur: 0.5, size: 3 });
  }
  let nextBurst = 0;
  return {
    reset(boxMs, list) { // boxMs[i]: ms until box i is available, or -1 when that box is not used in this race
      const now = performance.now();
      boxes.forEach((m, i) => { const ms = boxMs ? boxMs[i] : 0; m.userData.backAt = ms < 0 ? Infinity : now + (ms || 0); });
      for (const m of bananas.values()) scene.remove(m); bananas.clear();
      if (list) for (const [id, x, z] of list) this.addBanana(id, x, z);
    },
    takeBox(i, ms, bomb) { const m = boxes[i]; if (!m) return; m.userData.backAt = performance.now() + ms; this.burst(m.position.x, m.position.y, m.position.z, bomb ? '#ff5a1f' : '#ffb23a', bomb ? 7 : 3.2, bomb ? 0.7 : 0.45); },
    burst(x, y, z, color, size = 3, dur = 0.5) {
      const b = bursts[nextBurst++ % bursts.length];
      b.g.position.set(x, y, z); b.g.visible = true; b.t0 = performance.now(); b.dur = dur; b.size = size;
      b.ball.material.color.set(color); b.ring.material.color.set(color);
    },
    addBanana(id, x, z) {
      if (bananas.has(id)) return;
      const g = new THREE.Group(); g.position.set(x, 0.55, z); g.rotation.y = id * 1.7;
      const p = new THREE.Mesh(peelGeo, peelMat); p.rotation.x = Math.PI / 2; g.add(p);
      const tip = new THREE.Mesh(tipGeo, tipMat); tip.position.set(0.75, 0, 0); g.add(tip);
      scene.add(g); bananas.set(id, g);
    },
    delBanana(id) { const m = bananas.get(id); if (m) { scene.remove(m); bananas.delete(id); } },
    update(t) {
      const now = performance.now();
      for (const b of bursts) {
        if (!b.g.visible) continue;
        const k = (now - b.t0) / 1000 / b.dur;
        if (k >= 1) { b.g.visible = false; continue; }
        b.ball.scale.setScalar(0.4 + k * b.size); b.ball.material.opacity = (1 - k) * 0.85;
        b.ring.scale.setScalar(0.6 + k * b.size * 2.2); b.ring.material.opacity = (1 - k) * 0.9;
      }
      for (const m of boxes) { const on = now >= m.userData.backAt; m.visible = on; if (on) { m.rotation.y = t * 1.6; m.rotation.x = 0.35; m.position.y = 1.9 + Math.sin(t * 2.4 + m.position.x) * 0.25; } }
    },
  };
}
