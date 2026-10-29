import * as THREE from 'three';
import './style.css';
import { createGeneratedWorld } from './generated-world.js';
import defaultMap from '../worldmap.json';
import { zoneAt as mapZoneAt, getWorldmapStats } from './map/model.js';
import { loadRuntimeWorldmap, importRuntimeWorldmap } from './map/runtime-document.js';
import { createCharacter } from './character.js';
import { createPickups } from './pickups.js';
import { createZone } from './zone.js';
import { createWeapons } from './weapons.js';
import { createUI } from './ui.js';
import { createVision } from './vision.js';
import { createCombat } from './combat.js';
import { createChests } from './chests.js';
import { createHealthBars } from './health-bars.js';
import { createPracticeActors } from './practice-actors.js';
import { createSnowFootprints } from './snow-footprints.js';
import { createDamageFeedback } from './damage-feedback.js';
import { MAX_HEALTH, START_HEALTH, ROLL_SPEED, ROLL_DURATION, ROLL_COOLDOWN,
  healedHealth } from './rules.js';

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const requestedQuality = new URLSearchParams(location.search).get('quality');
const state = {
  phase: 'ready', health: START_HEALTH, maxHealth: MAX_HEALTH, elapsed: 0,
  gold: 0, inDanger: false, moving: false, distance: 0, snowWeight: 0,
  rollCooldown: 0, rollRemaining: 0, direction: Math.PI,
  quality: requestedQuality === 'low' || (requestedQuality !== 'high' && coarsePointer) ? 'low' : 'high',
};
const keys = new Set();
const stick = new THREE.Vector2();
let ready = false;
let inputPointer = null;
const frameSamples = [];

const ui = createUI({
  onMapImport: async file => {
    try { ui.toast(await importRuntimeWorldmap(file), 'success'); }
    catch (error) { ui.toast(`Karte nicht geladen: ${error.message}`, 'danger'); }
  },
  onStart: () => { if (ready) { setPhase('playing'); ui.toast('Willkommen auf der großen Nebelinsel. Erkunde die Landschaften und bleib vor dem Nebel.'); } },
  onPause: () => { if (state.phase === 'playing') setPhase('paused'); },
  onResume: () => { if (state.phase === 'paused') setPhase('playing'); },
  onRestart: () => { if (ready) reset(); },
  onDash: () => roll(),
  onAttack: () => attackWeapon(),
  onInteract: () => interactWeapon(),
  onQualityChange: (quality) => setQuality(quality),
});

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#game'), antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  ui.showError('Diese Welt benötigt WebGL 2. Bitte öffne sie in einem aktuellen Browser mit aktivierter Grafikbeschleunigung.');
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#718b8c');
// The full camera view stays clear; obstacle line-of-sight still hides actors behind cover.
scene.fog = null;
const camera = new THREE.OrthographicCamera(-20, 20, 17, -17, 0.1, 180);
const cameraFocus = new THREE.Vector3(-8, 0, 8);
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 29, 18);

scene.add(new THREE.HemisphereLight('#c8dfdf', '#34594a', 1.9));
const sun = new THREE.DirectionalLight('#fff0d8', 2.15);
sun.position.set(-22, 42, 20);
sun.castShadow = true;
sun.shadow.intensity = 0.5;
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 110;
sun.shadow.bias = -0.00006;
sun.shadow.normalBias = 0.012;
sun.shadow.radius = 3;
sun.shadow.blurSamples = 24;
scene.add(sun, sun.target);

