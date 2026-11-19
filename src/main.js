import { captureArrivalLandscape } from './arrival-landscape.js';
import { createStatusIndicators } from './status-indicators.js';
import { effectiveSightRadius } from './darkened-status.js';
import { aimKind, touchAimVector, directionTo } from './aim-input.js';
import * as THREE from 'three';
import './style.css';
import './lobby.css';
import './player-hud.css';
import './arrival-hud.css';
import { resolveArrivalTarget } from './arrival.js';
import { createMapArrival, portalArrivalPose, moveArrivalCursor } from './map-arrival.js';
import { createArrivalTeleport } from './arrival-teleport.js';
import { createLobbyMap } from './lobby-map.js';
import { requireLobbySession, watchLobbySession, leaveLobby } from './lobby-access.js';
import { createGeneratedWorld } from './generated-world.js';
import { isIPadDevice, initialGraphicsQuality, graphicsSettings } from './graphics-quality.js';
import defaultMap from '../worldmap.json';
import { zoneAt as mapZoneAt, getWorldmapStats } from './map/model.js';
import { loadRuntimeWorldmap, importRuntimeWorldmap } from './map/runtime-document.js';
import { createCharacter } from './character.js';
import { createPickups } from './pickups.js';
import { rollLootRarity } from './loot-tiers.js';
import { createZone } from './zone.js';
import { createWeapons } from './weapons.js';
import { loadTripoWeapons } from './tripo-weapons.js';
import { loadFireballModel } from './fireball-model.js';
import { loadProjectileModels } from './projectile-models.js';
import { loadStormTexture } from './storm-textures.js';
import { loadGravityTextures } from './gravity-textures.js';
import { createUI } from './ui.js';
import { createVision } from './vision.js';
import { createCombat } from './combat.js';
import { createChests } from './chests.js';
import { loadTripoChest, loadRareTripoChest } from './tripo-chest.js';
import { createHealthBars } from './health-bars.js';
import { createPracticeActors } from './practice-actors.js';
import { createSnowFootprints } from './snow-footprints.js';
import { createDamageFeedback } from './damage-feedback.js';
import { createProgressionState, awardDefeat } from './progression.js';
import { createLevelUpEffect } from './level-up-effect.js';
import { MAX_HEALTH, START_HEALTH, ROLL_SPEED, ROLL_DURATION, ROLL_COOLDOWN,
  healedHealth } from './rules.js';

const lobbyMode = document.body.dataset.mode === 'lobby' || new URLSearchParams(location.search).get('mode') === 'lobby';
// Resolve access before creating the renderer, world or character.
const lobbySession = lobbyMode ? await requireLobbySession() : null;
if (lobbyMode) { document.body.dataset.mode = 'lobby'; document.title = 'Magebrawl · Übungswiese'; }
const startingHealth = lobbyMode ? MAX_HEALTH : START_HEALTH;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const iPad = isIPadDevice(navigator);
const requestedQuality = new URLSearchParams(location.search).get('quality');
const deviceProfile = { iPad, coarsePointer, devicePixelRatio: window.devicePixelRatio || 1 };
const state = {
  phase: 'ready', ...createProgressionState(), health: startingHealth, lastDefeat: null, elapsed: 0,
  gold: 0, inDanger: false, moving: false, distance: 0, snowWeight: 0,
  rollCooldown: 0, rollRemaining: 0, direction: Math.PI,
  quality: initialGraphicsQuality({ requestedQuality, coarsePointer, iPad }),
};
const keys = new Set();
const stick = new THREE.Vector2();
let ready = false;
let inputPointer = null;
let aimDrag = null;
let aimDirection = null;
let mouseAimPointer = null;
let canvasAttackPointer = null;
const frameSamples = [];
const arrival = createMapArrival();
let resumePhase = 'playing';
let landingTarget = null, arrivalCursor = null, arrivalCursorValid = false;

const ui = createUI({
  practiceSession: lobbySession,
  onLeave: lobbyMode ? () => { if (ready) setPhase('paused'); void leaveLobby(lobbySession); } : undefined,
  onMapImport: async file => {
    if (lobbyMode) return;
    try { ui.toast(await importRuntimeWorldmap(file), 'success'); }
    catch (error) { ui.toast(`Karte nicht geladen: ${error.message}`, 'danger'); }
  },
  onStart: () => { if (ready && state.phase === 'ready') startArrival(); },
  onArrivalSelect: point => selectArrivalPoint(point),
  onPause: () => { if (['playing', 'deploying'].includes(state.phase)) setPhase('paused'); },
  onResume: () => { if (state.phase === 'paused') setPhase(resumePhase); },
  onRestart: () => { if (ready) reset(); },
  onDash: () => roll(),
  onAttack: event => attackWeapon(event),
  onAttackMove: event => moveAttackAim(event),
  onAttackRelease: event => releaseWeapon(event),
  onAttackCancel: () => cancelAttackAim(),
  onInteract: () => interactWeapon(),
  onQualityChange: (quality) => setQuality(quality),
});

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#game'), antialias: true, stencil: true, powerPreference: 'high-performance' });
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
const groundCamera = new THREE.OrthographicCamera(-20, 20, 17, -17, 0.1, 180);
let camera = groundCamera;
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

