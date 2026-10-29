import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import rangerUrl from '../assets/characters/ranger.glb?url&inline';
import { createLocomotionController } from './locomotion.js';
import { ROLL_DURATION } from './rules.js';

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
  const unitScale = new THREE.Vector3(1, 1, 1);
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
  let dead = false, concealed = false, opacity = 1, snowSink = 0;
  const locomotion = createLocomotionController();
  let rollRemaining = 0, attackRemaining = 0;
  const rollDuration = ROLL_DURATION;
  const neck = model.getObjectByName('Neck');
  const chest = model.getObjectByName('Chest');
  const findBone = names => {
    const wanted = new Set(names.map(name => name.toLowerCase()));
    let result = null;
    model.traverse(node => {
      if (result || !node.isBone) return;
      const name = String(node.name || node.userData?.name || '').replace(/[^a-z]/gi, '').toLowerCase();
      if (wanted.has(name)) result = node;
    });
    return result;
  };
  const armBones = {
    // GLTFLoader sanitises dots in node names; userData.name retains Blender's label.
    left: ['UpperArmL', 'ForearmL', 'HandL'].map(name => model.getObjectByName(name)),
    right: ['UpperArmR', 'ForearmR', 'HandR'].map(name => model.getObjectByName(name)),
  };
  const rollBones = [
    [findBone(['thighl']), [-1.3, 0, 0]], [findBone(['shinl']), [2.15, 0, 0]],
    [findBone(['thighr']), [-1.3, 0, 0]], [findBone(['shinr']), [2.15, 0, 0]],
    [findBone(['upperarml']), [0, 0, -1.15]], [findBone(['upperarmr']), [0, 0, 1.15]],
    [findBone(['forearml']), [-1.35, 0, 0]], [findBone(['forearmr']), [-1.35, 0, 0]],
    [chest, [-.38, 0, 0]], [neck, [.28, 0, 0]],
  ].filter(([bone]) => bone).map(([bone, angles]) => ({ bone, angles, rotation: new THREE.Quaternion() }));
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

  function update(dt, time, { moving = false, speed = 5.6, direction = 0, inDanger = false, snowWeight = 0 } = {}) {
    restoreAnimatedPose();
    const delta = Math.max(0, Math.min(dt, 0.1));
    const smoothing = 1 - Math.exp(-delta * 12);
    const targetSnowSink = THREE.MathUtils.clamp(snowWeight, 0, 1) * .18;
    const snowResponse = 1 - Math.exp(-delta * (targetSnowSink > snowSink ? 10 : 7));
    snowSink = THREE.MathUtils.lerp(snowSink, targetSnowSink, snowResponse);
    if (Math.abs(snowSink - targetSnowSink) < .001) snowSink = targetSnowSink;
    const movement = locomotion.update(delta, { moving, speed, direction,
      currentYaw: group.rotation.y, rolling: rollRemaining > 0, dead });
    idle.setEffectiveWeight(rollRemaining > 0 ? 1 : 1 - movement.walkWeight);
    walk.setEffectiveWeight(rollRemaining > 0 ? 0 : movement.walkWeight);
    // Walk is a 2/3 s gait authored at the game's 5.6 units/s reference speed.
    walk.setEffectiveTimeScale(movement.playbackSpeed);
    mixer.update(dead ? 0 : delta);
    group.rotation.y = movement.yaw;
    if (rollRemaining > 0 && !dead) {
      rollRemaining = Math.max(0, rollRemaining - delta);
      const progress = 1 - rollRemaining / rollDuration;
      // Fold into a compact shape, somersault toward the facing direction, then stand.
      const tuckIn = THREE.MathUtils.smoothstep(progress, 0, .2);
      const standUp = 1 - THREE.MathUtils.smoothstep(progress, .78, 1);
      const bundle = tuckIn * standUp;
      const rotationProgress = THREE.MathUtils.clamp((progress - .12) / .72, 0, 1);
      // The ranger faces local +Z, so negative local X is a forward somersault.
      rollPivot.rotation.x = -rotationProgress * Math.PI * 2;
      rollPivot.rotation.z = 0;
      rollPivot.position.y = 1.025 - snowSink * .65 - Math.sin(rotationProgress * Math.PI) * .28;
      model.scale.set(THREE.MathUtils.lerp(1, .82, bundle),
        THREE.MathUtils.lerp(1, .66, bundle), THREE.MathUtils.lerp(1, .82, bundle));
      const poseEuler = new THREE.Euler();
      for (const entry of rollBones) {
        poseEuler.set(entry.angles[0] * bundle, entry.angles[1] * bundle, entry.angles[2] * bundle);
        entry.rotation.setFromEuler(poseEuler);
        entry.bone.quaternion.multiply(entry.rotation);
      }
    } else {
      rollPivot.rotation.x = dead ? THREE.MathUtils.lerp(rollPivot.rotation.x, -Math.PI * 0.43, smoothing) : movement.forwardLean;
      rollPivot.rotation.z = movement.sideLean;
      rollPivot.position.y = dead ? THREE.MathUtils.lerp(rollPivot.position.y, 0.35 - snowSink * .35, smoothing) : 1.025 - snowSink;
      model.scale.lerp(unitScale, smoothing);
    }
    group.userData.locomotion = { ...movement };
    group.userData.rolling = rollRemaining > 0;
    group.userData.snowWeight = THREE.MathUtils.clamp(snowWeight, 0, 1);
    group.userData.snowSinkMeters = snowSink;
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
      locomotion.reset(); rollRemaining = 0; attackRemaining = 0; snowSink = 0;
      if (Number.isFinite(direction)) group.rotation.y = direction;
      rollPivot.rotation.set(0, 0, 0); rollPivot.position.y = 1.025;
      model.scale.copy(unitScale);
      group.userData.rolling = false;
      group.userData.snowWeight = 0; group.userData.snowSinkMeters = 0;
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
      if (!dead) { rollPivot.rotation.x = 0; rollPivot.position.y = 1.025; model.scale.copy(unitScale); locomotion.reset(); }
    },
    setConcealed(value) {
      concealed = Boolean(value);
      group.userData.hiddenFromOtherPlayers = concealed;
    },
  };
}