ui.setLoading?.('Die Insel wird aus der Karte erzeugt …');
let documentSource, world;
try {
  documentSource = await loadRuntimeWorldmap(defaultMap);
  world = await createGeneratedWorld(scene, { quality: state.quality, map: documentSource.map });
} catch (error) {
  ui.showError(`Die Welt konnte nicht erzeugt werden: ${error.message}`);
  throw error;
}
ui.setWorldmap?.(world.map);
const worldStats = getWorldmapStats(world.map);
function zoneAt(elapsed) {
  const value = mapZoneAt(world.map, elapsed);
  const phase = world.map.zone.phases.find(item => item.id === value.phase);
  const countdown = value.shrinking ? value.phaseRemainingSeconds : Math.max(0, value.phaseRemainingSeconds - (phase?.shrinkSeconds ?? 0));
  return { ...value, countdown, progress: Math.min(1, Math.max(0, elapsed / worldStats.matchDurationSeconds)) };
}
const visualScale = world.visualScale;
ui.setLoading?.('Die Figur wird vorbereitet …');
const character = await createCharacter(world.root);
character.group.scale.setScalar(1.2);
const player = character.group.position;
player.set(world.spawn.x, world.heightAt(world.spawn.x, world.spawn.z), world.spawn.z);
const vision = createVision(world.root, world, { radius: 128, samples: 2048 });
vision.update(player, 0);
const isVisible = (position, options = { concealed: false }) => vision.isVisible(position, options);
const healthBars = createHealthBars(world.root);
healthBars.add('player', { position: player, health: state.health, maxHealth: MAX_HEALTH, local: true, height: 2.9 });
const damageFeedback = createDamageFeedback(world.root, {
  isVisible: (position, options = {}) => vision.isVisible(position, {
    ...options, concealed: options.concealed ?? world.concealmentAt(position.x, position.z) > .01,
  }),
});
const combat = createCombat({ onHit: (result, target) => {
  healthBars.set(target.id, { health: target.health, maxHealth: target.maxHealth });
  if (target.destructible) {
    target.destructibleRef.health = target.health;
    if (result.killed) world.destroyDestructible(target.id);
  }
  damageFeedback.addHit(result, target);
} });
for (const object of world.destructibles ?? []) {
  const target = combat.addTarget({ id: object.id, name: object.name, position: object.position, radius: object.radius,
    height: object.height, maxHealth: object.maxHealth, health: object.health, destructible: true });
  target.destructibleRef = object;
}
const pickups = createPickups(world.root, { placements: world.map.objects, heightAt: world.heightAt, isVisible, world, revealSceneryThroughFog: false });
const weapons = createWeapons(world.root, character.group, world, character,
  { placements: world.map.objects, heightAt: world.heightAt, combat, ownerId: 'player', isVisible, revealSceneryThroughFog: false });
const chests = createChests(world.root, { placements: world.map.objects, heightAt: world.heightAt, world, isVisible, revealSceneryThroughFog: false,
  onDrop: (item, launch) => {
    if (item.kind === 'gold' || item.type === 'gold') pickups.addDrop(item, launch);
    else weapons.addDrop(item, launch);
  },
});
const practiceActors = createPracticeActors(world.root, { world, combat, healthBars, vision });
const snowFootprints = createSnowFootprints(world.root, world);
const grassInteractors = [];
const footprintSources = [];
let playerGrassStrength = 0, playerGrassDirX = 0, playerGrassDirZ = 1;
vision.register();
const zone = createZone(world.root, { bounds: world.map.bounds, center: world.map.zone.center, initialRadius: world.map.zone.initialRadius });
const inactivePlayer = new THREE.Vector3(1000, 0, 1000);
const moveDirection = new THREE.Vector3();
const lastPosition = new THREE.Vector3();
const rollDirection = new THREE.Vector3(0, 0, -1);
const sunlightOffset = new THREE.Vector3(-22, 42, 20);
let currentZone = zoneAt(0);
let lastShelter = null;
let lastConcealment = false;

function clearInput() {
  keys.clear(); stick.set(0, 0); inputPointer = null;
  if (ui.joystickKnob) ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
}

function setPhase(phase) {
  state.phase = phase;
  clearInput();
  state.moving = false;
  ui.setPhase(phase);
  character?.setDead(phase === 'dead');
  updateUI();
}