ui.setLoading?.(lobbyMode ? 'Die Übungswiese wird vorbereitet …' : 'Die Insel wird aus der Karte erzeugt …');
let documentSource, world;
try {
  documentSource = lobbyMode ? { map: createLobbyMap(), source: 'lobby' } : await loadRuntimeWorldmap(defaultMap);
  world = await createGeneratedWorld(scene, { quality: state.quality, map: documentSource.map });
} catch (error) {
  ui.showError(`Die Welt konnte nicht erzeugt werden: ${error.message}`);
  throw error;
}
ui.setWorldmap?.(world.map);
if(!lobbyMode) {
  ui.setLoading?.('Die Landschaft für die Startauswahl wird vorbereitet …');
  try { ui.setArrivalBackdrop(captureArrivalLandscape(renderer,world)); }
  catch(error) { console.warn('Landschaftsvorschau nicht verfügbar; verwende Kartenumrisse.',error); }
}
const worldStats = getWorldmapStats(world.map);
function zoneAt(elapsed) {
  if (lobbyMode) return { center: [...world.map.zone.center], radius: world.map.zone.initialRadius,
    phase: 'practice', shrinking: false, countdown: 0, progress: 0, phaseRemainingSeconds: 0 };
  const value = mapZoneAt(world.map, elapsed);
  const phase = world.map.zone.phases.find(item => item.id === value.phase);
  const countdown = value.shrinking ? value.phaseRemainingSeconds : Math.max(0, value.phaseRemainingSeconds - (phase?.shrinkSeconds ?? 0));
  return { ...value, countdown, progress: Math.min(1, Math.max(0, elapsed / worldStats.matchDurationSeconds)) };
}
const visualScale = world.visualScale;
ui.setLoading?.('Die Figur wird vorbereitet …');
const character = await createCharacter(world.root);
character.group.scale.setScalar(1.2);
character.group.traverse(node=>node.layers.enable(1));
scene.traverse(node=>{if(node.isLight)node.layers.enable(1);});
const player = character.group.position;
const attackControl=document.querySelector('#attackBtn');
player.set(world.spawn.x, world.heightAt(world.spawn.x, world.spawn.z), world.spawn.z);
const visualPlayer = player.clone();
const arrivalTeleport = createArrivalTeleport(world.root, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
const vision = createVision(world.root, world, { radius: 128, samples: 2048 });
vision.update(player, 0);
const isVisible = (position, options = { concealed: false }) => vision.isVisible(position, options);
world.setDebrisVisibility?.(isVisible);
const healthBars = createHealthBars(world.root);
healthBars.add('player', { position: visualPlayer, health: state.health, maxHealth: state.maxHealth,
  level: state.level, local: true, height: 2.9 });
const levelUpEffect = createLevelUpEffect(world.root, { onGlow: character.setLevelUpGlow });
const damageFeedback = createDamageFeedback(world.root, {
  isVisible: (position, options = {}) => vision.isVisible(position, {
    ...options, concealed: options.concealed ?? world.concealmentAt(position.x, position.z) > .01,
  }),
});
const combat = createCombat({ onHit: (result, target) => {
  healthBars.set(target.id, { health: target.health, maxHealth: target.maxHealth });
  if (target.destructible && target.destructibleRef) {
    target.destructibleRef.health = target.health;
    if (result.killed) world.destroyDestructible(target.id);
  }
  damageFeedback.addHit(result, target);
  if (target.local && result.killed && state.phase === 'playing') setPhase('dead');
}, onDefeat: (result, target) => {
  if (state.phase !== 'playing') return;
  const advancement = awardDefeat(state, result, target);
  if (!advancement) return;
  state.lastDefeat = { targetId: result.targetId, sourceId: result.sourceId, type: result.type, level: state.level };
  healthBars.set('player', { health: state.health, maxHealth: state.maxHealth, level: state.level, snap: true });
  updateUI();
  ui.showLevelUp({ level: state.level, healthGain: advancement.healthGained });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  healthBars.pulseLevel('player', { reducedMotion });
  levelUpEffect.trigger({ position: player, level: state.level,
    reducedMotion });
} });
// The local avatar shares combat statuses with every other actor. Health stays
// authoritative in progression state, including healing, zone damage and level-ups.
const localCombatTarget = combat.addTarget({ id: 'player', position: player, radius: .42, height: 2.3,
  health: state.health, maxHealth: state.maxHealth, local: true });
Object.defineProperties(localCombatTarget, {
  health: { get: () => state.health, set: value => { state.health = value; } },
  maxHealth: { get: () => state.maxHealth, set: value => { state.maxHealth = value; } },
});
for (const object of world.destructibles ?? []) {
  const target = combat.addTarget({ id: object.id, name: object.name, position: object.position, radius: object.radius,
    height: object.height, maxHealth: object.maxHealth, health: object.health, destructible: true });
  target.destructibleRef = object;
}
const pickups = createPickups(world.root, { placements: world.map.objects, heightAt: world.heightAt, isVisible, world, revealSceneryThroughFog: false });
const weapons = createWeapons(world.root, character.group, world, character,
  { placements: world.map.objects, heightAt: world.heightAt, combat, ownerId: 'player', isVisible, revealSceneryThroughFog: false,
    rollRarity: rollLootRarity,
    onTeleport: (_from,to) => { character.group.position.copy(to);state.moving=false;state.actualSpeed=0;state.rollRemaining=0;character.resetMotion?.(state.direction); },
    tripoPrototypes: await loadTripoWeapons(world.map.objects), fireProjectilePrototype: await loadFireballModel(),
    projectilePrototypes: await loadProjectileModels(), gravityTextures: await loadGravityTextures(), stormTexture: await loadStormTexture() });
const chests = createChests(world.root, { placements: world.map.objects, heightAt: world.heightAt, world, isVisible, revealSceneryThroughFog: false,
  tripoPrototype: await loadTripoChest(world.map.objects),
  rareTripoPrototype: await loadRareTripoChest(world.map.objects),
  onDrop: (item, launch) => {
    if (item.kind === 'gold' || item.type === 'gold') pickups.addDrop(item, launch);
    else weapons.addDrop(item, launch);
  },
});
const practiceActors = createPracticeActors(world.root, { world, combat, healthBars, vision });
const statusIndicators=createStatusIndicators(document.querySelector('#ui'),{combat,world,isVisible});
const snowFootprints = createSnowFootprints(world.root, world);
const grassInteractors = [];
const footprintSources = [];
let playerGrassStrength = 0, playerGrassDirX = 0, playerGrassDirZ = 1;
vision.register();
const zone = lobbyMode ? null : createZone(world.root, { bounds: world.map.bounds, center: world.map.zone.center, initialRadius: world.map.zone.initialRadius });
const inactivePlayer = new THREE.Vector3(1000, 0, 1000);
const moveDirection = new THREE.Vector3();
const lastPosition = new THREE.Vector3();
const rollDirection = new THREE.Vector3(0, 0, -1);
const sunlightOffset = new THREE.Vector3(-22, 42, 20);
let currentZone = zoneAt(0);
let lastShelter = null;
let lastConcealment = false;

function clearInput() {
  keys.clear(); stick.set(0, 0); inputPointer = null; cancelAttackAim();
  if (ui.joystickKnob) ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
}

function validLanding(point) {
  return resolveArrivalTarget(point, {
    bounds: world.map.bounds, safe: p => !world.isWater(p.x,p.z,.45),
    resolve: p => { world.resolveMovement(p,.46); practiceActors.resolvePlayerMovement(p,.46); },
    heightAt: world.heightAt,
  });
}
function selectArrivalPoint(point, refresh = true) {
  if (state.phase !== 'deploying' || arrival.snapshot().stage !== 'select') return false;
  arrivalCursor={x:point.x,z:point.z};
  const target = validLanding(new THREE.Vector3(point.x, 0, point.z));
  arrivalCursorValid=Boolean(target);
  if (!target || !arrival.select(target)) { if(refresh) updateUI(); return false; }
  landingTarget = target; if(refresh) updateUI(); return true;
}
function startArrival() {
  if (lobbyMode) { setPhase('playing'); return; }
  landingTarget = validLanding(player);
  // Preserve a safe automatic choice even for authored maps with a blocked spawn.
  if (!landingTarget) {
    const bounds = world.map.bounds;
    for (let z = bounds.minZ + 8; z < bounds.maxZ && !landingTarget; z += 24)
      for (let x = bounds.minX + 8; x < bounds.maxX && !landingTarget; x += 24)
        landingTarget = validLanding(new THREE.Vector3(x, 0, z));
  }
  arrivalCursor=landingTarget?{x:landingTarget.x,z:landingTarget.z}:{x:0,z:0};arrivalCursorValid=Boolean(landingTarget);
  clearInput(); state.direction = 0; arrivalTeleport.reset(); arrival.start(landingTarget);
  setPhase('deploying');
}

function setPhase(phase) {
  if (phase === 'paused' && state.phase !== 'paused') resumePhase = state.phase;
  state.phase = phase;
  if (phase !== 'playing') { levelUpEffect.reset(); healthBars.clearLevelPulses(); cancelAttackAim(); canvasAttackPointer = null; }
  clearInput();
  state.moving = false;
  ui.setPhase(phase);
  character?.setDead(phase === 'dead');
  updateUI();
}

function reset() {
  aimDirection=null;mouseAimPointer=null;
  Object.assign(state, { ...createProgressionState(), health: startingHealth, lastDefeat: null, elapsed: 0, gold: 0, inDanger: false,
    distance: 0, moving: false, actualSpeed: 0, snowWeight: 0, rollCooldown: 0, rollRemaining: 0, direction: Math.PI,
    hiddenInGrass: false, shelter: null });
  player.set(world.spawn.x, world.heightAt(world.spawn.x, world.spawn.z), world.spawn.z);
  world.resetCanopyFade?.();
  cameraFocus.copy(player).multiplyScalar(visualScale);
  pickups.reset(); weapons.reset(); chests.reset(); combat.reset(); practiceActors.reset(); snowFootprints.reset(); world.resetDestructibles?.(); character.setConcealed(false);
  damageFeedback.reset();
  levelUpEffect.reset(); ui.clearLevelUp();
  healthBars.set('player', { health: state.health, maxHealth: state.maxHealth, level: state.level, snap: true });
  healthBars.reset();
  statusIndicators.reset();
  character.resetMotion?.(state.direction);
  playerGrassStrength = 0; playerGrassDirX = Math.sin(state.direction); playerGrassDirZ = Math.cos(state.direction);
  lastConcealment = false; lastShelter = null; currentZone = zoneAt(0);
  arrival.cancel(); startArrival();
  ui.toast(lobbyMode ? 'Die Übungswiese ist zurückgesetzt. Alle Gegenstände sind wieder da.' : 'Ein neuer Streifzug beginnt.');
}

function setQuality(quality) {
  state.quality = quality === 'low' ? 'low' : 'high';
  const profile = graphicsSettings(state.quality, deviceProfile);
  renderer.setPixelRatio(profile.pixelRatio);
  world.setQuality?.(state.quality);
  const size = profile.shadowMapSize;
  sun.shadow.blurSamples = profile.shadowBlurSamples;
  sun.shadow.radius = profile.shadowRadius;
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
  groundCamera.left = -viewHeight * aspect / 2;
  groundCamera.right = viewHeight * aspect / 2;
  groundCamera.top = viewHeight / 2;
  groundCamera.bottom = -viewHeight / 2;
  groundCamera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function roll() {
  if (state.phase !== 'playing' || state.rollCooldown > 0) return;
  cancelAttackAim();
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
  cancelAttackAim();
  if (state.phase !== 'playing') return;
  const nearby = nearbyInteraction();
  const result = nearby.chest ? chests.interact(player) : weapons.interact(player);
  if (result) { ui.toast(result.message, 'success'); updateUI(); }
}

function facingDirection(){return weapons?.firingDirection ?? aimDirection ?? state.direction;}
function faceTarget(){character.group.rotation.y=facingDirection();}
function cancelAttackAim(){aimDrag=null;weapons?.cancelAim();attackControl.classList.remove('aiming');}
function attackWeapon(event) {
  if(state.phase!=='playing'||aimDrag||state.rollRemaining>0||weapons.attackCooldown>0)return;
  if(!weapons.equipped){ui.toast('Heb zuerst eine Waffe auf.');return;}
  const type=weapons.equipped,kind=aimKind(type),touch=event?.pointerType==='touch';
  if(!touch&&event?.target===renderer.domElement)mouseAimPointer={clientX:event.clientX,clientY:event.clientY};
  if(!touch&&mouseAimPointer){const p=groundPointer(mouseAimPointer);if(p)aimDirection=directionTo(player,p,facingDirection());}
  if(kind==='self'){faceTarget();weapons.attack(player,facingDirection());return;}
  aimDrag={type,kind,touch,startX:event?.clientX??0,startY:event?.clientY??0,ratio:1,direction:facingDirection()};
  if(kind==='arc'||kind==='area'){faceTarget();if(!weapons.attack(player,facingDirection())){cancelAttackAim();return;}}
  if(touch){mouseAimPointer=null;attackControl.style.setProperty('--aim-x','0px');attackControl.style.setProperty('--aim-y','0px');attackControl.classList.add('aiming');}
  refreshAttackAim();
}
function groundPointer(event) {
  if (!event || !Number.isFinite(event.clientX)) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
    1 - (event.clientY - rect.top) / rect.height * 2), camera);
  const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -player.y * visualScale), new THREE.Vector3());
  return point ? world.root.worldToLocal(point) : null;
}
function refreshAttackAim(){
  if(aimDrag&&aimDrag.type!==weapons.equipped){cancelAttackAim();return;}
  if(aimDrag?.touch){
    aimDirection=aimDrag.direction;
    if(weapons.aiming){const range=weapons.chargedAimRange*aimDrag.ratio;weapons.aimAt(player,{x:player.x+Math.sin(aimDirection)*range,z:player.z+Math.cos(aimDirection)*range});}
  }else if(mouseAimPointer){
    const p=groundPointer(mouseAimPointer);
    if(p){aimDirection=directionTo(player,p,facingDirection());if(weapons.aiming)weapons.aimAt(player,p);}
  }
}
function moveAttackAim(event){
  if(state.phase!=='playing')return;
  if(aimDrag?.touch&&event?.pointerType==='touch'){
    const v=touchAimVector(event.clientX-aimDrag.startX,event.clientY-aimDrag.startY);
    if(v){aimDrag.direction=Math.atan2(v.x,v.z);aimDrag.ratio=v.ratio;attackControl.style.setProperty('--aim-x',v.x*Math.min(32,v.distance)+'px');attackControl.style.setProperty('--aim-y',v.z*Math.min(32,v.distance)+'px');}
  }
  refreshAttackAim();
}
function releaseWeapon(event){
  if(!aimDrag)return;
  if(event?.pointerType==='touch')moveAttackAim(event);
  if(state.phase==='playing'&&aimDrag.type===weapons.equipped&&state.rollRemaining<=0){
    refreshAttackAim();faceTarget();
    if(weapons.aiming)weapons.releaseAttack(player,facingDirection());
    else weapons.attack(player,facingDirection());
  }
  aimDrag=null;attackControl.classList.remove('aiming');
}

