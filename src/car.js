// Procedural kart model + floating name tag.
import * as THREE from 'three';

const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.36, 22).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.38, 6).rotateZ(Math.PI / 2);
const tyreMat = new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#d9dde6', metalness: 0.9, roughness: 0.25 });
const darkMat = new THREE.MeshStandardMaterial({ color: '#22242b', roughness: 0.5, metalness: 0.4 });
const chromeMat = new THREE.MeshStandardMaterial({ color: '#f1f3f7', metalness: 1, roughness: 0.15 });
const visorMat = new THREE.MeshPhysicalMaterial({ color: '#10131a', roughness: 0.05, metalness: 0.6, clearcoat: 1 });
const flameMat = new THREE.MeshBasicMaterial({ color: '#59d8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffb320', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

const blobGeo = new THREE.PlaneGeometry(3.6, 4.8);
const blobMat = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
})();

// Goofy drivers. Purely cosmetic: built from primitives, coloured with the player's chosen colour.
function makeDriver(g, id, col, paint) {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o });
  const main = M(col), white = M('#f7f7f2'), black = M('#111318', { roughness: 0.25 }), orange = M('#ff8a1f'), red = M('#e8283c');
  const head = new THREE.Group(); head.position.set(0, 1.52, -0.08); g.add(head);
  const add = (geo, mat, x, y, z, parent = head) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
  const eyes = (y, z, sep, r, pupil = 0.5) => { for (const sx of [-1, 1]) { add(S(r), white, sx * sep, y, z); add(S(r * pupil), black, sx * sep, y, z + r * 0.7); } };
  const torso = c2 => add(new THREE.CapsuleGeometry(0.3, 0.45, 4, 10), M(c2), 0, 0.92, -0.1, g);
  switch (id) {
    case 1: // Duck
      torso(col); add(S(0.42), main, 0, 0, 0); eyes(0.12, 0.3, 0.17, 0.11);
      { const b = add(new THREE.ConeGeometry(0.2, 0.42, 12), orange, 0, -0.06, 0.5); b.rotation.x = Math.PI / 2; b.scale.set(1.3, 1, 0.55); }
      add(S(0.1), main, 0, 0.42, -0.1); break;
    case 2: // Banana with shades
      { const b = add(new THREE.CapsuleGeometry(0.27, 0.95, 6, 14), main, 0, 0.1, 0); b.rotation.x = 0.22; }
      add(S(0.09), M('#4a3018'), 0, 0.86, 0.17); add(S(0.3), main, 0, -0.62, -0.02, head);
      add(new THREE.BoxGeometry(0.56, 0.13, 0.08), black, 0, 0.32, 0.27);
      { const m = add(new THREE.TorusGeometry(0.11, 0.025, 6, 12, Math.PI), black, 0, 0.1, 0.27); m.rotation.z = Math.PI; } break;
    case 3: // Alien
      torso(col); { const h = add(S(0.42), main, 0, 0.06, 0); h.scale.set(1.25, 1.15, 1.05); }
      for (const sx of [-1, 1]) {
        const e = add(S(0.17), black, sx * 0.21, 0.08, 0.32); e.scale.set(0.8, 1.25, 0.5); e.rotation.z = sx * -0.5;
        add(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5), main, sx * 0.2, 0.68, 0).rotation.z = sx * -0.3;
        add(S(0.06), M('#7fe3ff', { emissive: '#35c8f5', emissiveIntensity: 1.5 }), sx * 0.26, 0.88, 0);
      } break;
    case 4: // Chicken
      torso('#f7f7f2'); add(S(0.4), white, 0, 0, 0); eyes(0.1, 0.33, 0.16, 0.07, 0.75);
      for (let k = 0; k < 3; k++) add(S(0.13 - k * 0.012), red, 0, 0.42 - k * 0.05, 0.12 - k * 0.17);
      { const b = add(new THREE.ConeGeometry(0.11, 0.3, 8), M('#ffc21a'), 0, -0.04, 0.46); b.rotation.x = Math.PI / 2; }
      add(S(0.09), red, 0, -0.22, 0.36); add(new THREE.BoxGeometry(0.5, 0.12, 0.3), main, 0, -0.42, 0); break;
    case 5: // Clown
      torso(col); add(S(0.4), white, 0, 0, 0); eyes(0.1, 0.33, 0.15, 0.07, 0.7);
      add(S(0.11), red, 0, -0.02, 0.4);
      { const m = add(new THREE.TorusGeometry(0.15, 0.03, 6, 14, Math.PI), red, 0, -0.14, 0.33); m.rotation.z = Math.PI; }
      for (const sx of [-1, 1]) add(S(0.24, 10, 8), main, sx * 0.42, 0.18, -0.05);
      add(new THREE.ConeGeometry(0.13, 0.4, 10), M('#ffc21a'), 0, 0.55, 0); break;
    case 6: // Boss: shades, backwards cap, gold chain
      torso(col); add(S(0.38), M('#c98f63'), 0, 0, 0);
      add(new THREE.BoxGeometry(0.62, 0.15, 0.1), black, 0, 0.07, 0.33);
      add(new THREE.CylinderGeometry(0.39, 0.4, 0.2, 18), main, 0, 0.26, 0); add(new THREE.BoxGeometry(0.46, 0.05, 0.34), main, 0, 0.18, -0.48);
      { const ch = add(new THREE.TorusGeometry(0.27, 0.045, 8, 20), M('#ffcf3a', { metalness: 1, roughness: 0.2 }), 0, 1.24, -0.02, g); ch.rotation.x = Math.PI / 2 - 0.35; }
      { const m = add(new THREE.BoxGeometry(0.22, 0.035, 0.04), black, 0.02, -0.18, 0.34); m.rotation.z = 0.12; } break;
    case 7: // Robot
      torso('#8a93a6'); add(new THREE.BoxGeometry(0.66, 0.56, 0.56), main, 0, 0.02, 0);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.16, 0.12, 0.04), M('#7fe3ff', { emissive: '#35c8f5', emissiveIntensity: 2 }), sx * 0.16, 0.08, 0.29);
      add(new THREE.BoxGeometry(0.3, 0.05, 0.04), black, 0, -0.14, 0.29);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), black, 0, 0.44, 0); add(S(0.07), red, 0, 0.62, 0);
      for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 10), black, sx * 0.37, 0, 0).rotation.z = Math.PI / 2; break;
    default: // Racer
      torso('#f4f5f8'); add(S(0.34, 18, 14), main, 0, -0.02, 0);
      { const v = add(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.3), visorMat, 0, -0.02, 0.08); v.rotation.x = Math.PI / 2 - 0.25; }
  }
  return head;
}