function reset() {
  Object.assign(state, { health: START_HEALTH, elapsed: 0, gold: 0, inDanger: false,
    distance: 0, moving: false, actualSpeed: 0, snowWeight: 0, rollCooldown: 0, rollRemaining: 0, direction: Math.PI,
    hiddenInGrass: false, shelter: null });
  player.set(world.spawn.x, world.heightAt(world.spawn.x, world.spawn.z), world.spawn.z);
  cameraFocus.copy(player).multiplyScalar(visualScale);
  pickups.reset(); weapons.reset(); chests.reset(); combat.reset(); practiceActors.reset(); snowFootprints.reset(); world.resetDestructibles?.(); character.setConcealed(false);
  damageFeedback.reset();
  healthBars.set('player', { health: START_HEALTH, snap: true });
  healthBars.reset();
  character.resetMotion?.(state.direction);
  playerGrassStrength = 0; playerGrassDirX = Math.sin(state.direction); playerGrassDirZ = Math.cos(state.direction);
  lastConcealment = false; lastShelter = null; currentZone = zoneAt(0);
  setPhase('playing');
  ui.toast('Ein neuer Streifzug beginnt.');
}

function setQuality(quality) {
  state.quality = quality === 'low' ? 'low' : 'high';
  const high = state.quality === 'high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1.15));
  world.setQuality?.(state.quality);
  const size = high ? 4096 : 2048;
  sun.shadow.blurSamples = high ? 24 : 14;
  sun.shadow.radius = high ? 3 : 2;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
  }
  resize();
}

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  const aspect = width / height;
  // Slightly closer top-down framing makes characters, grass and combat easier to read.
  const viewHeight = (aspect < 0.8 ? 30.5 : 20.5) * visualScale;
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function roll() {
  if (state.phase !== 'playing' || state.rollCooldown > 0) return;
  rollDirection.set(Math.sin(state.direction), 0, Math.cos(state.direction));
  state.rollRemaining = ROLL_DURATION;
  state.rollCooldown = ROLL_COOLDOWN;
  character.roll(state.direction);
}

function nearbyInteraction() {
  const weapon = weapons.nearest(player), chest = chests.nearest(player);
  const distance = item => item ? Math.hypot((item.x ?? item.position?.[0] ?? 0) - player.x,
    (item.z ?? item.position?.[1] ?? 0) - player.z) : Infinity;
  return distance(chest) < distance(weapon) ? { chest, weapon: null } : { weapon, chest: null };
}

function interactWeapon() {
  if (state.phase !== 'playing') return;
  const nearby = nearbyInteraction();
  const result = nearby.chest ? chests.interact(player) : weapons.interact(player);
  if (result) { ui.toast(result.message, 'success'); updateUI(); }
}

function attackWeapon() {
  if (state.phase !== 'playing') return;
  const result = weapons.attack(player, state.direction);
  if (!result && !weapons.equipped) ui.toast('Heb zuerst eine Waffe mit E auf oder öffne eine Truhe.');
}

