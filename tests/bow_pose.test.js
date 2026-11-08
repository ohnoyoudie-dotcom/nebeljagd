import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAvatarAnimator } from '../src/avatar-animation.js';
import { createCombatPoseController } from '../src/character-combat-pose.js';
import { createHandGripSocket } from '../src/hand-grip.js';
import { preparePlayerGeometry } from '../src/player-model.js';
import { createWeapons } from '../src/weapons.js';
import { ARROW_LENGTH } from '../src/arrow-alignment.js';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';
import { TRIPO_PROP_DEFINITIONS } from '../src/map/tripo-prop-definitions.js';

const bytes = await readFile(new URL('../assets/characters/nebeljagd_player_base_v1.glb', import.meta.url));

async function rig() {
  const gltf = await new GLTFLoader().register(() => ({
    name: 'StanceGeometryTextureStub', loadTexture: () => Promise.resolve(new THREE.Texture()),
  })).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  preparePlayerGeometry(gltf.scene);
  const scene = new THREE.Scene(), actor = new THREE.Group(), model = new THREE.Group();
  scene.add(actor); actor.add(model); model.add(gltf.scene);
  const animator = createAvatarAnimator(gltf.scene, gltf.animations); animator.update(0);
  model.updateWorldMatrix(true, true); model.traverse(node => node.skeleton?.update());
  model.scale.setScalar(1.82 / new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3()).y);
  model.updateWorldMatrix(true, true); model.traverse(node => node.skeleton?.update());
  model.position.y -= new THREE.Box3().setFromObject(model, true).min.y;
  const bone = name => gltf.scene.getObjectByName(`mixamorig${name}`);
  const arms = {}, legs = {};
  for (const side of ['left', 'right']) {
    const name = side === 'left' ? 'Left' : 'Right';
    arms[side] = ['Arm', 'ForeArm', 'Hand'].map(part => bone(`${name}${part}`));
    legs[side] = ['UpLeg', 'Leg', 'Foot'].map(part => bone(`${name}${part}`));
  }
  const hips = bone('Hips');
  const gripSockets = Object.fromEntries(['left','right'].map(side=>[side,createHandGripSocket(arms[side][2],bone((side==='left'?'Left':'Right')+'HandMiddle1'))]));
  const controller = createCombatPoseController(actor, { chest: bone('Spine2'), hips, arms, legs, gripSockets });
  const socket = createHandGripSocket(arms.right[2], bone('RightHandMiddle1'));
  const point = node => actor.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
  return { scene, actor, model, gltf, animator, controller, socket, arms, legs, hips, point, bone, gripSockets };
}

