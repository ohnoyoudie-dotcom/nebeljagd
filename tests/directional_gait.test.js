import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {preparePlayerGeometry} from '../src/player-model.js';
import {createAvatarAnimator} from '../src/avatar-animation.js';
import {createDirectionalGait} from '../src/directional-gait.js';
import {createLocomotionController} from '../src/locomotion.js';

async function rig(){
 const bytes=await readFile(new URL('../assets/characters/nebeljagd_player_base_v1.glb',import.meta.url));
 const loader=new GLTFLoader().register(()=>({name:'TextureStub',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 preparePlayerGeometry(gltf.scene);
 const group=new THREE.Group(),model=new THREE.Group();group.add(model);model.add(gltf.scene);
 const animator=createAvatarAnimator(gltf.scene,gltf.animations);animator.update(0);
 model.updateWorldMatrix(true,true);model.traverse(n=>n.skeleton?.update());
 model.scale.setScalar(1.82/new THREE.Box3().setFromObject(model,true).getSize(new THREE.Vector3()).y);
 model.updateWorldMatrix(true,true);model.traverse(n=>n.skeleton?.update());
 model.position.y-=new THREE.Box3().setFromObject(model,true).min.y;
 const legs=Object.fromEntries(['Left','Right'].map(side=>[side,['UpLeg','Leg','Foot'].map(part=>gltf.scene.getObjectByName('mixamorig'+side+part))]));
 const gait=createDirectionalGait(group,legs),locomotion=createLocomotionController();
 return {group,legs,gait,locomotion,animator};
}
const position=(group,bone)=>group.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));

test('real avatar keeps a forward step clock through diagonal backpedal and aim-angle wrap',async()=>{
 const {gait,locomotion,animator}=await rig();let phase=0;
 for(let i=0;i<360;i++){
  gait.restore();
  const movement=locomotion.update(1/60,{moving:true,speed:5.6,direction:0,currentYaw:0,travelDirection:Math.PI*.5+i*.02});
  const snapshot=animator.update(1/60,movement);gait.apply(movement);
  assert.ok(snapshot.runPlaybackSpeed>0,'aim changes must never reverse the animation clock');
  if(i>0)assert.ok((snapshot.runPhase-phase+1)%1<.05,'no phase restart at diagonal threshold');
  phase=snapshot.runPhase;
 }
});

test('actual rig side/back steps keep feet separated, bounded and reversible without changing arms',async()=>{
 const {group,legs,gait,animator}=await rig();
 const hand=group.getObjectByName('mixamorigRightHand');let maxError=0;
 const center=gait.telemetry.feet.reduce((sum,foot)=>sum+foot.base.x,0)/2;
 for(const direction of [Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,-Math.PI/2,-3*Math.PI/4]){
  let previous=null;
  for(let i=0;i<100;i++){
   gait.restore();animator.update(1/60,{walkWeight:1});
   const rotations=Object.values(legs).flat().map(b=>b.quaternion.clone()),handQ=hand.quaternion.clone();
   gait.apply({gaitX:Math.sin(direction),gaitZ:Math.cos(direction),walkWeight:1});
   const points=Object.values(legs).map(chain=>position(group,chain[2]));
   assert.ok((points[0].x-center)*(points[1].x-center)<0,'feet stay on their own side');
   for(const p of points){assert.ok(p.toArray().every(Number.isFinite));assert.ok(p.y>-.12&&p.y<.8,`foot height ${p.y}`);}
   if(previous)for(let j=0;j<2;j++)assert.ok(points[j].distanceTo(previous[j])<.18,'no snapping between consecutive frames');
   previous=points;maxError=Math.max(maxError,gait.telemetry.maxError);
   assert.deepEqual(hand.quaternion.toArray(),handQ.toArray(),'weapon grip is unaffected');
   gait.restore();Object.values(legs).flat().forEach((b,j)=>assert.deepEqual(b.quaternion.toArray(),rotations[j].toArray()));
  }
 }
 assert.ok(maxError<.15,`reachable foot placement: ${maxError}`);
 animator.startRoll();animator.update(.2);const roll=Object.values(legs).flat().map(b=>b.quaternion.clone());
 gait.apply({gaitX:1,gaitZ:0,walkWeight:1,active:false});Object.values(legs).flat().forEach((b,j)=>assert.deepEqual(b.quaternion.toArray(),roll[j].toArray()));
});