function simulate(dt) {
  if (state.phase !== 'playing') return;
  state.elapsed += dt;
  combat.update(dt);
  state.rollCooldown = Math.max(0, state.rollCooldown - dt);
  state.rollRemaining = Math.max(0, state.rollRemaining - dt);
  moveDirection.set(
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x,
    0,
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + stick.y,
  );
  const inputLength = Math.min(1, moveDirection.length());
  if (moveDirection.lengthSq() > 0.001) moveDirection.normalize();
  if (state.rollRemaining > 0) moveDirection.copy(rollDirection);
  lastPosition.copy(player);
  const speed = state.rollRemaining > 0 ? ROLL_SPEED : world.map.gameplay.walkSpeedMetersPerSecond * inputLength;
  player.addScaledVector(moveDirection, speed * dt);
  world.resolveMovement(player, 0.42);
  practiceActors.resolvePlayerMovement(player, 0.42);
  world.resolveMovement(player, 0.42);
  player.y = world.heightAt(player.x, player.z);
  const travelled = Math.hypot(player.x - lastPosition.x, player.z - lastPosition.z);
  state.actualSpeed = travelled / dt;
  state.moving = travelled > 0.0005;
  state.distance += travelled;
  if (state.moving) state.direction = Math.atan2(player.x - lastPosition.x, player.z - lastPosition.z);
  currentZone = zoneAt(state.elapsed);
  const wasInDanger = state.inDanger;
  state.inDanger = Math.hypot(player.x - currentZone.center[0], player.z - currentZone.center[1]) > currentZone.radius;
  if (state.inDanger && !wasInDanger) ui.toast('Der Nebel zehrt an deiner Kraft. Zurück in den Kreis!', 'danger');
  if (!state.inDanger && wasInDanger) ui.toast('Du bist wieder in Sicherheit.', 'success');
  const previousHealth = state.health;
  state.health = Math.max(0, state.health - (state.inDanger ? world.map.zone.damagePerSecond * dt : 0));
  if (state.health < previousHealth) damageFeedback.addHit({ targetId: 'player', damage: previousHealth - state.health, type: 'zone' },
    { id: 'player', position: player, local: true });
  if (state.health === 0) setPhase('dead');
}

function onCollect(item) {
  if (item.type === 'heart') {
    state.health = healedHealth(state.health, item.amount);
    ui.toast(`+${Math.round(item.amount)} Leben · Ein Geschenk des Waldes`, 'success');
  } else {
    state.gold += item.amount;
    ui.toast(`+${item.amount} Gold`, 'success');
  }
}

function updateUI() {
  const nearby = nearbyInteraction();
  ui.update({ ...state, zoneCenter: { x: currentZone.center[0], z: currentZone.center[1] }, zoneRadius: currentZone.radius, zoneCountdown: currentZone.countdown,
    zoneProgress: currentZone.progress, zoneShrinking: currentZone.shrinking,
    rollCooldownDuration: ROLL_COOLDOWN, equippedWeapon: weapons.equipped,
    equippedItem: weapons.equippedItem, nearWeapon: nearby.weapon, nearChest: nearby.chest, attackCooldown: weapons.attackCooldown,
    shelter: state.shelter, hiddenInGrass: Boolean(state.hiddenInGrass),
    houses: world.houses.map(house => ({ ...house, active: state.shelter === house.name,
      roofVisible: false })),
    player: { x: player.x, z: player.z, direction: state.direction },
    pickups: pickups.items.filter(item => isVisible({ x: item.x, z: item.z })),
    visibleMapObjects: [
      ...chests.items.filter(item => !item.opened && item.group.visible && isVisible(item)).map(({ id, x, z }) => ({ id, kind: 'chest', x, z })),
      ...weapons.items.filter(item => !item.collected && item.group.visible && !(item.flight > 0) && isVisible(item))
        .map(({ id, type, x, z, rarity, color }) => ({ id, kind: type, x, z, rarity, color })),
    ],
  });
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (state.phase === 'playing') setPhase('paused');
    else if (state.phase === 'paused') setPhase('playing');
    return;
  }
  if (state.phase !== 'playing') return;
  if (['Space', 'KeyE', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    event.preventDefault(); keys.add(event.code);
  }
  if (event.code === 'Space' && !event.repeat) roll();
  if (event.code === 'KeyE' && !event.repeat) interactWeapon();
  if (event.code === 'KeyF' && !event.repeat) attackWeapon();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  clearInput();
  if (state.phase === 'playing') setPhase('paused');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') setPhase('paused');
});
window.addEventListener('resize', resize);

