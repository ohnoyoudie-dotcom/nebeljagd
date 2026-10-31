import * as THREE from 'three';
import { loadEnvironmentKit } from '../environment-kit.js';
import { generateBarrierObjects } from './barriers.js';

/** Static, lazily created preview of the actual wall/fence GLBs. The saved
 * line is never changed. Prototypes belong to this preview's cache and are
 * retained between updates; only dispose() releases those shared resources. */
export function createBarrierPreview(container, statusElement) {
  let renderer, scene, camera, group, ground, grid, observer;
  let disposed = false, revision = 0, signature = '', bounds = null;
  const models = new Map();
  const releasedModels = new WeakSet();
  const status = (message, state) => {
    if (statusElement) statusElement.textContent = message;
    container.dataset.previewState = state;
  };

  function releaseModels(loaded) {
    if (releasedModels.has(loaded)) return;
    releasedModels.add(loaded);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    for (const model of loaded.values()) for (const part of model.parts) {
      geometries.add(part.geometry);
      if (part.lowGeometry) geometries.add(part.lowGeometry);
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }

  function getModels(object) {
    const key = `${object.kind}:${object.variant}`;
    if (!models.has(key)) {
      // loadEnvironmentKit creates fresh resources per invocation. Keeping
      // this private cache cannot dispose models used by the game renderer.
      const pending = loadEnvironmentKit({ objects: [object] }).then(loaded => {
        if (disposed) releaseModels(loaded);
        return loaded;
      }).catch(error => { models.delete(key); throw error; });
      models.set(key, pending);
    }
    return models.get(key);
  }

  function init() {
    if (renderer || disposed) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;border-radius:10px';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '3D-Vorschau der gezeichneten Mauer oder des Zauns');
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (!disposed) status('Die 3D-Vorschau wurde unterbrochen. Deine Strecke bleibt erhalten.', 'error');
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      if (!disposed && bounds) { resize(); status('3D-Vorschau · dieselben Modelle wie im Spiel', 'ready'); }
    });
    container.append(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color('#dce5d4');
    camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 1000);
    scene.add(new THREE.HemisphereLight('#edf3f1', '#657152', 2));
    const sunlight = new THREE.DirectionalLight('#fff0d6', 2.8);
    sunlight.position.set(-20, 35, 25); scene.add(sunlight);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#a4b58b', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.035;
    scene.add(ground);
    observer = new ResizeObserver(resize); observer.observe(container);
  }

  function removeDrawing() {
    if (group) {
      scene.remove(group);
      group.traverse(mesh => { if (mesh.isInstancedMesh) mesh.dispose(); });
      group = null;
    }
    if (grid) {
      scene.remove(grid); grid.geometry.dispose();
      for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose();
      grid = null;
    }
    bounds = null;
    container.dataset.previewObjects = '0';
  }

  function resize() {
    if (!renderer || disposed || !bounds) return;
    const width = container.clientWidth, height = container.clientHeight || 190;
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const span = Math.max(size.length(), 6);
    camera.position.copy(center).add(new THREE.Vector3(-.7, 1, 1.2).normalize().multiplyScalar(span * 2));
    camera.lookAt(center); camera.near = .1; camera.far = span * 6 + 100;
    camera.updateMatrixWorld(true);
    let halfWidth = 0, halfHeight = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      halfWidth = Math.max(halfWidth, Math.abs(point.x));
      halfHeight = Math.max(halfHeight, Math.abs(point.y));
    }
    halfHeight = Math.max(2, halfHeight, halfWidth / (width / height)) * 1.18;
    halfWidth = halfHeight * width / height;
    camera.left = -halfWidth; camera.right = halfWidth;
    camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  async function show(barrier) {
    if (disposed) return false;
    if (!barrier) { clear(); return false; }
    const key = JSON.stringify(barrier);
    if (key === signature && bounds) {
      ++revision; resize();
      status('3D-Vorschau · dieselben Modelle wie im Spiel', 'ready');
      return true;
    }
    const request = ++revision;
    status('3D-Vorschau wird geladen …', 'loading');
    try {
      const objects = generateBarrierObjects(barrier);
      if (!objects.length) { clear(); return false; }
      init();
      const loaded = await getModels(objects[0]);
      if (disposed || request !== revision) return false;
      const model = loaded.get(`${objects[0].kind}:${objects[0].variant}`);
      if (!model) throw new Error('Das gewählte Modell ist noch nicht verfügbar.');
      removeDrawing(); group = new THREE.Group();
      // Recenter large world coordinates for stable bounds and a clear preview.
      const origin = objects[0].position, transform = new THREE.Object3D();
      for (const part of model.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, objects.length);
        objects.forEach((object, index) => {
          transform.position.set(object.position[0] - origin[0], 0, object.position[1] - origin[1]);
          transform.rotation.set(0, object.rotation, 0);
          transform.scale.set(object.scale * (object.longitudinalScale ?? 1), object.scale, object.scale);
          transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
      }
      scene.add(group); bounds = new THREE.Box3().setFromObject(group);
      if (bounds.isEmpty()) throw new Error('Das Modell enthält keine sichtbaren Flächen.');
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const groundSize = Math.max(size.x, size.z, 6) * 1.35 + 4;
      ground.scale.set(groundSize, groundSize, 1); ground.position.set(center.x, -.035, center.z);
      grid = new THREE.GridHelper(groundSize, 20, '#819473', '#95a785');
      grid.position.set(center.x, -.025, center.z);
      grid.material.transparent = true; grid.material.opacity = .3;
      scene.add(grid);
      signature = key; container.dataset.previewObjects = String(objects.length);
      resize();
      const kind = barrier.kind === 'fence' ? 'Zaun' : 'Mauer';
      status(`${kind} · ${objects.length} automatisch gesetzte Teile · gleiche Modelle wie im Spiel`, 'ready');
      return true;
    } catch (error) {
      if (disposed || request !== revision) return false;
      removeDrawing(); signature = '';
      if (renderer && scene && camera) renderer.clear();
      status(`3D-Vorschau nicht verfügbar. Über „Spielen“ kannst du die Strecke testen. ${error.message ?? ''}`, 'error');
      return false;
    }
  }

  function clear() {
    ++revision; signature = ''; removeDrawing();
    if (renderer) renderer.clear();
    status('Eine Strecke auswählen und die 3D-Vorschau öffnen.', 'empty');
  }

  function dispose() {
    if (disposed) return;
    clear(); disposed = true; observer?.disconnect();
    ground?.geometry.dispose(); ground?.material.dispose();
    // Already completed cache entries are released here. Pending loads see
    // disposed in getModels and release themselves when they resolve.
    for (const pending of models.values()) pending.then(loaded => {
      // releaseModels also covers a load that resolved immediately before
      // dispose's microtask boundary and prevents double disposal.
      releaseModels(loaded);
    }).catch(() => {});
    models.clear();
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
  }

  status('Eine Strecke auswählen und die 3D-Vorschau öffnen.', 'empty');
  return { show, clear, dispose };
}
