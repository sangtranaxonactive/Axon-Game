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
  return {
    reset(boxMs, list) {
      const now = performance.now();
      boxes.forEach((m, i) => { m.userData.backAt = now + ((boxMs && boxMs[i]) || 0); });
      for (const m of bananas.values()) scene.remove(m); bananas.clear();
      if (list) for (const [id, x, z] of list) this.addBanana(id, x, z);
    },
    takeBox(i, ms) { if (boxes[i]) boxes[i].userData.backAt = performance.now() + ms; },
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
      for (const m of boxes) { const on = now >= m.userData.backAt; m.visible = on; if (on) { m.rotation.y = t * 1.6; m.rotation.x = 0.35; m.position.y = 1.9 + Math.sin(t * 2.4 + m.position.x) * 0.25; } }
    },
  };
}
