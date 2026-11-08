import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import playerModelUrl from '../assets/characters/nebeljagd_player_base_v1.glb?url&inline';
import { createLocomotionController } from './locomotion.js';
import { createAvatarAnimator } from './avatar-animation.js';
import { preparePlayerGeometry } from './player-model.js';
import { createHandGripSocket } from './hand-grip.js';
import { createCombatPoseController } from './character-combat-pose.js';
import { createCharacterGlow } from './character-glow.js';
import { applyCharacterSnowClip, createCharacterConcealment } from './character-concealment.js';

const PLAYER_MODEL_SOURCE = 'assets/characters/nebeljagd_player_base_v1.glb';

/** User-supplied animated avatar; Vite embeds its original meshes and textures. */
export async function createCharacter(scene) {
  const gltf = await new GLTFLoader().loadAsync(playerModelUrl);
  const group = new THREE.Group();
  group.name = 'Nebeljäger · Tripo';
  const presentationPivot = new THREE.Group();
  const pelvisHeight = .94;
  group.add(presentationPivot);
  // Keep normalization outside the imported hierarchy: animation tracks may
  // animate the scene/armature, but must never overwrite its metre scale.
  const model = new THREE.Group();
  model.name = 'Magebrawl · normalisierter Spieleravatar';
  const assetRoot = gltf.scene;
  const geometryPreparation = preparePlayerGeometry(assetRoot);
  model.add(assetRoot);
  presentationPivot.add(model);
  const animator = createAvatarAnimator(assetRoot, gltf.animations);
  animator.update(0);

  // Measure the actual animated skin at idle, not its cached bind-pose box.
  // The supplied file is about one metre tall; no source bytes are rewritten.
  model.updateWorldMatrix(true, true);
  model.traverse(node => node.skeleton?.update());
  const sourceBounds = new THREE.Box3().setFromObject(model, true);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  if (!(sourceSize.y > 0.01) || !Number.isFinite(sourceSize.y)) {
    throw new Error('Die Tripo-GLB besitzt keine gültigen Modellabmessungen.');
  }
  const targetHeight = 1.82;
  const normalizedScale = targetHeight / sourceSize.y;
  model.scale.setScalar(normalizedScale);
  model.updateWorldMatrix(true, true);
  model.traverse(node => node.skeleton?.update());
  const groundedBounds = new THREE.Box3().setFromObject(model, true);
  model.position.y -= groundedBounds.min.y;
  presentationPivot.position.y = pelvisHeight;
  model.position.y -= pelvisHeight;
  model.updateWorldMatrix(true, true);
  const unitScale = model.scale.clone();
  const materials = new Map();
  const meshes = [];
  const snowClipHeight = { value: -10000 };
  const snowClipStrength = { value: 0 };
  model.traverse(part => {
    if (!part.isMesh) return;
    meshes.push(part);
    part.castShadow = part.receiveShadow = true;
    part.frustumCulled = false;
    const clone = mat => {
      const own = mat.clone();
      own.forceSinglePass = true;
      applyCharacterSnowClip(own, snowClipHeight, snowClipStrength);
      materials.set(own, { transparent: own.transparent, opacity: own.opacity, depthWrite: own.depthWrite });
      return own;
    };
    part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
  });
  const levelGlow = createCharacterGlow(materials.keys());
  function setLevelUpGlow(strength = 0) {
    levelGlow.set(strength);
    if (group.userData.characterAsset) group.userData.characterAsset.levelUpGlow = levelGlow.strength;
  }
  const concealmentAppearance = createCharacterConcealment({ meshes, materials, snowClipHeight, snowClipStrength });
  scene.add(group);

  let dead = false, concealed = false, opacity = 1, snowSink = 0;
  const locomotion = createLocomotionController();
  let attackRemaining = 0, rollYaw = group.rotation.y;
  const findBone = names => {
    const normalize = name => String(name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const bonesByName = new Map();
    model.traverse(node => {
      if (!node.isBone) return;
      bonesByName.set(normalize(node.name), node);
      if (node.userData?.name) bonesByName.set(normalize(node.userData.name), node);
    });
    // Exact aliases prevent LeftHandIndex1 being mistaken for LeftHand when
    // glTF lists finger nodes before the wrist, as this export does.
    for (const name of names) {
      const bone = bonesByName.get(normalize(name));
      if (bone) return bone;
    }
    return null;
  };
  const neck = findBone(['mixamorigNeck', 'Neck']);
  const chest = findBone(['mixamorigSpine2', 'Chest', 'Spine2']);
  const armBones = {
    left: [
      findBone(['UpperArmL', 'LeftUpperArm', 'mixamorigLeftArm', 'LeftArm']),
      findBone(['ForearmL', 'LeftForeArm', 'LeftLowerArm', 'mixamorigLeftForeArm']),
      findBone(['HandL', 'LeftHand', 'mixamorigLeftHand']),
    ],
    right: [
      findBone(['UpperArmR', 'RightUpperArm', 'mixamorigRightArm', 'RightArm']),
      findBone(['ForearmR', 'RightForeArm', 'RightLowerArm', 'mixamorigRightForeArm']),
      findBone(['HandR', 'RightHand', 'mixamorigRightHand']),
    ],
  };
  const gripSockets = Object.fromEntries(['left', 'right'].map(side => {
    const label = side === 'left' ? 'Left' : 'Right';
    const finger = findBone([`mixamorig${label}HandMiddle1`, `${label}HandMiddle1`,
      `mixamorig${label}HandIndex1`, `${label}HandIndex1`]);
    return [side, createHandGripSocket(armBones[side][2], finger)];
  }));
  const legBones = Object.fromEntries(['left', 'right'].map(side => {
    const label = side === 'left' ? 'Left' : 'Right', suffix = side === 'left' ? 'L' : 'R';
    return [side, [findBone([`mixamorig${label}UpLeg`, `${label}UpLeg`, `Thigh${suffix}`]),
      findBone([`mixamorig${label}Leg`, `${label}Leg`, `Shin${suffix}`]),
      findBone([`mixamorig${label}Foot`, `${label}Foot`, `Foot${suffix}`])]];
  }));
  const combatPose = createCombatPoseController(group, { chest, hips: findBone(['mixamorigHips', 'Hips']), arms: armBones, legs: legBones, gripSockets });
  const restoreAnimatedPose = () => combatPose.restore();
  function setCombatState(next) {
    restoreAnimatedPose();
    group.userData.weaponPose = next ? { weapon: next.weapon, phase: next.phase } : null;
    if (!next || dead || animator.rolling) return;
    combatPose.apply(next, { walkWeight: group.userData.locomotion?.walkWeight ?? 0 });
  }
  group.userData.hiddenFromOtherPlayers = false;
  group.userData.concealmentOpacity = 1;
  const bones = new Set();
  model.traverse(node => { if (node.isBone) bones.add(node); });
  group.userData.characterAsset = {
    levelUpGlow: 0,
    concealmentAppearance: concealmentAppearance.inspect(),
    name: 'Nebeljäger Tripo', source: PLAYER_MODEL_SOURCE,
    format: 'GLB', skinned: meshes.some(mesh => mesh.isSkinnedMesh), joints: bones.size,
    clips: gltf.animations.map(clip => clip.name), normalizedHeight: targetHeight,
    sourceHeight: sourceSize.y, normalizedScale,
    geometryPreparation,
    handBones: Object.fromEntries(Object.entries(armBones).map(([side, chain]) => [side, chain.map(bone => bone?.name || null)])),
    gripSockets: Object.fromEntries(Object.entries(gripSockets).map(([side, socket]) => [side, { source: socket.source }])),
    materials: [...materials.keys()].map(material => ({ name: material.name,
      baseColorTexture: Boolean(material.map), normalTexture: Boolean(material.normalMap),
      roughnessTexture: Boolean(material.roughnessMap), metalnessTexture: Boolean(material.metalnessMap) })),
    meshes: meshes.length, triangles: meshes.reduce((count, mesh) => count +
      (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0),
    ...animator.snapshot(),
  };

  function update(dt, time, { moving = false, speed = 5.6, direction = 0, inDanger = false, snowWeight = 0, snowSurfaceY = null } = {}) {
    restoreAnimatedPose();
    const delta = Math.max(0, Math.min(dt, 0.1));
    const smoothing = 1 - Math.exp(-delta * 12);
    const targetSnowSink = THREE.MathUtils.clamp(snowWeight, 0, 1) * .22;
    const snowResponse = 1 - Math.exp(-delta * (targetSnowSink > snowSink ? 10 : 7));
    snowSink = THREE.MathUtils.lerp(snowSink, targetSnowSink, snowResponse);
    if (Math.abs(snowSink - targetSnowSink) < .001) snowSink = targetSnowSink;
    const snowClip = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(snowWeight, 0, 1), .45, .78);
    snowClipStrength.value = snowClip;
    snowClipHeight.value = snowClip > .01 && Number.isFinite(snowSurfaceY)
      ? snowSurfaceY - THREE.MathUtils.lerp(.025, .005, snowClip)
      : -10000;
    const movement = locomotion.update(delta, { moving, speed, direction: animator.rolling ? rollYaw : direction,
      currentYaw: group.rotation.y, rolling: animator.rolling, dead });
    const animation = animator.update(delta, { ...movement, frozen: dead });
    group.rotation.y = movement.yaw;
    if (animator.rolling && !dead) {
      // All anticipation, compression and rotation belong to Roll_Nebeljagd.
      // The parent only keeps the existing snow contact offset.
      presentationPivot.rotation.set(0, 0, 0);
      presentationPivot.position.y = pelvisHeight - snowSink * .65;
    } else {
      presentationPivot.rotation.x = dead ? THREE.MathUtils.lerp(presentationPivot.rotation.x, -Math.PI * 0.43, smoothing) : movement.forwardLean;
      presentationPivot.rotation.z = movement.sideLean;
      presentationPivot.position.y = dead ? THREE.MathUtils.lerp(presentationPivot.position.y, 0.35 - snowSink * .35, smoothing) : pelvisHeight - snowSink;
    }
    group.userData.locomotion = { ...movement };
    group.userData.rolling = animator.rolling;
    Object.assign(group.userData.characterAsset, animation, {
      presentationRotation: presentationPivot.rotation.toArray().slice(0, 3),
      modelScale: model.scale.toArray(),
    });
    group.userData.snowWeight = THREE.MathUtils.clamp(snowWeight, 0, 1);
    group.userData.snowSinkMeters = snowSink;
    group.userData.snowClipStrength = snowClip;
    group.userData.snowClipHeight = snowClipHeight.value;
    if (attackRemaining > 0 && !animator.rolling) {
      attackRemaining = Math.max(0, attackRemaining - delta);
      if (chest) chest.rotation.z += Math.sin((1 - attackRemaining / .34) * Math.PI) * .08;
    }
    if (neck && !moving && !dead && !animator.rolling) neck.rotation.z += Math.sin(time * .75) * .008;

    // The white read-through belongs only to this local avatar. The gameplay
    // concealment flag and opponents' visibility stay independent of its fade.
    const appearance = concealmentAppearance.update(delta, { concealed: concealed && !dead, inDanger, snowClipped: snowClip > .08 });
    opacity = appearance.bodyOpacity;
    group.userData.localSilhouetteOpacity = appearance.baselineOpacity + appearance.fillOpacity;
    group.userData.concealmentOpacity = opacity;
  }

  return {
    group, update, setLevelUpGlow, inspectLevelUpGlow: levelGlow.inspect,
    resetMotion(direction = group.rotation.y) {
      setLevelUpGlow(0);
      concealed = false; opacity = 1; concealmentAppearance.reset();
      group.userData.hiddenFromOtherPlayers = false;
      group.userData.concealmentOpacity = 1; group.userData.localSilhouetteOpacity = .045;
      restoreAnimatedPose(); animator.reset();
      locomotion.reset(); attackRemaining = 0; snowSink = 0; snowClipStrength.value = 0; snowClipHeight.value = -10000;
      if (Number.isFinite(direction)) group.rotation.y = direction;
      presentationPivot.rotation.set(0, 0, 0); presentationPivot.position.y = pelvisHeight;
      model.scale.copy(unitScale);
      group.userData.rolling = false;
      Object.assign(group.userData.characterAsset, animator.snapshot());
      group.userData.snowWeight = 0; group.userData.snowSinkMeters = 0; group.userData.snowClipStrength = 0;
      group.userData.locomotion = locomotion.update(0, { direction: group.rotation.y, currentYaw: group.rotation.y });
    },
    setCombatState,
    inspectCombatPose: () => combatPose.inspect(),
    getGripPosition(side, target = new THREE.Vector3()) {
      return (gripSockets[side] ?? gripSockets.right).getPosition(group, target);
    },
    getHandPosition(side, target = new THREE.Vector3()) {
      const hand = armBones[side]?.[2];
      group.updateWorldMatrix(true, true);
      if (!hand) return target.set(0, 1.2, .4);
      hand.getWorldPosition(target);
      return group.worldToLocal(target);
    },
    get opacity() { return opacity; },
    roll(direction = group.rotation.y) {
      if (dead || !animator.startRoll()) return;
      restoreAnimatedPose(); attackRemaining = 0;
      rollYaw = Number.isFinite(direction) ? direction : group.rotation.y;
      group.rotation.y = rollYaw;
      presentationPivot.rotation.set(0, 0, 0);
      group.userData.rolling = true;
      Object.assign(group.userData.characterAsset, animator.snapshot());
    },
    attack() { if (!dead) attackRemaining = 0.34; },
    setDead(value) {
      const next = Boolean(value);
      if (dead === next) return;
      dead = next; restoreAnimatedPose(); animator.stopRoll(); group.userData.rolling = false;
      if (dead) setLevelUpGlow(0);
      if (!dead) { presentationPivot.rotation.x = 0; presentationPivot.position.y = pelvisHeight; model.scale.copy(unitScale); locomotion.reset(); }
    },
    setConcealed(value) {
      concealed = Boolean(value);
      group.userData.hiddenFromOtherPlayers = concealed;
    },
  };
}