for (const variant of ['wood', 'kit-tripo-ornate-bow']) test(`real avatar keeps both bow grips outside the torso: ${variant}`, async () => {
  const {scene,actor,animator,controller,gripSockets,arms,point}=await rig();
  const loader=new GLTFLoader().register(()=>({name:'BowTextureStub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const bytes=await readFile(new URL('../assets/imported/tripo-extra-weapons/runtime/ornate-bow.glb',import.meta.url));
  const {scene:bowPrototype}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const inspection=JSON.parse(await readFile(new URL('../assets/imported/tripo-extra-weapons/inspections/ornate-bow.json',import.meta.url)));
  bowPrototype.userData.bowRig=inspection.normalization.bowRig;
  const character={setCombatState:pose=>controller.apply(pose),getGripPosition:(side,target)=>gripSockets[side].getPosition(actor,target),getHandPosition:(side,target)=>target.copy(point(arms[side][2]))};
  const weapons=createWeapons(scene,actor,{bounds:100,heightAt:()=>0},character,{placements:[{id:'bow',kind:'bow',variant,position:[0,0]}],tripoPrototypes:{'kit-tripo-ornate-bow':bowPrototype}});
  weapons.interact(actor.position);weapons.attack(actor.position,0);
  for(let frame=0;frame<16;frame++) {
    controller.restore();animator.update(.04,{walkWeight:frame>8?1:0,playbackSpeed:1});
    weapons.update(.04,frame*.04,actor.position,frame>8?Math.PI/2:0);
    actor.updateWorldMatrix(true,true);
    const left=gripSockets.left.getPosition(actor),right=gripSockets.right.getPosition(actor);
    const tail=actor.getObjectByName('Aufgelegter Pfeil').localToWorld(new THREE.Vector3(0,0,-ARROW_LENGTH/2));actor.worldToLocal(tail);
    const pose=controller.inspect();
    assert.ok(left.x<-.22 && left.z>.45,'bow grip sits forward on the right shoulder line: '+JSON.stringify({left,right,pose}));
    assert.ok(right.distanceTo(tail)<.025,'drawing palm touches the actual moving string: '+JSON.stringify({right,tail,pose}));
    assert.ok(pose.rightArm.elbow.x<-.22,'right elbow remains outside the chest: '+JSON.stringify(pose));
    for(let t=0;t<=1;t+=.1) {
      const sample=new THREE.Vector3().copy(pose.rightArm.elbow).lerp(right,t);
      assert.ok(sample.x<-.18 || sample.z>.25,'forearm stays outside the torso: '+JSON.stringify({sample,right,pose}));
    }
  }
  weapons.dispose();
});

test('real drawing palm follows the pitched string while aiming at close and distant low barrels', async () => {
  const barrel = TRIPO_PROP_DEFINITIONS.find(item => item.kind === 'barrel');
  for (const variant of ['wood', 'kit-tripo-ornate-bow']) for (const distance of [1.6, 6]) {
    const { scene, actor, animator, controller, gripSockets, arms, point } = await rig();
    actor.scale.setScalar(1.2);
    const loader = new GLTFLoader().register(() => ({ name: 'PitchedBowTextureStub', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
    const bytes = await readFile(new URL('../assets/imported/tripo-extra-weapons/runtime/ornate-bow.glb', import.meta.url));
    const { scene: bowPrototype } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const inspection = JSON.parse(await readFile(new URL('../assets/imported/tripo-extra-weapons/inspections/ornate-bow.json', import.meta.url)));
    bowPrototype.userData.bowRig = inspection.normalization.bowRig;
    const combat = createCombat();
    const target = combat.addTarget({ id: 'barrel', position: { x: 0, y: 0, z: distance },
      radius: barrel.destructible.radius, height: barrel.height, maxHealth: 60, destructible: true });
    const index = createCollisionIndex([], barrel.walls.map(body => ({ ...body, objectId: 'barrel',
      minZ: body.minZ + distance, maxZ: body.maxZ + distance })));
    const world = { heightAt: () => 0, worldRadius: 100,
      traceProjectile: (a, b, r, accepts) => index.traceSegment(a, b, r, accepts) };
    const character = { setCombatState: pose => controller.apply(pose),
      getGripPosition: (side, result) => gripSockets[side].getPosition(actor, result),
      getHandPosition: (side, result) => result.copy(point(arms[side][2])) };
    const weapons = createWeapons(scene, actor, world, character, { combat,
      placements: [{ id: 'bow', kind: 'bow', variant, rarity: 'common', position: [0, 0] }],
      tripoPrototypes: { 'kit-tripo-ornate-bow': bowPrototype } });
    try {
      weapons.interact(actor.position); weapons.attack(actor.position, 0);
      for (let frame = 0; frame < 16; frame++) {
        controller.restore(); animator.update(.04, { walkWeight: frame > 8 ? 1 : 0, playbackSpeed: 1 });
        weapons.update(.04, frame * .04, actor.position, frame > 8 ? .025 : 0);
        actor.updateWorldMatrix(true, true);
        const state = weapons.telemetry;
        assert.equal(state.bowAim?.targetId, 'barrel', `${variant} at ${distance}m stays physically aimed`);
        assert.ok(state.bowAim.pitch > 0);
        const palm = gripSockets.right.getPosition(actor);
        const tail = actor.worldToLocal(actor.getObjectByName('Aufgelegter Pfeil').localToWorld(new THREE.Vector3(0, 0, -ARROW_LENGTH / 2)));
        assert.ok(palm.distanceTo(tail) < .025, `${variant} at ${distance}m: tilted string remains in the real palm (${palm.distanceTo(tail)})`);
        assert.ok(state.bowAlignment.error < .025);
        if (variant !== 'wood') assert.ok(state.heldGrip.error < 1e-7, 'the other hand retains its fixed bow grip');
      }
      weapons.releaseAttack(actor.position, .025);
      for (let frame = 0; frame < 80; frame++) weapons.update(1 / 60, 1 + frame / 60, actor.position, .025);
      assert.equal(target.health, 38, 'one actual arrow from the pitched palm pose hits the normal barrel');
    } finally { weapons.dispose(); }
  }
});
