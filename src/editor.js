import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildTrack } from './track-core.js';
const $ = id => document.getElementById(id);
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color('#10131f');
scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 2.2));
const dl = new THREE.DirectionalLight('#ffffff', 1.5); dl.position.set(50, 200, 80); scene.add(dl);
const grid = new THREE.GridHelper(1000, 100, '#3b4680', '#232a4a'); grid.position.y = -0.05; scene.add(grid);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
cam.position.set(0, 1000, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
let zoom = 2.2, cx = 0, cz = 0;
function resize() {
  const w = innerWidth - 320, h = innerHeight; renderer.setSize(w, h, false);
  cam.left = -w / 2 / zoom; cam.right = w / 2 / zoom; cam.top = h / 2 / zoom; cam.bottom = -h / 2 / zoom;
  cam.position.set(cx, 1000, cz); cam.updateProjectionMatrix();
}
addEventListener('resize', resize);

let points = [], sel = -1, model = null, trackGroup = new THREE.Group(); scene.add(trackGroup);
const dotGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
function rebuild() {
  trackGroup.clear();
  const width = Number($('width').value) || 15;
  points.forEach((p, i) => {
    const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: i === sel ? '#ffd23c' : i === 0 ? '#ff3b6b' : '#ffffff', depthTest: false }));
    d.scale.setScalar(Math.max(1.6, 7 / zoom)); d.position.set(p[0], 60, p[1]); d.renderOrder = 5; trackGroup.add(d);
  });
  let msg = `${points.length} points`;
  if (points.length >= 4) {
    const t = buildTrack({ points, width });
    const pos = [], idx = [];
    t.samples.forEach((s, i) => { pos.push(s.x + s.nx * t.half, 50, s.z + s.nz * t.half, s.x - s.nx * t.half, 50, s.z - s.nz * t.half); const a = i * 2, b = ((i + 1) % t.N) * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    trackGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#2f8bff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthTest: false })));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(t.samples.map(s => new THREE.Vector3(s.x, 55, s.z))), new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false }));
    trackGroup.add(line);
    const s0 = t.samples[0], arrow = new THREE.ArrowHelper(new THREE.Vector3(s0.tx, 0, s0.tz), new THREE.Vector3(s0.x, 58, s0.z), 22, '#ff3b6b', 8, 6); trackGroup.add(arrow);
    let minR = Infinity;
    for (let i = 0; i < t.N; i++) { const a = t.samples[i], b = t.samples[(i + 4) % t.N]; let d = b.heading - a.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); minR = Math.min(minR, Math.abs(4 * t.step / (d || 1e-9))); }
    const okR = minR >= t.half + 3;
    msg += `\nLength: ${t.length.toFixed(0)} units  (≈ ${(t.length / 36).toFixed(0)} s per lap)`;
    msg += `\nTightest corner: <span class="${okR ? 'ok' : 'bad'}">${minR.toFixed(1)}${okR ? ' ✓' : ' — too tight, spread the points (needs > ' + (t.half + 3).toFixed(1) + ')'}</span>`;
    if (t.length < 300) msg += `\n<span class="bad">Very short lap — add distance or raise the model scale</span>`;
  } else msg += '\nAdd at least 4 points to form a loop.';
  $('info').innerHTML = msg;
}
function applyModel() {
  if (!model) return;
  model.scale.setScalar(Number($('mScale').value) || 1);
  model.rotation.y = (Number($('mRot').value) || 0) * Math.PI / 180;
  model.position.set(Number($('mX').value) || 0, Number($('mY').value) || 0, Number($('mZ').value) || 0);
}
function setModel(obj) { if (model) scene.remove(model); model = obj; scene.add(model); applyModel(); }
$('file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const gltf = await new GLTFLoader().loadAsync(URL.createObjectURL(f));
  $('mUrl').value = f.name; setModel(gltf.scene); $('btnFloor').click();
};
$('btnFloor').onclick = () => {
  if (!model) return;
  $('mY').value = 0; applyModel(); model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  $('mY').value = (-box.min.y).toFixed(2);
  const c = box.getCenter(new THREE.Vector3()); $('mX').value = (Number($('mX').value) - c.x).toFixed(1); $('mZ').value = (Number($('mZ').value) - c.z).toFixed(1);
  applyModel();
};
for (const id of ['mScale', 'mRot', 'mX', 'mY', 'mZ']) $(id).oninput = applyModel;
$('width').oninput = rebuild;
$('btnRev').onclick = () => { points = [points[0], ...points.slice(1).reverse()]; rebuild(); };
$('btnClear').onclick = () => { if (confirm('Remove all points?')) { points = []; sel = -1; rebuild(); } };

