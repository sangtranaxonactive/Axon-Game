// Loads a map into the scene and swaps it for another on request (each room races on its own map).
import { buildTrack } from './track-core.js';
import { padIndices } from './physics.js';
import { buildWorld } from './world.js';
import { createItems } from './items-view.js';

export function createStage(scene, renderer, cfg) {
  const json = new Map();
  let current = null, chain = Promise.resolve();
  function clear() {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const k of ['map', 'emissiveMap', 'bumpMap']) if (m[k]) m[k].dispose();
        m.dispose();
      }
    });
    if (scene.environment) scene.environment.dispose();
    scene.clear(); scene.fog = null; scene.background = null; scene.environment = null;
  }
  async function build(name) {
    if (current && current.name === name) return current;
    if (!json.has(name)) json.set(name, await (await fetch(`/maps/${String(name).replace(/[^\w-]/g, '')}.json`)).json());
    const map = json.get(name);
    clear();
    const track = buildTrack(map);
    const world = await buildWorld(scene, renderer, track, map, cfg);
    current = { name, map, track, pads: padIndices(track, map), world, items: createItems(scene, track) };
    return current;
  }
  return {
    load(name) { chain = chain.then(() => build(name), () => build(name)); return chain; }, // one at a time, in order
    get current() { return current; },
  };
}
