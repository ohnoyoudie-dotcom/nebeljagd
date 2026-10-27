import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import rangerUrl from '../assets/characters/ranger.glb?url&inline';
import { createLocomotionController } from './locomotion.js';

/** Original Blender-authored skinned traveller; Vite embeds the asset. */
export async function createCharacter(scene) {
  const gltf = await new GLTFLoader().loadAsync(rangerUrl);
  const group = new THREE.Group();
  group.name = 'Waldläufer';
  const rollPivot = new THREE.Group();
  rollPivot.position.y = 1.025;
  group.add(rollPivot);
  const model = gltf.scene;
  model.position.y = -1.025;
  model.name = 'Blender ranger · 18-joint skeleton';
  rollPivot.add(model);
  const materials = new Set();
  const meshes = [];
  model.traverse(part => {
    if (!part.isMesh) return;
    meshes.push(part);
    part.castShadow = part.receiveShadow = true;
    part.frustumCulled = false;
    const clone = mat => {
      const own = mat.clone();
      own.forceSinglePass = true;
      materials.add(own);
      return own;
    };
    part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
  });
  // A faint local-only read-through keeps the traveller legible under a canopy or
  // in poison mist. These three draws reuse the original skin and bone matrices.
  const silhouetteMaterial = new THREE.MeshBasicMaterial({
    color: '#b0cbbb', transparent: true, opacity: 0.045,
    depthTest: false, depthWrite: false, toneMapped: false,
    side: THREE.FrontSide,
  });
  for (const original of meshes) {
    if (!original.isSkinnedMesh) continue;
    const silhouette = new THREE.SkinnedMesh(original.geometry, silhouetteMaterial);
    silhouette.name = `${original.name} · local silhouette`;
    silhouette.position.copy(original.position);
    silhouette.quaternion.copy(original.quaternion);
    silhouette.scale.copy(original.scale);
    silhouette.bindMode = original.bindMode;
    silhouette.bind(original.skeleton, original.bindMatrix);
    silhouette.bindMatrixInverse.copy(original.bindMatrixInverse);
    silhouette.frustumCulled = false;
    silhouette.castShadow = silhouette.receiveShadow = false;
    silhouette.renderOrder = 6;
    silhouette.userData.localSilhouette = true;
    original.parent.add(silhouette);
  }
  scene.add(group);

  const mixer = new THREE.AnimationMixer(model);
  const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'Idle');
  const walkClip = THREE.AnimationClip.findByName(gltf.animations, 'Walk');
  if (!idleClip || !walkClip) throw new Error('Ranger asset must contain Idle and Walk clips.');
  const idle = mixer.clipAction(idleClip).play();
  const walk = mixer.clipAction(walkClip).play();
  walk.setEffectiveWeight(0);
  let dead = false, concealed = false, opacity = 1;
  const locomotion = createLocomotionController();
  let rollRemaining = 0, attackRemaining = 0;
  const rollDuration = 0.52;
  const neck = model.getObjectByName('Neck');
  const chest = model.getObjectByName('Chest');
  const armBones = {
    // GLTFLoader sanitises dots in node names; userData.name retains Blender's label.
    left: ['UpperArmL', 'ForearmL', 'HandL'].map(name => model.getObjectByName(name)),
    right: ['UpperArmR', 'ForearmR', 'HandR'].map(name => model.getObjectByName(name)),
  };
  // Two-bone aiming keeps the held objects in the actual hands instead of
  // floating beside the running rig. Targets use the character's local space.
  const shoulder = new THREE.Vector3(), handTarget = new THREE.Vector3();
  const reach = new THREE.Vector3(), bend = new THREE.Vector3(), elbow = new THREE.Vector3();
  const from = new THREE.Vector3(), end = new THREE.Vector3(), worldTarget = new THREE.Vector3();
  const oldDirection = new THREE.Vector3(), newDirection = new THREE.Vector3();
  const worldRotation = new THREE.Quaternion(), parentInverse = new THREE.Quaternion();
  const correction = new THREE.Quaternion();
  const animatedPose = new Map([chest, ...armBones.left.slice(0, 2), ...armBones.right.slice(0, 2)]
    .filter(Boolean).map(bone => [bone, bone.quaternion.clone()]));
  let poseApplied = false;
  function restoreAnimatedPose() {
    if (!poseApplied) return;
    for (const [bone, rotation] of animatedPose) bone.quaternion.copy(rotation);
    poseApplied = false;
  }
  function aimBone(bone, child, localTarget) {
    group.updateWorldMatrix(true, true);
    bone.getWorldPosition(from); child.getWorldPosition(end);
    group.localToWorld(worldTarget.copy(localTarget));
    oldDirection.subVectors(end, from).normalize();
    newDirection.subVectors(worldTarget, from).normalize();
    correction.setFromUnitVectors(oldDirection, newDirection);
    bone.getWorldQuaternion(worldRotation);
    bone.parent.getWorldQuaternion(parentInverse).invert();
    bone.quaternion.copy(parentInverse.multiply(correction).multiply(worldRotation));
  }
  function poseArm(side, target) {
    const [upper, forearm, hand] = armBones[side];
    if (!upper || !forearm || !hand || !target) return;
    group.updateWorldMatrix(true, true);
    upper.getWorldPosition(shoulder); group.worldToLocal(shoulder);
    handTarget.set(target.x, target.y, target.z);
    reach.subVectors(handTarget, shoulder);
    const firstLength = forearm.position.length(), secondLength = hand.position.length();
    const distance = THREE.MathUtils.clamp(reach.length(), .04, firstLength + secondLength - .004);
    reach.normalize(); handTarget.copy(shoulder).addScaledVector(reach, distance);
    // Elbows point outward and down, away from the bow string and sword blade.
    bend.set(side === 'left' ? .7 : -.7, -.55, -.12);
    bend.addScaledVector(reach, -bend.dot(reach)).normalize();
    const along = (firstLength * firstLength - secondLength * secondLength + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, firstLength * firstLength - along * along));
    elbow.copy(shoulder).addScaledVector(reach, along).addScaledVector(bend, height);
    aimBone(upper, forearm, elbow);
    aimBone(forearm, hand, handTarget);
    group.updateWorldMatrix(true, true);
  }
  function setCombatState(next) {
    restoreAnimatedPose();
    group.userData.weaponPose = next ? { weapon: next.weapon, phase: next.phase } : null;
    if (!next || dead || rollRemaining > 0) return;
    for (const [bone, rotation] of animatedPose) rotation.copy(bone.quaternion);
    if (chest) chest.rotation.y += next.chestTwist || 0;
    poseArm('left', next.leftHand);
    poseArm('right', next.rightHand);
    poseApplied = true;
  }
  group.userData.hiddenFromOtherPlayers = false;
  group.userData.concealmentOpacity = 1;
  group.userData.characterAsset = {
    format: 'GLB', skinned: true, joints: 18, clips: gltf.animations.map(clip => clip.name),
  };

  function update(dt, time, { moving = false, speed = 5.6, direction = 0, inDanger = false } = {}) {
    restoreAnimatedPose();
    const delta = Math.max(0, Math.min(dt, 0.1));
    const smoothing = 1 - Math.exp(-delta * 12);
    const movement = locomotion.update(delta, { moving, speed, direction,
      currentYaw: group.rotation.y, rolling: rollRemaining > 0, dead });
    idle.setEffectiveWeight(1 - movement.walkWeight);
    walk.setEffectiveWeight(movement.walkWeight);
    // Walk is a 2/3 s gait authored at the game's 5.6 units/s reference speed.
    walk.setEffectiveTimeScale(movement.playbackSpeed);
    mixer.update(dead ? 0 : delta);
    group.rotation.y = movement.yaw;
    if (rollRemaining > 0 && !dead) {
      rollRemaining = Math.max(0, rollRemaining - delta);
      const progress = 1 - rollRemaining / rollDuration;
      // A low lateral tumble reads as a dodge roll; avoid pitching through a front flip.
      rollPivot.rotation.x = movement.forwardLean * (1 - Math.sin(progress * Math.PI));
      rollPivot.rotation.z = progress * Math.PI * 2;
      rollPivot.position.y = 0.48 + Math.sin(progress * Math.PI) * 0.12;
    } else {
      rollPivot.rotation.x = dead ? THREE.MathUtils.lerp(rollPivot.rotation.x, -Math.PI * 0.43, smoothing) : movement.forwardLean;
      rollPivot.rotation.z = movement.sideLean;
      rollPivot.position.y = dead ? THREE.MathUtils.lerp(rollPivot.position.y, 0.35, smoothing) : 1.025;
    }
    group.userData.locomotion = { ...movement };
    group.userData.rolling = rollRemaining > 0;
    if (attackRemaining > 0) {
      attackRemaining = Math.max(0, attackRemaining - delta);
      if (chest) chest.rotation.z += Math.sin((1 - attackRemaining / .34) * Math.PI) * .08;
    }
    if (neck && !moving && !dead) neck.rotation.z += Math.sin(time * .75) * .008;

    // Gameplay visibility remains independent from the local transparent silhouette.
    // Opaque grass naturally occludes portions of the body through depth testing.
    const target = concealed ? 0.45 : 1;
    opacity = THREE.MathUtils.lerp(opacity, target, 1 - Math.exp(-delta * 8));
    if (Math.abs(opacity - target) < 0.002) opacity = target;
    const translucent = opacity < 0.995;
    for (const material of materials) {
      if (material.transparent !== translucent) {
        material.transparent = translucent;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
      material.depthWrite = !translucent;
    }
    for (const mesh of meshes) mesh.castShadow = !concealed;
    const silhouetteTarget = concealed ? 0.06 : inDanger ? 0.14 : 0.045;
    silhouetteMaterial.opacity = THREE.MathUtils.lerp(silhouetteMaterial.opacity,
      silhouetteTarget, 1 - Math.exp(-delta * 6));
    group.userData.localSilhouetteOpacity = silhouetteMaterial.opacity;
    group.userData.concealmentOpacity = opacity;
  }

  return {
    group, update,
    resetMotion(direction = group.rotation.y) {
      locomotion.reset(); rollRemaining = 0; attackRemaining = 0;
      if (Number.isFinite(direction)) group.rotation.y = direction;
      rollPivot.rotation.set(0, 0, 0); rollPivot.position.y = 1.025;
      group.userData.rolling = false;
      group.userData.locomotion = locomotion.update(0, { direction: group.rotation.y, currentYaw: group.rotation.y });
    },
    setCombatState,
    getHandPosition(side, target = new THREE.Vector3()) {
      const hand = armBones[side]?.[2];
      group.updateWorldMatrix(true, true);
      if (!hand) return target.set(0, 1.2, .4);
      hand.getWorldPosition(target);
      return group.worldToLocal(target);
    },
    get opacity() { return opacity; },
    roll() { if (!dead) { rollRemaining = rollDuration; group.userData.rolling = true; } },
    attack() { if (!dead) attackRemaining = 0.34; },
    setDead(value) {
      const next = Boolean(value);
      if (dead === next) return;
      dead = next; rollRemaining = 0;
      if (!dead) { rollPivot.rotation.x = 0; rollPivot.position.y = 1.025; locomotion.reset(); }
    },
    setConcealed(value) {
      concealed = Boolean(value);
      group.userData.hiddenFromOtherPlayers = concealed;
    },
  };
}
