import * as THREE from 'three';
import { createWorldObjectRenderer } from '../world-object-renderer.js';
import { createWorldSpatialModel } from '../generated-spatial.js';
import { vegetationSettings, VEGETATION_TYPES } from './landscape.js';

/** Small live sample of the actual game vegetation renderer. Nothing is written
 * to the map. Rebuilds are coalesced; invisible previews do not animate or build.
 */
export function createLandscapePreview(container, { getMap, getVegetation, getPosition, getVariant }) {
  let renderer, disposed = false, visible = false, inFlight = false, dirty = true;
  let group, objects, surface, raf = 0, timer = 0, frames = 0, revision = 0;
  let lastFrame = 0, elapsed = 0, ready = false, failure = null, settings, position = [0, 0];
  let signature = '', buildingSignature = '';
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#183a31');
  const camera = new THREE.PerspectiveCamera(38, 1.5, .1, 100);
  const hemi = new THREE.HemisphereLight('#c8dfdf', '#34594a', 1.9);
  const sun = new THREE.DirectionalLight('#fff0d8', 2.15); sun.position.set(-6, 10, 8);
  scene.add(hemi, sun);
  const player = new THREE.Vector3(), status = document.createElement('p');
  status.className = 'small-note'; status.textContent = 'Live-Vorschau · gleiche Vegetation wie im Spiel';
  const viewport = document.createElement('div'); viewport.style.cssText = 'height:200px;min-width:0;border-radius:10px;overflow:hidden;background:#183a31';
  container.append(viewport, status);
  function initRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    renderer.domElement.setAttribute('aria-label', 'Animierte Vorschau von Gras, Bodenfarbe und Wind');
    renderer.domElement.style.display = 'block'; viewport.append(renderer.domElement);
    resize();
  }
  function resize() {
    if (!renderer) return;
    const width = Math.max(100, viewport.clientWidth), height = 200;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    if (ready) renderer.render(scene, camera);
  }
  function clearSample() {
    if (group) scene.remove(group);
    objects?.dispose?.(); objects = null;
    surface?.geometry.dispose(); surface?.material.dispose(); surface = null;
    group = null; ready = false;
  }
  function makeSnapshot() {
    const map = getMap(), source = getVegetation() ?? {};
    const values = vegetationSettings({ kind: 'grass', variant: 'tall', vegetation: source });
    const p = getPosition?.() ?? map.gameplay.spawnPosition ?? [0, 0];
    const variant = getVariant?.() ?? VEGETATION_TYPES.find(type => type.id === values.type)?.variant ?? 'tall';
    return { map, settings: values, variant, position: [...p], key: JSON.stringify([
      values, variant, p, map.landscape ?? null, map.regions, map.island.points,
    ]) };
  }
  async function rebuild() {
    timer = 0;
    if (disposed || !visible || document.hidden || inFlight || !dirty) return;
    const snapshot = makeSnapshot(); dirty = false;
    if (snapshot.key === signature && ready) { startAnimation(); return; }
    inFlight = true; buildingSignature = snapshot.key; failure = null;
    const request = ++revision;
    try {
      initRenderer();
      const spatial = createWorldSpatialModel(snapshot.map);
      const nextGroup = new THREE.Group(), color = new THREE.Color();
      const [x, z] = snapshot.position, ground = spatial.groundAt(x, z);
      const geometry = new THREE.PlaneGeometry(12, 12, 32, 32); geometry.rotateX(-Math.PI / 2);
      const coordinates = geometry.attributes.position, colors = [];
      for (let i = 0; i < coordinates.count; i++) {
        const px = x + coordinates.getX(i), pz = z + coordinates.getZ(i);
        coordinates.setXYZ(i, px, spatial.groundAt(px, pz) - .015, pz);
        spatial.colorAt(px, pz, color); colors.push(color.r, color.g, color.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
      const nextSurface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
      nextGroup.add(nextSurface);
      const sample = { id: 'landscape-preview-grass', name: 'Vegetationsvorschau', kind: 'grass', variant: snapshot.variant,
        position: [x, z], rotation: .2, scale: 1, radius: 2.5, vegetation: snapshot.settings };
      const nextObjects = await createWorldObjectRenderer(nextGroup, {
        map: { ...snapshot.map, objects: [sample] }, quality: 'low', previewOnly: true,
        heightAt: spatial.groundAt, groundHeightAt: spatial.groundAt, colorAt: spatial.colorAt,
      });
      if (disposed || request !== revision) {
        nextObjects.dispose?.(); nextSurface.geometry.dispose(); nextSurface.material.dispose(); return;
      }
      clearSample(); group = nextGroup; surface = nextSurface; objects = nextObjects;
      settings = snapshot.settings; position = snapshot.position; signature = snapshot.key;
      scene.add(group); player.set(x, ground, z);
      const height = objects.grassPatches?.[0]?.maxBladeHeight ?? 2.6;
      const distance = Math.max(8.7, height * 2.1);
      camera.position.set(x + distance * .65, ground + distance * .7, z + distance);
      camera.lookAt(x, ground + height * .35, z);
      objects.update(0, elapsed, player); renderer.render(scene, camera); frames++;
      ready = true; status.textContent = 'Live-Vorschau · gleiche Vegetation wie im Spiel';
      container.dispatchEvent(new CustomEvent('landscape-preview-ready'));
    } catch (error) {
      failure = String(error?.message ?? error);
      status.textContent = '3D-Vorschau momentan nicht verfügbar. Die Kartendaten bleiben bearbeitbar.';
    } finally {
      inFlight = false;
      if (dirty) schedule();
      startAnimation();
    }
  }
  function animate(time) {
    raf = 0;
    if (disposed || !visible || document.hidden || !ready) return;
    const dt = lastFrame ? Math.min(.05, (time - lastFrame) / 1000) : 0; lastFrame = time;
    elapsed += dt; objects.update(dt, elapsed, player);
    renderer.render(scene, camera); frames++;
    if (objects.wind?.stats.settings.enabled !== false) raf = requestAnimationFrame(animate);
  }
  function startAnimation() { if (!raf && visible && !document.hidden && ready && !disposed) { lastFrame = 0; raf = requestAnimationFrame(animate); } }
  function schedule() { clearTimeout(timer); if (visible && !document.hidden && !disposed) timer = setTimeout(rebuild, 160); }
  function refresh() {
    if (disposed) return;
    // Editor selection refreshes frequently; avoid rebuilding for unchanged data.
    const current = makeSnapshot();
    if (current.key === (inFlight ? buildingSignature : signature)) return;
    dirty = true; schedule();
  }
  function visibilityChanged() {
    if (document.hidden || !visible) { cancelAnimationFrame(raf); raf = 0; lastFrame = 0; clearTimeout(timer); }
    else { if (dirty) schedule(); startAnimation(); }
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
    visibilityChanged();
  }, { threshold: 0 }); observer.observe(viewport);
  const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(viewport);
  document.addEventListener('visibilitychange', visibilityChanged);
  return {
    refresh,
    get stats() { return { ready, frames, visible, running: Boolean(raf), error: failure,
      position, settings, wind: objects?.wind?.stats ?? null,
      windRoot: objects?.wind?.sampleVertex(position[0], position[1], 0, elapsed) ?? null,
      windTip: objects?.wind?.sampleVertex(position[0], position[1], 1, elapsed) ?? null,
      grass: objects?.stats.grassRendering ?? null, patch: objects?.grassPatches?.[0] ?? null,
      loadedGLBs: objects?.stats.loadedGLBs ?? 0,
      calls: renderer?.info.render.calls ?? 0, pending: inFlight || dirty }; },
    dispose() {
      disposed = true; revision++; cancelAnimationFrame(raf); clearTimeout(timer);
      observer.disconnect(); sizeObserver.disconnect(); document.removeEventListener('visibilitychange', visibilityChanged);
      clearSample(); renderer?.dispose(); renderer?.forceContextLoss(); container.replaceChildren();
    },
  };
}