function toMap() {
  const name = $('name').value.trim().replace(/[^\w-]/g, '') || 'company';
  const url = $('mUrl').value.trim();
  return { name, theme: 'none', width: Number($('width').value) || 15, points: points.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]), boostPads: [0.2, 0.45, 0.7, 0.9],
    barriers: $('barriers').checked, road: { visible: $('roadVis').checked, color: '#2f3340', opacity: Number($('roadOp').value) || 1 },
    model: url ? { url: '/maps/' + url.replace(/^.*\//, ''), scale: Number($('mScale').value) || 1, rotationY: Number($('mRot').value) || 0, position: [Number($('mX').value) || 0, Number($('mY').value) || 0, Number($('mZ').value) || 0] } : null,
    sky: { top: '#8ec5ff', bottom: '#eef4fb' }, sun: { azimuth: 150, elevation: 55, color: '#fff4e0', intensity: 2.2 } };
}
$('btnExport').onclick = () => {
  if (points.length < 4) return alert('Add at least 4 points first.');
  const m = toMap(), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' })); a.download = m.name + '.json'; a.click();
};
async function loadMap(name) {
  const r = await fetch(`/maps/${name}.json`); if (!r.ok) return alert('Map not found: ' + name);
  const m = await r.json();
  points = m.points.map(p => p.length >= 3 ? [p[0], p[2]] : [p[0], p[1]]); sel = -1;
  $('width').value = m.width || 15; $('name').value = name;
  $('roadVis').checked = !m.road || m.road.visible !== false; $('roadOp').value = m.road?.opacity ?? 1; $('barriers').checked = m.barriers !== false;
  if (m.model?.url) {
    $('mUrl').value = m.model.url.replace(/^.*\//, ''); $('mScale').value = m.model.scale ?? 1; $('mRot').value = m.model.rotationY || 0;
    [$('mX').value, $('mY').value, $('mZ').value] = m.model.position || [0, 0, 0];
    try { setModel((await new GLTFLoader().loadAsync(m.model.url)).scene); } catch { alert('Could not load ' + m.model.url); }
  }
  rebuild();
}
$('btnLoad').onclick = () => { const n = prompt('Map name (file in /maps without .json):', 'office'); if (n) loadMap(n.replace(/[^\w-]/g, '')); };

// pointer interaction
const world = e => { const r = canvas.getBoundingClientRect(); return [cx + (e.clientX - r.left - r.width / 2) / zoom, cz + (e.clientY - r.top - r.height / 2) / zoom]; };
let drag = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  if (e.button !== 0) { drag = { pan: true, x: e.clientX, y: e.clientY }; return; }
  const [x, z] = world(e), hitR = Math.max(2.5, 10 / zoom);
  const hit = points.findIndex(p => Math.hypot(p[0] - x, p[1] - z) < hitR);
  if (hit >= 0) { sel = hit; drag = { point: hit }; }
  else { points.splice(sel + 1, 0, [x, z]); sel = sel + 1; drag = { point: sel }; }
  rebuild();
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.pan) { cx -= (e.clientX - drag.x) / zoom; cz -= (e.clientY - drag.y) / zoom; drag.x = e.clientX; drag.y = e.clientY; resize(); }
  else { points[drag.point] = world(e); rebuild(); }
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.min(30, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.15 : 0.87))); resize(); rebuild(); }, { passive: false });
addEventListener('keydown', e => { if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT' && sel >= 0) { points.splice(sel, 1); sel = Math.min(sel, points.length - 1); rebuild(); } });

resize(); rebuild();
const q = new URLSearchParams(location.search).get('map'); if (q) loadMap(q.replace(/[^\w-]/g, ''));
(function loop() { requestAnimationFrame(loop); renderer.render(scene, cam); })();
