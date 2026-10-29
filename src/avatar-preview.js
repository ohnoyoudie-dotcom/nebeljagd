import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import avatarUrl from '../assets/characters/adventurer.glb?url&inline';
import './avatar-preview.css';

const canvas = document.querySelector('#avatar-canvas');
const container = canvas.parentElement;
const status = document.querySelector('#model-status');
const errorPanel = document.querySelector('#preview-error');
const scrubber = document.querySelector('#animation-time');
const timeLabel = document.querySelector('#time-label');
const playButton = document.querySelector('#play-pause');
const replayButton = document.querySelector('#replay');
let renderer, controls, frame, mixer, model, selected, duration = 0;
let playing = true, loaded = false, speed = 1, viewSpan = 2.65, disposed = false;
let currentClip = 'Idle_Nebeljagd';
const actions = new Map();
const stats = {};
const scene = new THREE.Scene();
scene.background = new THREE.Color('#263333');
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .05, 60);
const clock = new THREE.Clock();
const clipNames = ['Idle_Nebeljagd', 'Run_Nebeljagd', 'Roll_Nebeljagd'];

function fail(error) {
  status.textContent = 'Vorschau nicht verfügbar';
  errorPanel.hidden = false;
  errorPanel.textContent = 'Die 3D-Vorschau konnte nicht geladen werden. Bitte nutze einen aktuellen Browser mit WebGL 2. ' + (error?.message || String(error));
}

function resize() {
  if (!renderer) return;
  const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
  const aspect = width / height;
  camera.left = -viewSpan * aspect / 2; camera.right = viewSpan * aspect / 2;
  camera.top = viewSpan / 2; camera.bottom = -viewSpan / 2;
  camera.updateProjectionMatrix();
}

function setView(name) {
  camera.zoom = 1;
  const presets = {
    game: { target: [0, .85, 0], offset: [0, 29, 18], span: 2.65 },
    front: { target: [0, .92, 0], offset: [0, .1, 8], span: 2.3 },
    back: { target: [0, .92, 0], offset: [0, .1, -8], span: 2.3 },
    side: { target: [0, .92, 0], offset: [8, .1, 0], span: 2.3 },
    face: { target: [0, 1.68, 0], offset: [.3, .05, 5], span: .62 },
  };
  const preset = presets[name];
  if (!preset || !controls) return;
  controls.target.fromArray(preset.target);
  camera.position.copy(controls.target).add(new THREE.Vector3(...preset.offset).normalize().multiplyScalar(8));
  viewSpan = preset.span;
  resize(); controls.update();
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
  document.querySelector('#view-hint').textContent = (name === 'game' ? 'Winkel der Spielkamera, vergrößert · ' : '') + 'Ziehen zum Drehen · Scrollen / zwei Finger zum Zoomen';
}

function updatePlaybackUi() {
  playButton.textContent = playing ? 'Pause' : 'Abspielen';
  playButton.setAttribute('aria-pressed', String(playing));
  const time = Math.min(duration, selected?.time || 0);
  scrubber.value = String(time);
  timeLabel.textContent = `${time.toFixed(2).replace('.', ',')} / ${duration.toFixed(2).replace('.', ',')} s`;
}

function selectClip(name) {
  const action = actions.get(name);
  if (!action) return;
  mixer.stopAllAction();
  currentClip = name; selected = action;
  action.reset(); action.enabled = true; action.clampWhenFinished = true;
  action.setLoop(name === 'Roll_Nebeljagd' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  action.play(); duration = action.getClip().duration; playing = true;
  scrubber.max = String(duration);
  mixer.update(0);
  document.querySelectorAll('[data-clip]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.clip === name)));
  updatePlaybackUi();
}

async function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minZoom = .55; controls.maxZoom = 3.5;
  controls.maxPolarAngle = Math.PI * .9;
  scene.add(new THREE.HemisphereLight('#d3e3e6', '#62513d', 2.1));
  const key = new THREE.DirectionalLight('#ffe7c7', 3.0);
  key.position.set(-3, 5, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2; key.shadow.camera.right = 2;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -2;
  key.shadow.camera.near = .5; key.shadow.camera.far = 14;
  key.shadow.normalBias = .012;
  key.shadow.intensity = .35;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#b8d8e9', 1.45);
  rim.position.set(2, 3, -3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: '#35423e', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.018; floor.receiveShadow = true;
  scene.add(floor);
  setView('game');
  const observer = new ResizeObserver(resize); observer.observe(container);
  function tick() {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const delta = Math.min(clock.getDelta(), .05);
    if (!document.hidden && playing) mixer?.update(delta * speed);
    controls.update(); renderer.render(scene, camera); updatePlaybackUi();
  }
  tick();
  window.addEventListener('pagehide', event => {
    if (event.persisted || disposed) return;
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
    if (mixer && model) { mixer.stopAllAction(); mixer.uncacheRoot(model); }
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(node => {
      if (!node.isMesh) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    renderer.dispose();
  });
  const gltf = await new GLTFLoader().loadAsync(avatarUrl);
  if (disposed) return;
  model = gltf.scene; scene.add(model);
  let triangles = 0, meshes = 0;
  const materials = new Set(), joints = new Set();
  model.traverse(node => {
    if (!node.isMesh) return;
    meshes += 1; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    node.castShadow = node.receiveShadow = true; node.frustumCulled = false;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    node.skeleton?.bones.forEach(bone => joints.add(bone));
  });
  const bounds = new THREE.Box3().setFromObject(model);
  Object.assign(stats, { triangles, meshes, materials: materials.size, joints: joints.size, height: bounds.max.y - bounds.min.y });
  mixer = new THREE.AnimationMixer(model);
  for (const name of clipNames) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!clip) throw new Error(`Animation ${name} fehlt im Modell.`);
    actions.set(name, mixer.clipAction(clip));
  }
  mixer.addEventListener('finished', event => { if (event.action === selected) { playing = false; updatePlaybackUi(); } });
  loaded = true;
  status.textContent = `${(stats.height).toFixed(2).replace('.', ',')} m · ${triangles.toLocaleString('de-DE')} Dreiecke · ${joints.size} Gelenke · 3 Animationen`;
  document.querySelectorAll('[data-clip], #play-pause, #replay, #animation-time').forEach(element => { element.disabled = false; });
  selectClip('Idle_Nebeljagd');
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-clip]').forEach(button => button.addEventListener('click', () => selectClip(button.dataset.clip)));
playButton.addEventListener('click', () => {
  if (!selected) return;
  if (!playing && selected.time >= duration) selectClip(currentClip);
  else playing = !playing;
  updatePlaybackUi();
});
replayButton.addEventListener('click', () => selectClip(currentClip));
document.querySelector('#playback-speed').addEventListener('change', event => { speed = Number(event.target.value); });
scrubber.addEventListener('input', () => {
  if (!selected) return;
  playing = false; selected.paused = false; selected.enabled = true;
  selected.time = Number(scrubber.value); mixer.update(0); updatePlaybackUi();
});
window.nebeljagdAvatarPreviewState = () => ({ loaded, clip: currentClip, time: selected?.time || 0, duration, playing, speed, stats });
init().catch(fail);
