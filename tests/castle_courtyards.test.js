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

test('Open castle courts add no surface that could conceal the actual terrain',()=>{
  const court=createCastleCourtyards({definition});
  assert.equal(court.stats.openAreas,2);assert.equal(court.stats.drawCalls,0);
  assert.equal(court.group.children.length,0);court.dispose();court.dispose();
});

test('Castle masonry masks follow rotation/scale without altering authored map or other houses',()=>{
  for(const [rotation,scale]of [[0,1],[Math.PI/2,.8],[Math.PI/3,1.25]]) {
    const placed={...object,position:[17,-22],rotation,scale},map={objects:[placed]},before=structuredClone(map);
    const cleared=createCastleGroundMask(map,{padding:1});
    const c=Math.cos(rotation),s=Math.sin(rotation),world=(x,z)=>[17+scale*(c*x+s*z),-22+scale*(-s*x+c*z)];
    for(const area of definition.courtyardGroundAreas) {
      const p=world((area.minX+area.maxX)/2,(area.minZ+area.maxZ)/2);
      assert.equal(cleared(...p),false);
    }
    assert.equal(cleared(...world(0,45)),true);
    assert.equal(cleared(...world(100,0)),false);assert.deepEqual(map,before);
  }
  assert.equal(createCastleGroundMask({objects:[{...object,variant:'waldhaus'}]})(0,0),false);
});

test('Winter courts retain natural and painted snow and footprints while indoor masonry remains clear',()=>{
  const map={objects:[object],paths:[],rivers:[]},cleared=createCastleGroundMask(map,{padding:1});
  const paint=createTerrainPaintIndex([{id:'snow',type:'snow',position:[-26,0],radius:30,strength:1,hardness:1,variation:0,seed:1}]);
  const bounds={minX:-28,maxX:-24,minZ:-2,maxZ:2},snow=new Uint8Array(16),reference=new Uint8Array(16);
  bakeTerrainPaint(paint,bounds,4,4,null,reference,()=>1);
  bakeTerrainPaint(paint,bounds,4,4,null,snow,()=>1,cleared);
  assert.ok(reference.every(v=>v===255));assert.ok(snow.every(v=>v===255),'painted and natural snow remain visible in courtyard openings');
  const spatial={isLand:()=>true,isWater:()=>false,biomeWeightsAt:()=>[{biome:'snow',weight:1}]},root=new Group();
  const cover=createSnowCover(root,{map,heightAt:()=>2,spatial});
  try {
    cover.update(0,new Vector3(-26,2,0));
    assert.equal(cover.weightAt(-26,0),1);assert.ok(cover.surfaceHeightAt(-26,0)>2.1);
    assert.equal(cover.weightAt(0,45),0);assert.equal(cover.surfaceHeightAt(0,45),2);
    assert.equal(cover.weightAt(100,0),1);assert.ok(cover.surfaceHeightAt(100,0)>2.1);
    assert.equal(snowWeightAt({snowWeightAt:cover.weightAt,biomeWeightsAt:spatial.biomeWeightsAt},-26,0),1);
    const matrix=new Matrix4(),position=new Vector3();
    root.traverse(mesh=>{if(!mesh.isInstancedMesh)return;for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
      assert.equal(cleared(position.x,position.z),false,'no powder instances inside covered castle floors');
    }});
  }finally{cover.dispose();}
});