export function makeCar(color, name, look = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  // sculpted body: side profile extruded across the width, with rounded bevels
  const prof = new THREE.Shape();
  prof.moveTo(-1.5, 0.24); prof.lineTo(1.75, 0.24); prof.quadraticCurveTo(2.15, 0.26, 2.1, 0.42);
  prof.quadraticCurveTo(1.5, 0.66, 0.55, 0.78); prof.lineTo(0.42, 0.62); prof.lineTo(-0.45, 0.62);
  prof.quadraticCurveTo(-0.6, 1.12, -1.0, 1.1); prof.quadraticCurveTo(-1.55, 1.0, -1.62, 0.5); prof.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: 0.86, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 4, curveSegments: 10 });
  bodyGeo.translate(0, 0, -0.43).rotateY(-Math.PI / 2);
  const bodyM = new THREE.Mesh(bodyGeo, paint); bodyM.castShadow = true; g.add(bodyM);
  const stripe = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 1 });
  const st = box(0.26, 0.02, 1.5, stripe, 0, 0.0, 0); st.position.set(0, 0.705, 1.25); st.rotation.x = 0.165; st.castShadow = false;
  for (const sx of [-1, 1]) {                                   // rounded side pods
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.25, 6, 12).rotateX(Math.PI / 2), paint);
    pod.position.set(sx * 0.78, 0.46, -0.15); pod.scale.set(1.15, 0.85, 1); pod.castShadow = true; g.add(pod);
  }
  const wing = box(2.0, 0.07, 0.42, darkMat, 0, 0.27, 2.05);    // front wing + end plates
  box(0.06, 0.26, 0.5, paint, -1.0, 0.36, 2.05); box(0.06, 0.26, 0.5, paint, 1.0, 0.36, 2.05);
  box(1.75, 0.07, 0.5, paint, 0, 1.5, -1.5);                    // rear wing
  box(0.07, 0.62, 0.42, darkMat, -0.62, 1.2, -1.5);
  box(0.07, 0.62, 0.42, darkMat, 0.62, 1.2, -1.5);
  box(0.07, 0.34, 0.58, paint, -0.9, 1.44, -1.5); box(0.07, 0.34, 0.58, paint, 0.9, 1.44, -1.5);
  for (const x of [-0.28, 0.28]) {                              // exhausts
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 10).rotateX(Math.PI / 2), chromeMat);
    e.position.set(x, 0.62, -1.62); g.add(e);
  }
  const head = makeDriver(g, look.char | 0, look.charColor || color, paint);
  const wheelCol = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), darkMat);
  wheelCol.position.set(0, 0.95, 0.5); wheelCol.rotation.x = -0.9; g.add(wheelCol);

  // wheels
  const wheels = [], front = [];
  for (const [x, z, f] of [[-0.88, 1.2, 1], [0.88, 1.2, 1], [-0.92, -1.0, 0], [0.92, -1.0, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.4, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat); tyre.castShadow = true;
    if (!f) tyre.scale.set(1.25, 1.08, 1.08);
    spin.add(tyre, new THREE.Mesh(rimGeo, rimMat));
    pivot.add(spin); g.add(pivot);
    wheels.push(spin); if (f) front.push(pivot);
  }
  // nitro flames + drift sparks
  const flames = [];
  for (const x of [-0.28, 0.28]) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.5, 10).rotateX(-Math.PI / 2), flameMat);
    fl.position.set(x, 0.62, -2.55); fl.visible = false; g.add(fl); flames.push(fl);
  }
  const sparks = [];
  for (const x of [-0.95, 0.95]) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), sparkMat.clone());
    sp.position.set(x, 0.15, -1.3); sp.visible = false; g.add(sp); sparks.push(sp);
  }

  let tag = null;
  if (name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = '700 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(246, x.measureText(name).width + 34);
    x.fillStyle = 'rgba(10,12,20,.72)'; x.beginPath(); x.roundRect(128 - w / 2, 10, w, 44, 22); x.fill();
    x.fillStyle = '#' + new THREE.Color(look.tag || color).getHexString(); x.beginPath(); x.arc(128 - w / 2 + 20, 32, 7, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.fillText(name, 128 + 8, 33, 200);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    tag.scale.set(3.4, 0.85, 1); tag.position.y = 2.7; tag.renderOrder = 10;
    g.add(tag);
  }

  g.traverse(o => { if (o.isMesh) o.castShadow = false; }); // karts use a blob shadow (see world.js shadow notes)
  const inner = g; // visual tilt is applied on a wrapper so name tag stays upright enough
  const root = new THREE.Group(); root.add(inner);
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.07; blob.renderOrder = 1;
  root.add(blob);
  root.userData = {
    // speed m/s, steer -1..1, drift level 0..2, boosting bool, t seconds
    animate(speed, steer, driftLevel, boosting, dt, t, slide = 0) {
      for (const w of wheels) w.rotation.x += speed / 0.36 * dt;
      for (const p of front) p.rotation.y = -steer * 0.45;
      inner.rotation.z = THREE.MathUtils.lerp(inner.rotation.z, steer * 0.07 * Math.min(1, speed / 20), 0.2);
      inner.rotation.y = THREE.MathUtils.lerp(inner.rotation.y, slide, 0.2);
      head.rotation.z = -steer * 0.22 + Math.sin(t * 9) * 0.03 * Math.min(1, speed / 10); head.rotation.x = Math.sin(t * 13) * 0.025;
      for (const f of flames) { f.visible = boosting; if (boosting) f.scale.set(1, 1, 0.8 + Math.sin(t * 60 + f.position.x * 9) * 0.25); }
      for (const s of sparks) {
        s.visible = driftLevel > 0;
        if (s.visible) { s.material.color.set(driftLevel > 1 ? '#42c8ff' : '#ffb320'); s.scale.setScalar(0.7 + Math.random() * 0.8); }
      }
    },
  };
  return root;
}
