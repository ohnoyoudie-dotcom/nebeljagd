import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const PLAYER_MODEL_URL = '/assets/characters/player/nebeljagd_player_base_v1.glb';
import { createLocomotionController } from './locomotion.js';
import { createAvatarAnimator } from './avatar-animation.js';

/** Neutral, modular Blender-authored human; Vite embeds the complete GLB. */
export async function createCharacter(scene) {
  const gltf = await new GLTFLoader().loadAsync(PLAYER_MODEL_URL);
  const group = new THREE.Group();
  group.name = 'Nebeljäger · Tripo';
  const presentationPivot = new THREE.Group();
  const pelvisHeight = 0;
  presentationPivot.position.y = pelvisHeight;
  group.add(presentationPivot);
  const model = gltf.scene;
  model.position.set(0, 0, 0);
  model.name = 'Nebeljagd · Tripo Basisavatar';
  presentationPivot.add(model);

  // Tripo exports can use a different scene scale/origin. Normalize to a
  // predictable human height and put the lowest visible point on the ground.
  model.updateWorldMatrix(true, true);
  const sourceBounds = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  if (!(sourceSize.y > 0.01) || !Number.isFinite(sourceSize.y)) {
    throw new Error('Die Tripo-GLB besitzt keine gültigen Modellabmessungen.');
  }
  const targetHeight = 1.82;
  const normalizedScale = targetHeight / sourceSize.y;
  model.scale.setScalar(normalizedScale);
  model.updateWorldMatrix(true, true);
  const groundedBounds = new THREE.Box3().setFromObject(model);
  model.position.y -= groundedBounds.min.y;
  model.updateWorldMatrix(true, true);
  const unitScale = model.scale.clone();
  const materials = new Set();
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
      const originalCompile = own.onBeforeCompile;
      const originalKey = own.customProgramCacheKey?.bind(own);
      own.onBeforeCompile = shader => {
        originalCompile?.(shader);
        shader.uniforms.uCharacterSnowClipHeight = snowClipHeight;
        shader.uniforms.uCharacterSnowClipStrength = snowClipStrength;
        shader.vertexShader = `varying vec3 vCharacterSnowWorld;
${shader.vertexShader}`.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vCharacterSnowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
        shader.fragmentShader = `uniform float uCharacterSnowClipHeight;
uniform float uCharacterSnowClipStrength;
varying vec3 vCharacterSnowWorld;
${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (uCharacterSnowClipStrength > .01) {
            float snowEdge = sin(vCharacterSnowWorld.x * 17.3 + vCharacterSnowWorld.z * 11.7) * .010
              + sin(vCharacterSnowWorld.x * 31.1 - vCharacterSnowWorld.z * 23.9) * .005;
            if (vCharacterSnowWorld.y < uCharacterSnowClipHeight + snowEdge) discard;
          }`);
      };
      own.customProgramCacheKey = () => `${originalKey?.() ?? ''}|nebeljagd-character-snow-clip-v1`;
      materials.add(own);
      return own;
    };
    part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
  });
  // A faint local-only read-through keeps the traveller legible under a canopy or
  // in poison mist. These draws reuse the original skin and bone matrices.
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

  const animator = createAvatarAnimator(model, gltf.animations);
  let dead = false, concealed = false, opacity = 1, snowSink = 0;
  const locomotion = createLocomotionController();
  let attackRemaining = 0, rollYaw = group.rotation.y;
  const neck = model.getObjectByName('Neck');
  const chest = model.getObjectByName('Chest');
  const findBone = names => {
    const wanted = names.map(name => String(name).replace(/[^a-z0-9]/gi, '').toLowerCase());
    let result = null;
    model.traverse(node => {
      if (result || !node.isBone) return;
      const raw = String(node.name || node.userData?.name || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (wanted.some(name => raw === name || raw.endsWith(name) || raw.includes(name))) result = node;
    });
    return result;
  };
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
    if (!next || dead || animator.rolling) return;
    for (const [bone, rotation] of animatedPose) rotation.copy(bone.quaternion);
    if (chest) chest.rotation.y += next.chestTwist || 0;
    poseArm('left', next.leftHand);
    poseArm('right', next.rightHand);
    poseApplied = true;
  }
  group.userData.hiddenFromOtherPlayers = false;
  group.userData.concealmentOpacity = 1;
  const bones = new Set();
  model.traverse(node => { if (node.isBone) bones.add(node); });
  group.userData.characterAsset = {
    name: 'Nebeljäger Tripo', source: PLAYER_MODEL_URL,
    format: 'GLB', skinned: true, joints: bones.size, clips: gltf.animations.map(clip => clip.name),
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
    const silhouetteTarget = snowClip > .08 ? 0 : concealed ? 0.06 : inDanger ? 0.14 : 0.045;
    silhouetteMaterial.opacity = THREE.MathUtils.lerp(silhouetteMaterial.opacity,
      silhouetteTarget, 1 - Math.exp(-delta * 6));
    group.userData.localSilhouetteOpacity = silhouetteMaterial.opacity;
    group.userData.concealmentOpacity = opacity;
  }

  return {
    group, update,
    resetMotion(direction = group.rotation.y) {
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
      if (!dead) { presentationPivot.rotation.x = 0; presentationPivot.position.y = pelvisHeight; model.scale.copy(unitScale); locomotion.reset(); }
    },
    setConcealed(value) {
      concealed = Boolean(value);
      group.userData.hiddenFromOtherPlayers = concealed;
    },
  };
}