function moveStick(event) {
  const rect = ui.joystick.getBoundingClientRect();
  const limit = rect.width * 0.32;
  stick.set((event.clientX - rect.left - rect.width / 2) / limit,
    (event.clientY - rect.top - rect.height / 2) / limit);
  if (stick.length() > 1) stick.normalize();
  if (ui.joystickKnob) ui.joystickKnob.style.transform = `translate(-50%, -50%) translate(${stick.x * limit}px, ${stick.y * limit}px)`;
}
ui.joystick.addEventListener('pointerdown', (event) => {
  if (state.phase !== 'playing') return;
  event.preventDefault(); inputPointer = event.pointerId;
  ui.joystick.setPointerCapture(event.pointerId); moveStick(event);
});
ui.joystick.addEventListener('pointermove', (event) => { if (event.pointerId === inputPointer) moveStick(event); });
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  ui.joystick.addEventListener(eventName, (event) => {
    if (event.pointerId !== inputPointer) return;
    inputPointer = null; stick.set(0, 0);
    if (ui.joystickKnob) ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
  });
}

document.querySelector('#game').addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  if (state.phase === 'playing') setPhase('paused');
  ui.showError('Die Grafikverbindung wurde unterbrochen. Lade die Seite neu, um die Insel erneut zu betreten.');
});

window.nebeljagdTestState = () => ({
  renderer: 'three-webgl2', phase: state.phase, health: state.health, maxHealth: state.maxHealth,
  elapsed: state.elapsed, moving: state.moving, distance: state.distance,
  position: { x: player.x, y: player.y, z: player.z }, direction: state.direction,
  rollCooldown: state.rollCooldown, dashCooldown: state.rollCooldown,
  rollRemaining: state.rollRemaining, gold: state.gold, quality: state.quality,
  equippedWeapon: weapons.equipped, equippedItem: weapons.equippedItem, attackCooldown: weapons.attackCooldown,
  combat: weapons.telemetry,
  vision: vision.inspect(), healthBars: healthBars.inspect(), practiceActors: practiceActors.inspect(),
  snowFootprints: snowFootprints.inspect(),
  damageFeedback: damageFeedback.inspect(), minimap: ui.inspectMinimap?.(),
  chests: chests.items.map(({ id, x, z, opened, group }) => ({ id, x, z, opened, visible: group.visible })),
  world: { mapId: world.map.id, mapName: world.map.name, source: documentSource.source, bounds: world.map.bounds, stats: world.stats, biome: world.biomeAt(player.x, player.z), groundHeight: world.groundHeightAt(player.x, player.z), isWater: world.isWater(player.x, player.z), objects: world.map.objects,
    treeCount: world.trees.length, trees: world.trees, grassPatches: world.grassPatches,
    destructibles: world.destructibles?.map(({ id, name, kind, x, z, health, maxHealth, destroyed }) => ({ id, name, kind, x, z, health, maxHealth, destroyed })) ?? [],
    landscape: world.map.landscape ?? null,
    importedAssets: world.importedAssets,
    projectileObstacles: new URLSearchParams(location.search).has('inspect') ? world.projectileObstacles : undefined },
  nearWeapon: weapons.nearest(player)?.type ?? null,
  nearChest: chests.nearest(player)?.id ?? null,
  weaponDrops: weapons.items.map(({ id, type, rarity, x, z, collected, group }) => ({ id, type, rarity, x, z, collected, visible: group.visible })),
  hiddenInGrass: Boolean(state.hiddenInGrass), hiddenFromOtherPlayers: Boolean(state.hiddenInGrass),
  character: { ...character.group.userData.characterAsset, opacity: character.group.userData.concealmentOpacity,
    locomotion: character.group.userData.locomotion, snowWeight: character.group.userData.snowWeight ?? 0,
    snowSinkMeters: character.group.userData.snowSinkMeters ?? 0,
    snowClipStrength: character.group.userData.snowClipStrength ?? 0,
    snowClipHeight: character.group.userData.snowClipHeight ?? null },
  concealment: world.concealmentAt(player.x, player.z), shelter: state.shelter ?? null,
  houses: world.houses.map(({ id, name, x, y, z, halfWidth, halfDepth, rotation, scale, floorHeight, roof, interior, frontFacade }) => ({ id, name, x, y, z, halfWidth, halfDepth, rotation, scale, floorHeight,
    roofVisible: roof.visible, interiorVisible: interior.visible, frontFacadeVisible: frontFacade.visible, frontFacadeParts: frontFacade.children.length })),
  zone: { ...currentZone, inDanger: state.inDanger },
  pickups: pickups.items.map(({ id, type, x, z, collected, group }) => ({ id, type, x, z, collected, visible: group.visible })),
  camera: { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, focus: { x: cameraFocus.x, y: cameraFocus.y, z: cameraFocus.z }, orthographicHeight: camera.top - camera.bottom },
  rendering: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    frameMs: frameSamples.length ? frameSamples.reduce((sum, ms) => sum + ms, 0) / frameSamples.length : null },
  shadows: { type: renderer.shadowMap.type === THREE.VSMShadowMap ? 'VSM' : renderer.shadowMap.type,
    mapSize: sun.shadow.mapSize.x, bias: sun.shadow.bias, normalBias: sun.shadow.normalBias,
    radius: sun.shadow.radius, blurSamples: sun.shadow.blurSamples },
});