function simulate(dt) {
  if (state.phase === 'deploying') {
    const before = arrival.snapshot().stage;
    if(before==='select' && arrivalCursor) {
      const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      const dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
      if(dx||dz) selectArrivalPoint(moveArrivalCursor(arrivalCursor,dx,dz,dt,world.map.bounds,ui.getArrivalZoom()),false);
    }
    const next = arrival.update(dt);
    if (next.stage === 'teleport' && before !== 'teleport' && landingTarget) {
      player.copy(landingTarget); cameraFocus.set(player.x * visualScale, player.y * visualScale, (player.z - 1.5) * visualScale);
      character.resetMotion?.(state.direction); world.resetCanopyFade?.();
    }
    if (next.landed) setPhase('playing');
    return;
  }
  if (state.phase !== 'playing') return;
  arrival.update(dt);
  state.elapsed += dt;
  combat.update(dt);
  state.rollCooldown = Math.max(0, state.rollCooldown - dt);
  state.rollRemaining = Math.max(0, state.rollRemaining - dt);
  const movementStick = stick;
  moveDirection.set(
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + movementStick.x,
    0,
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + movementStick.y,
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
  refreshAttackAim();
  const travelled = Math.hypot(player.x - lastPosition.x, player.z - lastPosition.z);
  state.actualSpeed = travelled / dt;
  state.moving = travelled > 0.0005;
  state.distance += travelled;
  if (state.moving) state.direction = Math.atan2(player.x - lastPosition.x, player.z - lastPosition.z);
  currentZone = zoneAt(state.elapsed);
  const wasInDanger = state.inDanger;
  state.inDanger = !lobbyMode && Math.hypot(player.x - currentZone.center[0], player.z - currentZone.center[1]) > currentZone.radius;
  if (state.inDanger && !wasInDanger) ui.toast('Der Nebel zehrt an deiner Kraft. Zurück in den Kreis!', 'danger');
  if (!state.inDanger && wasInDanger) ui.toast('Du bist wieder in Sicherheit.', 'success');
  const previousHealth = state.health;
  state.health = lobbyMode ? state.maxHealth : Math.max(0, state.health - (state.inDanger ? world.map.zone.damagePerSecond * dt : 0));
  if (state.health < previousHealth) damageFeedback.addHit({ targetId: 'player', damage: previousHealth - state.health, type: 'zone' },
    { id: 'player', position: player, local: true });
  if (state.health === 0) setPhase('dead');
}

function onCollect(item) {
  if (item.type === 'heart') {
    state.health = healedHealth(state.health, item.amount, state.maxHealth);
    ui.toast(`+${Math.round(item.amount)} Leben · Ein Geschenk des Waldes`, 'success');
  } else {
    state.gold += item.amount;
    ui.toast(`+${item.amount} Gold`, 'success');
  }
}

function updateUI() {
  const nearby = nearbyInteraction();
  ui.update({ ...state, arrival: { ...arrival.snapshot(), valid: Boolean(landingTarget), cursor:arrivalCursor, cursorValid:arrivalCursorValid }, touchAiming: Boolean(aimDrag?.touch), zoneCenter: { x: currentZone.center[0], z: currentZone.center[1] }, zoneRadius: currentZone.radius, zoneCountdown: currentZone.countdown,
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
    if(state.phase==='playing'&&aimDrag){cancelAttackAim();return;}
    if (['playing', 'deploying'].includes(state.phase)) setPhase('paused');
    else if (state.phase === 'paused') setPhase(resumePhase);
    return;
  }
  if (!['playing', 'deploying'].includes(state.phase)) return;
  if (['Space', 'KeyE', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    event.preventDefault(); keys.add(event.code);
  }
  if (event.code === 'Space' && !event.repeat) roll();
  if (event.code === 'KeyE' && !event.repeat) interactWeapon();
  if (event.code === 'KeyF' && !event.repeat) attackWeapon();
});
window.addEventListener('keyup', event => { keys.delete(event.code); if (event.code === 'KeyF') releaseWeapon(); });
window.addEventListener('pointermove', event => {
  if(event.pointerType!=='touch'&&(event.target===renderer.domElement||aimDrag&&!aimDrag.touch)){
    mouseAimPointer={clientX:event.clientX,clientY:event.clientY};refreshAttackAim();
  }
});
renderer.domElement.addEventListener('pointerdown', event => {
  if (state.phase==='deploying') return;
  if (event.button !== 0 || state.phase !== 'playing' || canvasAttackPointer !== null) return;
  event.preventDefault(); canvasAttackPointer = event.pointerId; renderer.domElement.setPointerCapture(event.pointerId);
  if (event.pointerType !== 'touch') mouseAimPointer = { clientX: event.clientX, clientY: event.clientY };
  attackWeapon(event);
});
renderer.domElement.addEventListener('pointermove', event => { if (canvasAttackPointer === event.pointerId) moveAttackAim(event); });
renderer.domElement.addEventListener('pointerup', event => { if (canvasAttackPointer === event.pointerId) { canvasAttackPointer = null; releaseWeapon(event); } });
for (const name of ['pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(name, event => {
  if (canvasAttackPointer === event.pointerId) { canvasAttackPointer = null; cancelAttackAim(); }
});
window.addEventListener('blur', () => {
  clearInput();
  if (['playing', 'deploying'].includes(state.phase)) setPhase('paused');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['playing', 'deploying'].includes(state.phase)) setPhase('paused');
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
  if (!['playing', 'deploying'].includes(state.phase) || inputPointer !== null) return;
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
  if (['playing', 'deploying'].includes(state.phase)) setPhase('paused');
  ui.showError('Die Grafikverbindung wurde unterbrochen. Lade die Seite neu, um die Insel erneut zu betreten.');
});

window.nebeljagdTestState = () => ({
  mode: lobbyMode ? 'lobby' : 'game',
  darkenedStatus:{remaining:localCombatTarget.darkenedRemaining,radius:Number.isFinite(localCombatTarget.darkenedRadius)?localCombatTarget.darkenedRadius:null},
  statusIndicators:statusIndicators.inspect(),
  solarStatus: { blindRemaining: localCombatTarget.blindRemaining, revealRemaining: localCombatTarget.revealRemaining, blindRadius: Number.isFinite(localCombatTarget.blindRadius) ? localCombatTarget.blindRadius : null },
  arrival: { ...arrival.snapshot(), valid: Boolean(landingTarget), cursor:arrivalCursor, cursorValid:arrivalCursorValid }, arrivalTeleport:arrivalTeleport.inspect(), arrivalMap:ui.inspectArrivalMap(), visualPosition: { x: visualPlayer.x, y: visualPlayer.y, z: visualPlayer.z },
  renderer: 'three-webgl2', phase: state.phase, health: state.health, maxHealth: state.maxHealth,
  level: state.level, defeats: state.defeats, lastDefeat: state.lastDefeat ? { ...state.lastDefeat } : null,
  elapsed: state.elapsed, moving: state.moving, distance: state.distance,
  position: { x: player.x, y: player.y, z: player.z }, direction: state.direction,
  targeting:{direction:aimDirection,facing:facingDirection(),gesture:aimDrag?{kind:aimDrag.kind,touch:aimDrag.touch,ratio:aimDrag.ratio}:null,preview:null},
  rollCooldown: state.rollCooldown, dashCooldown: state.rollCooldown,
  rollRemaining: state.rollRemaining, gold: state.gold, quality: state.quality,
  equippedWeapon: weapons.equipped, equippedItem: weapons.equippedItem, attackCooldown: weapons.attackCooldown,
  combat: weapons.telemetry,
  vision: vision.inspect(), healthBars: healthBars.inspect(), practiceActors: practiceActors.inspect(),
  snowFootprints: snowFootprints.inspect(),
  damageFeedback: damageFeedback.inspect(), minimap: ui.inspectMinimap?.(),
  levelUpEffect: levelUpEffect.inspect(),
  chests: chests.items.map(({ id, x, z, opened, group, variant, model, lid, texturedInteriorSurfaces, runic, charge, chargeRadius, elapsed }) => ({ id, x, z, opened, variant, model, texturedInteriorSurfaces, runic, charge:{...charge},chargeRadius,openingElapsed:elapsed,lidRotation: lid.rotation.x, visible: group.visible })),
  world: { mapId: world.map.id, mapName: world.map.name, source: documentSource.source, bounds: world.map.bounds, stats: world.stats, biome: world.biomeAt(player.x, player.z), groundHeight: world.groundHeightAt(player.x, player.z), isWater: world.isWater(player.x, player.z), objects: world.map.objects,
    treeCount: world.trees.length, trees: world.trees, grassPatches: world.grassPatches,
    destructibles: world.destructibles?.map(({ id, name, kind, x, z, health, maxHealth, destroyed }) => ({ id, name, kind, x, z, health, maxHealth, destroyed })) ?? [],
    landscape: world.map.landscape ?? null,
    importedAssets: world.importedAssets,
    projectileObstacles: new URLSearchParams(location.search).has('inspect') ? world.projectileObstacles : undefined },
  nearWeapon: weapons.nearest(player)?.type ?? null,
  nearChest: chests.nearest(player)?.id ?? null,
  weaponDrops: weapons.items.map(({ id, type, variant, model, rarity, x, z, collected, group, aura }) => ({ id, type, variant, model, rarity, x, z, collected, visible: group.visible,
    aura: aura?.inspect() ?? null })),
  hiddenInGrass: Boolean(state.hiddenInGrass), hiddenFromOtherPlayers: Boolean(state.hiddenInGrass),
  character: { ...character.group.userData.characterAsset, opacity: character.group.userData.concealmentOpacity,
    arrivalTilt: character.group.userData.arrivalTilt || 0, arrivalStep:character.group.userData.arrivalStep, visible: character.group.visible,
    levelUpGlowMaterials: character.inspectLevelUpGlow(),
    locomotion: character.group.userData.locomotion, snowWeight: character.group.userData.snowWeight ?? 0,
    snowSinkMeters: character.group.userData.snowSinkMeters ?? 0,
    snowClipStrength: character.group.userData.snowClipStrength ?? 0,
    snowClipHeight: character.group.userData.snowClipHeight ?? null },
  concealment: world.concealmentAt(player.x, player.z), shelter: state.shelter ?? null,
  houses: world.houses.map(({ id, name, x, y, z, halfWidth, halfDepth, rotation, scale, floorHeight, roof, interior, frontFacade }) => ({ id, name, x, y, z, halfWidth, halfDepth, rotation, scale, floorHeight,
    roofVisible: roof.visible, interiorVisible: interior.visible, frontFacadeVisible: frontFacade.visible, frontFacadeParts: frontFacade.children.length })),
  zone: { ...currentZone, inDanger: state.inDanger },
  pickups: pickups.items.map(({ id, type, x, z, amount, collected, group, visual, flight }) => ({ id, type, x, z, amount, collected, visible: group.visible,
    flight, coin: visual.userData.coin ? { ...visual.userData.coin, rotation: visual.rotation.y,
      diameter: visual.userData.coin.radius * 2 * group.scale.x * visual.parent.scale.x } : null })),
  camera: { perspective:camera.isPerspectiveCamera===true, near:camera.near, position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, focus: { x: cameraFocus.x, y: cameraFocus.y, z: cameraFocus.z }, orthographicHeight: camera.top - camera.bottom, zoom: camera.zoom },
  rendering: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    frameMs: frameSamples.length ? frameSamples.reduce((sum, ms) => sum + ms, 0) / frameSamples.length : null },
  shadows: { type: renderer.shadowMap.type === THREE.VSMShadowMap ? 'VSM' : renderer.shadowMap.type,
    mapSize: sun.shadow.mapSize.x, bias: sun.shadow.bias, normalBias: sun.shadow.normalBias,
    radius: sun.shadow.radius, blurSamples: sun.shadow.blurSamples },
  graphicsProfile: { iPad, coarsePointer, quality: state.quality, pixelRatio: renderer.getPixelRatio(),
    settings: graphicsSettings(state.quality, deviceProfile) },
});

