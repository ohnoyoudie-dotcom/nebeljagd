import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4,Raycaster,Vector3} from 'three';
import {createCastleCourtyards} from '../src/castle-courtyards.js';
import {createCastleGroundMask} from '../src/map/castle-ground.js';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {createSnowCover} from '../src/snow-cover.js';
import {snowWeightAt} from '../src/snow-footprints.js';
import {createTerrainPaintIndex} from '../src/map/terrain-paint.js';
import {bakeTerrainPaint} from '../src/terrain-paint-renderer.js';

const definition=getHouseDefinition('schlossanlage');
const object={id:'castle',kind:'house',variant:'schlossanlage',position:[0,0],rotation:0,scale:1};

test('Green castle lawns cover only their outdoor centres and leave the stone borders clear',()=>{
  const lawn=createCastleCourtyards({definition});lawn.group.updateMatrixWorld(true);
  try {
    assert.equal(lawn.stats.lawns,2);assert.equal(lawn.stats.drawCalls,1);
    const cast=(x,z)=>new Raycaster(new Vector3(x,1,z),new Vector3(0,-1,0),0,2).intersectObject(lawn.group,true);
    for(const court of definition.courtyards) {
      const cx=(court.minX+court.maxX)/2,cz=(court.minZ+court.maxZ)/2;
      const hits=cast(cx,cz);assert.ok(hits.length>=1);
      assert.ok(Math.abs(hits[0].point.y-.003)<1e-6);
      assert.equal(hits[0].object.material.userData.castleSurface,'grass');
      assert.ok(hits[0].object.material.color.g>hits[0].object.material.color.r);
      assert.equal(cast(court.minX+.4,cz).length,0,'stone borders have no grass overlay');
    }
    for(const room of definition.rooms)assert.equal(cast((room.minX+room.maxX)/2,(room.minZ+room.maxZ)/2).length,0,room.name);
  }finally{lawn.dispose();}
});

test('Castle lawn and snow masks follow rotation/scale without altering authored map or other houses',()=>{
  for(const [rotation,scale]of [[0,1],[Math.PI/2,.8],[Math.PI/3,1.25]]) {
    const placed={...object,position:[17,-22],rotation,scale},map={objects:[placed]},before=structuredClone(map);
    const lawn=createCastleGroundMask(map,{lawnsOnly:true}),cleared=createCastleGroundMask(map);
    const c=Math.cos(rotation),s=Math.sin(rotation),world=(x,z)=>[17+scale*(c*x+s*z),-22+scale*(-s*x+c*z)];
    for(const area of definition.courtyardLawnAreas) {
      const p=world((area.minX+area.maxX)/2,(area.minZ+area.maxZ)/2);
      assert.equal(lawn(...p),true);assert.equal(cleared(...p),true);
    }
    assert.equal(lawn(...world(0,45)),false);assert.equal(cleared(...world(0,45)),true);
    assert.equal(cleared(...world(100,0)),false);assert.deepEqual(map,before);
  }
  assert.equal(createCastleGroundMask({objects:[{...object,variant:'waldhaus'}]})(0,0),false);
});

test('Winter castle courts suppress snow displacement, drifts and footprints while the surrounding biome stays snowy',()=>{
  const map={objects:[object],paths:[],rivers:[]},cleared=createCastleGroundMask(map,{padding:1});
  const paint=createTerrainPaintIndex([{id:'snow',type:'snow',position:[-26,0],radius:30,strength:1,hardness:1,variation:0,seed:1}]);
  const bounds={minX:-28,maxX:-24,minZ:-2,maxZ:2},snow=new Uint8Array(16),reference=new Uint8Array(16);
  bakeTerrainPaint(paint,bounds,4,4,null,reference,()=>1);
  bakeTerrainPaint(paint,bounds,4,4,null,snow,()=>1,cleared);
  assert.ok(reference.every(v=>v===255));assert.ok(snow.every(v=>v===0),'painted and natural snow cannot displace the lawn');
  const spatial={isLand:()=>true,isWater:()=>false,biomeWeightsAt:()=>[{biome:'snow',weight:1}]},root=new Group();
  const cover=createSnowCover(root,{map,heightAt:()=>2,spatial});
  try {
    cover.update(0,new Vector3(-26,2,0));
    assert.equal(cover.weightAt(-26,0),0);assert.equal(cover.surfaceHeightAt(-26,0),2);
    assert.equal(cover.weightAt(100,0),1);assert.ok(cover.surfaceHeightAt(100,0)>2.1);
    assert.equal(snowWeightAt({snowWeightAt:cover.weightAt,biomeWeightsAt:spatial.biomeWeightsAt},-26,0),0);
    const matrix=new Matrix4(),position=new Vector3();
    root.traverse(mesh=>{if(!mesh.isInstancedMesh)return;for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
      assert.equal(cleared(position.x,position.z),false,'no powder instances inside the castle grounds');
    }});
  }finally{cover.dispose();}
});
