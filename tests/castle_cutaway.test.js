import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Group,Matrix4,Raycaster,Vector3} from 'three';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {createCastleModel} from '../src/castle-model.js';
import {createCastleCutaway} from '../src/castle-cutaway.js';

const definition=getHouseDefinition('schlossanlage');
const make=()=>createCastleCutaway({definition,group:new Group()});
const outside={x:0,z:70},inside={x:0,z:50};

test('Castle section initializes at the actual spawn, then freezes correctly while paused',()=>{
  const cut=make();cut.update(0,inside);assert.equal(cut.stats.amount,1);
  cut.update(0,outside);assert.equal(cut.stats.amount,0,'a provisional construction observer cannot hide the real exterior spawn');
  cut.update(.016,outside);cut.update(.05,inside);const partial=cut.stats.amount;
  assert.ok(partial>.5&&partial<1);
  for(let i=0;i<10;i++)cut.update(0,inside);
  assert.equal(cut.stats.amount,partial,'zero-dt game pause freezes the visual section');
  cut.update(.20,inside);assert.equal(cut.stats.amount,1);
  assert.equal(cut.stats.upperVisible,false);
  cut.update(.10,outside);assert.ok(cut.stats.amount>0&&cut.stats.amount<.5,'restoring the exterior is gradual');
  for(let i=0;i<6;i++)cut.update(.10,outside);
  assert.equal(cut.stats.amount,0);assert.equal(cut.stats.upperVisible,true);
});

test('Courts and ground-floor towers trigger the section, with a narrow gate pretrigger and stable exit hysteresis',()=>{
  const points=[...definition.qaRoutes.courtyards,...definition.towers.map(t=>[t.x,t.z])];
  for(const [x,z]of points){const cut=make();cut.update(0,{x,z});assert.equal(cut.stats.amount,1);}
  for(const gate of definition.entrances.filter(e=>e.exterior)) {
    const horizontal=['north','south'].includes(gate.side),sign=['north','west'].includes(gate.side)?-1:1;
    const point=distance=>horizontal?{x:gate.center,z:gate.boundary+sign*distance}:{x:gate.boundary+sign*distance,z:gate.center};
    const cut=make();cut.update(0,point(2));cut.update(.01,point(2));
    cut.update(.25,point(1));assert.equal(cut.stats.amount,1,'the high gate clears before the player reaches it');
    const adjacent=horizontal?{x:gate.center+10,z:gate.boundary+sign*.2}:{x:gate.boundary+sign*.2,z:gate.center+10};
    cut.update(.1,adjacent);assert.equal(cut.stats.target,1,'35cm boundary hysteresis prevents edge flicker');
    const exterior=make();exterior.update(0,adjacent);assert.equal(exterior.stats.amount,0,'walking outside beside a wall does not lower the castle');
  }
  const cut=make();cut.update(.1,inside);cut.update(0,null);assert.equal(cut.stats.amount,0,'editor overview has no player-triggered section');
});

test('Upper walls, arch, four hollow tower bases and terrace caps match a bounded majestic exterior',()=>{
  const model=createCastleModel({definition});model.group.updateMatrixWorld(true);
  try {
    const upper=model.group.getObjectByName('Schlossanlage · Wehrmauern und Ecktürme');
    const rays=(x,y,z,distance=10)=>new Raycaster(new Vector3(x,y,z),new Vector3(0,0,-1),0,distance).intersectObject(upper,true);
    assert.ok(rays(20,definition.floorHeight+4.5,65).length,'real upper masonry rises above the former cutaway wall');
    assert.equal(rays(0,definition.floorHeight+5,65).length,0,'the main arch remains open below its curved crown');
    assert.ok(rays(0,definition.floorHeight+7.4,65).length,'the arch has a real stone crown');
    const caps=upper.children.find(mesh=>mesh.geometry.type==='CylinderGeometry');assert.ok(caps);assert.equal(caps.count,4);
    caps.geometry.computeBoundingBox();
    for(let i=0;i<caps.count;i++) {
      const matrix=new Matrix4();caps.getMatrixAt(i,matrix);
      const bounds=caps.geometry.boundingBox.clone().applyMatrix4(matrix),tower=definition.towers[i];
      assert.ok(bounds.min.x>=tower.baseBounds.minX-.01&&bounds.max.x<=tower.baseBounds.maxX+.01,'cap diameter fits the tower instead of doubling its radius');
      assert.ok(bounds.min.z>=tower.baseBounds.minZ-.01&&bounds.max.z<=tower.baseBounds.maxZ+.01);
      assert.ok(Math.abs((bounds.min.y+bounds.max.y)/2-definition.floorHeight-tower.capHeight)<1e-5);
      assert.ok(Math.abs(bounds.max.y-bounds.min.y-.24)<1e-5);
      const ray=new Raycaster(new Vector3(tower.x,4,tower.z),new Vector3(0,-1,0),0,1.3);
      assert.equal(ray.intersectObject(upper,true).length,0,'the transition band is a hollow ring, not a low invisible ceiling');
    }
    assert.ok(new Box3().setFromObject(upper).max.y<=definition.height+.01);
  }finally{model.dispose();}
});

test('Colour and both shadow passes share the same section plane without touching physical walls or instance buffers',()=>{
  const model=createCastleModel({definition}),physical=JSON.stringify(definition.walls);
  try {
    const upper=model.group.getObjectByName('Schlossanlage · Wehrmauern und Ecktürme'),uniforms=new Set(),buffers=[];
    for(const mesh of upper.children) {
      assert.ok(mesh.isInstancedMesh);buffers.push([mesh,mesh.instanceMatrix.array]);
      for(const material of [mesh.material,mesh.customDepthMaterial,mesh.customDistanceMaterial]) {
        assert.ok(material?.userData.castleSection,'shadows must retract together with visible stone');
        const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <clipping_planes_fragment>'};
        material.onBeforeCompile(shader,{});uniforms.add(shader.uniforms.uCastleSectionHeight);
        assert.match(shader.vertexShader,/instanceMatrix \* castleSectionPosition/);assert.match(shader.fragmentShader,/vCastleSectionHeight > uCastleSectionHeight/);
      }
    }
    assert.equal(uniforms.size,1);const uniform=[...uniforms][0];
    model.update(.01,0,outside);model.update(.25,.25,inside);
    assert.equal(model.cutaway.amount,1);assert.equal(upper.visible,false);
    assert.equal(uniform.value,definition.floorHeight+definition.cutawayHeight);
    assert.equal(JSON.stringify(definition.walls),physical);
    for(const [mesh,array]of buffers)assert.equal(mesh.instanceMatrix.array,array);
  }finally{model.dispose();}
});