// Explicit capture mode for reproducible local QA, absent from normal player sessions.
if (new URLSearchParams(location.search).has('inspect')) {
  window.nebeljagdProjectPoint = ({x, z}) => {
    const point = world.root.localToWorld(new THREE.Vector3(x, world.heightAt(x, z), z)).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2};
  };
  window.nebeljagdInspectCamera = ({ zoom = 1, focus = null } = {}) => {
    camera.zoom = THREE.MathUtils.clamp(Number.isFinite(zoom) ? zoom : 1, 1, 4);
    const target = focus && Number.isFinite(focus.x) && Number.isFinite(focus.z)
      ? world.root.localToWorld(new THREE.Vector3(focus.x, world.heightAt(focus.x, focus.z), focus.z)) : cameraFocus;
    camera.position.copy(target).add(cameraOffset); camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  window.nebeljagdCaptureFrame = () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); };
  window.nebeljagdInspectGuardHit = (delivery='projectile') => combat.hit(localCombatTarget,{sourceId:'inspect-enemy',type:'fireStaff',damage:12,delivery,normal:{x:0,y:0,z:1}});
  window.nebeljagdInspectTerrain = ({from,to,position,radius=.42}={}) => {
    const resolved=position?{...position}:null;if(resolved)world.resolveMovement(resolved,radius);
    const hit=from&&to?world.traceProjectile(from,to,.06):null;
    return{resolved,decorationHeight:position?world.terrainDecorationHeightAt?.(position.x,position.z):null,hit:hit?{type:hit.type,t:hit.t,point:hit.point}:null,stats:world.stats.terrainObstacles};
  };
  window.nebeljagdInspectStoneBarrier = ({damage=0}={}) => {
    const body=world.temporaryObstacles?.list()[0];if(!body)return null;
    const target=combat.targets.get(body.objectId),center=target.position;
    const from={x:center.x,y:center.y+1,z:center.z-3},to={x:center.x,y:center.y+1,z:center.z+3};
    const collision=world.traceProjectile(from,to,.05),probe=center.clone();world.resolveMovement(probe,.42);
    const result=damage>0?combat.hit(target,{sourceId:'inspect-enemy',type:'bow',damage,delivery:'projectile'}):null;
    return {hit:collision?.type??null,movementShift:Math.hypot(probe.x-center.x,probe.z-center.z),result};
  };
  window.nebeljagdInspectClockworkHit = (damage=25) => {const t=[...combat.targets.values()].find(t=>t.summoned&&t.ownerId==='player');return t?combat.hit(t,{sourceId:'inspect-enemy',type:'bow',delivery:'projectile',damage}):null;};
  window.nebeljagdInspectStatuses = ({id='player',duration=2,clear=false}={}) => {
    const target=combat.targets.get(id);if(!target)return false;
    if(clear){combat.reset();statusIndicators.reset();return true;}
    const sourceId='inspect-status-source';
    combat.hit(target,{sourceId,damage:0,burn:{duration,damagePerSecond:.01},poison:{duration,damagePerSecond:.01},
      slow:{duration,multiplier:.5},stun:duration,blind:{duration,radius:3},darken:{duration,radius:2.5},reveal:duration});
    combat.setTimeSlow(target,sourceId,.5,duration);combat.activateShield(id);return true;
  };
  window.nebeljagdInspectShadowHit = () => combat.hit(localCombatTarget,{sourceId:'inspect-enemy',type:'shadowStaff',damage:8,darken:{duration:2,radius:2.5}});
  window.nebeljagdInspectSolarHit = () => combat.hit(localCombatTarget, { sourceId: 'inspect-enemy', type: 'sunStaff', damage: 3, blind: { duration: 2, radius: 3 }, reveal: 2.5 });
  window.nebeljagdInspectVisibility = point => vision.isVisible(point, { concealed: false });
  window.nebeljagdInspect = ({ x = player.x, z = player.z, elapsed = state.elapsed, health = state.health,
    direction = state.direction } = {}) => {
    arrival.cancel(); camera=groundCamera; camera.zoom=1; resize();
    clearInput();aimDirection=null;mouseAimPointer=null;
    player.set(x, world.heightAt(x, z), z);
    world.resolveMovement(player, .42);
    practiceActors.resolvePlayerMovement(player, .42);
    world.resolveMovement(player, .42);
    player.y = world.heightAt(player.x, player.z);
    state.elapsed = Math.max(0, elapsed); state.health = THREE.MathUtils.clamp(health, 1, state.maxHealth);
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
if (lobbyMode) {
  let stopWatching = null;
  const startWatching = () => {
    stopWatching?.();
    stopWatching = watchLobbySession({ onInvalid: () => {
      ready = false; setPhase('paused');
      ui.showError('Dein Zugang zur Übungswiese ist beendet. Du kehrst zur Startseite zurück.');
    } });
  };
  startWatching();
  window.addEventListener('pagehide', () => { stopWatching?.(); stopWatching = null; });
  window.addEventListener('pageshow', event => { if (event.persisted) startWatching(); });
}
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
  const arrivalState = arrival.snapshot();
  // The crisp map covers the world. Skip expensive 3D updates/rendering while choosing.
  if (['select','reveal'].includes(arrivalState.stage)) {
    character.group.visible = false;
    if(state.phase==='deploying' && arrivalState.stage==='select') ui.updateArrivalSelection({...arrivalState,cursor:arrivalCursor,cursorValid:arrivalCursorValid,valid:Boolean(landingTarget)});
    uiTimer += dt; if (uiTimer > .08) { updateUI(); uiTimer = 0; }
    requestAnimationFrame(frame); return;
  }
  world.update(dt, time, player, currentZone.radius, state.phase === 'playing' ? dt : 0);
  vision.setSightLimit(effectiveSightRadius(localCombatTarget),{smoke:localCombatTarget.darkenedRemaining>0});
  vision.update(player, time);
  state.shelter = arrivalState.active ? null : world.shelter;
  state.hiddenInGrass = !arrivalState.active && localCombatTarget.revealRemaining <= 0 && world.concealmentAt(player.x, player.z) > 0.01;
  if (state.shelter !== lastShelter) {
    if (state.shelter) ui.toast(`Du betrittst ${state.shelter}. Wände bieten Deckung vor fremden Blicken.`, 'success');
    else if (lastShelter) ui.toast('Du verlässt das Haus.');
    lastShelter = state.shelter;
  }
  if (state.hiddenInGrass !== lastConcealment) {
    ui.toast(state.hiddenInGrass ? (lobbyMode ? 'Im hohen Gras verborgen.' : 'Im hohen Gras verborgen. Andere Spieler können dich nicht sehen.') : 'Du verlässt das dichte Gras.');
    lastConcealment = state.hiddenInGrass;
  }
  character.group.visible = portalArrivalPose(arrivalState).visible;
  character.setConcealed(state.hiddenInGrass && !arrivalState.active);
  arrivalTeleport.update(player, arrivalState);
  state.snowWeight = snowFootprints.weightAt(player.x, player.z);
  character.update(state.phase === 'paused' ? 0 : dt, time, { moving: state.moving, speed: state.actualSpeed || 0,
    direction: arrivalState.stage==='dive'?0:arrivalState.active?state.direction:state.rollRemaining>0?state.direction:facingDirection(), travelDirection:state.direction, health: state.health, inDanger: state.inDanger, snowWeight: arrivalState.active ? 0 : state.snowWeight, arrival: arrivalState,
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
  weapons.appendGrassInteractors(grassInteractors);
  world.setGrassInteractors?.(grassInteractors);
  footprintSources.length = 0;
  footprintSources.push({
    id: 'player', x: player.x, z: player.z, direction: state.direction,
    moving: state.phase === 'playing' && state.moving, speed: state.actualSpeed || 0,
    rolling: state.rollRemaining > 0, stepDistance: .58, lateral: .105,
  });
  practiceActors.appendFootprintSources?.(footprintSources);
  snowFootprints.update(state.elapsed, footprintSources);
  chests.update(playDelta, time, player,{canCharge:state.phase==='playing'&&state.health>0});
  weapons.update(playDelta, time, player, facingDirection());
  if(playDelta>0)refreshAttackAim();
  if (state.phase === 'playing') {
    const automaticPickup = weapons.tryAutoPickup(player);
    if (automaticPickup) { ui.toast(automaticPickup.message, 'success'); updateUI(); }
  }
  pickups.update(playDelta, time, state.phase === 'playing' ? player : inactivePlayer,
    { health: state.health, maxHealth: state.maxHealth, onCollect, viewerPosition: player });
  zone?.update(time, currentZone.radius, state.inDanger, player);
  cameraTarget.set(player.x * visualScale, (player.y + arrivalState.height) * visualScale, (player.z - 1.5) * visualScale);
  cameraFocus.lerp(cameraTarget,1-Math.exp(-dt*4));camera.position.copy(cameraFocus).add(cameraOffset);
  camera.lookAt(cameraFocus);
  world.updateViewOcclusion?.(player,camera,dt,!arrivalState.active&&['playing','paused'].includes(state.phase));
  sun.target.position.set(player.x*visualScale,player.y*visualScale,player.z*visualScale);
  sun.position.copy(sun.target.position).add(sunlightOffset);
  sun.target.updateMatrixWorld();
  // Weapon teleports can move the avatar during this frame. Follow the final position.
  visualPlayer.copy(player); visualPlayer.y += arrivalState.height;
  healthBars.set('player', { health: state.health, maxHealth: state.maxHealth, level: state.level, local: !arrivalState.active, visible: !arrivalState.active });
  healthBars.update(camera, { isVisible, dt: playDelta });
  statusIndicators.update(camera,{width:window.innerWidth,height:window.innerHeight,phase:state.phase});
  damageFeedback.update(playDelta, camera);
  levelUpEffect.update(playDelta, player);
  renderer.render(scene, camera);
  uiTimer += dt;
  if (uiTimer > 0.08) { updateUI(); uiTimer = 0; }
  requestAnimationFrame(frame);
}
updateUI();
requestAnimationFrame(frame);