// Explicit capture mode for reproducible local QA, absent from normal player sessions.
if (new URLSearchParams(location.search).has('inspect')) {
  window.nebeljagdCaptureFrame = () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); };
  window.nebeljagdInspectVisibility = point => vision.isVisible(point, { concealed: false });
  window.nebeljagdInspect = ({ x = player.x, z = player.z, elapsed = state.elapsed, health = state.health,
    direction = state.direction } = {}) => {
    clearInput();
    player.set(x, world.heightAt(x, z), z);
    world.resolveMovement(player, .42);
    practiceActors.resolvePlayerMovement(player, .42);
    world.resolveMovement(player, .42);
    player.y = world.heightAt(player.x, player.z);
    state.elapsed = Math.max(0, elapsed); state.health = THREE.MathUtils.clamp(health, 1, MAX_HEALTH);
    state.direction = direction; state.actualSpeed = 0; state.moving = false; character.group.rotation.y = direction;
    character.resetMotion?.(direction);
    currentZone = zoneAt(state.elapsed);
    cameraFocus.set(player.x * visualScale, player.y * visualScale, (player.z - 1.5) * visualScale);
    setPhase('playing');
  };
}

setQuality(state.quality);
  cameraFocus.copy(player).multiplyScalar(visualScale);
ready = true;
ui.setPhase('ready');
ui.setLoading?.('');
let previousTime = null, accumulator = 0, time = 0, uiTimer = 0;
function frame(now) {
  // The first RAF timestamp may precede synchronous world/asset construction.
  // A negative accumulator would otherwise stall gameplay while rendering continues.
  const frameMs = previousTime === null ? 0 : Math.max(0, now - previousTime);
  if (frameMs > 0) frameSamples.push(frameMs);
  if (frameSamples.length > 90) frameSamples.shift();
  const dt = Math.min(0.1, frameMs / 1000);
  previousTime = now; time += dt; accumulator += dt;
  while (accumulator >= 1 / 60) { simulate(1 / 60); accumulator -= 1 / 60; }
  world.update(dt, time, player, currentZone.radius);
  vision.update(player, time);
  state.shelter = world.shelter;
  state.hiddenInGrass = world.concealmentAt(player.x, player.z) > 0.01;
  if (state.shelter !== lastShelter) {
    if (state.shelter) ui.toast(`Du betrittst ${state.shelter}. Wände bieten Deckung vor fremden Blicken.`, 'success');
    else if (lastShelter) ui.toast('Du verlässt das Haus.');
    lastShelter = state.shelter;
  }
  if (state.hiddenInGrass !== lastConcealment) {
    ui.toast(state.hiddenInGrass ? 'Im hohen Gras verborgen. Andere Spieler können dich nicht sehen.' : 'Du verlässt das dichte Gras.');
    lastConcealment = state.hiddenInGrass;
  }
  character.setConcealed(state.hiddenInGrass);
  state.snowWeight = snowFootprints.weightAt(player.x, player.z);
  character.update(state.phase === 'paused' ? 0 : dt, time, { moving: state.moving, speed: state.actualSpeed || 0,
    direction: state.direction, health: state.health, inDanger: state.inDanger, snowWeight: state.snowWeight,
    snowSurfaceY: world.snowSurfaceAt?.(player.x, player.z) ?? player.y });
  const playDelta = state.phase === 'playing' ? dt : 0;
  practiceActors.update(playDelta, time, player);
  grassInteractors.length = 0;
  const walkSpeed = Math.max(.1, world.map.gameplay.walkSpeedMetersPerSecond);
  const targetGrassStrength = state.moving ? THREE.MathUtils.clamp(state.actualSpeed / walkSpeed, .55, 1.15) : 0;
  const grassResponse = 1 - Math.exp(-playDelta * (targetGrassStrength > playerGrassStrength ? 12 : 3.1));
  playerGrassStrength = THREE.MathUtils.lerp(playerGrassStrength, targetGrassStrength, grassResponse);
  if (state.moving) {
    const targetX = Math.sin(state.direction), targetZ = Math.cos(state.direction);
    const directionResponse = 1 - Math.exp(-playDelta * 11);
    playerGrassDirX = THREE.MathUtils.lerp(playerGrassDirX, targetX, directionResponse);
    playerGrassDirZ = THREE.MathUtils.lerp(playerGrassDirZ, targetZ, directionResponse);
    const length = Math.hypot(playerGrassDirX, playerGrassDirZ) || 1;
    playerGrassDirX /= length; playerGrassDirZ /= length;
  }
  grassInteractors.push({
    x: player.x, z: player.z, radius: 1.12,
    dirX: playerGrassDirX, dirZ: playerGrassDirZ,
    strength: playerGrassStrength,
  });
  practiceActors.appendGrassInteractors(grassInteractors);
  world.setGrassInteractors?.(grassInteractors);
  footprintSources.length = 0;
  footprintSources.push({
    id: 'player', x: player.x, z: player.z, direction: state.direction,
    moving: state.phase === 'playing' && state.moving, speed: state.actualSpeed || 0,
    stepDistance: state.rollRemaining > 0 ? .78 : .58, lateral: .105,
  });
  practiceActors.appendFootprintSources?.(footprintSources);
  snowFootprints.update(state.elapsed, footprintSources);
  chests.update(playDelta, time, player);
  weapons.update(playDelta, time, player);
  if (state.phase === 'playing') {
    const automaticPickup = weapons.tryAutoPickup(player);
    if (automaticPickup) { ui.toast(automaticPickup.message, 'success'); updateUI(); }
  }
  pickups.update(playDelta, time, state.phase === 'playing' ? player : inactivePlayer,
    { health: state.health, maxHealth: MAX_HEALTH, onCollect, viewerPosition: player });
  zone.update(time, currentZone.radius, state.inDanger, player);
  cameraTarget.set(player.x * visualScale, player.y * visualScale, (player.z - 1.5) * visualScale);
  cameraFocus.lerp(cameraTarget, 1 - Math.exp(-dt * 4));
  camera.position.copy(cameraFocus).add(cameraOffset); camera.lookAt(cameraFocus);
  sun.position.copy(cameraFocus).add(sunlightOffset);
  sun.target.position.copy(cameraFocus);
  sun.target.updateMatrixWorld();
  healthBars.set('player', { health: state.health, maxHealth: MAX_HEALTH });
  healthBars.update(camera, { isVisible, dt: playDelta });
  damageFeedback.update(playDelta, camera);
  renderer.render(scene, camera);
  uiTimer += dt;
  if (uiTimer > 0.08) { updateUI(); uiTimer = 0; }
  requestAnimationFrame(frame);
}
updateUI();
requestAnimationFrame(frame);
