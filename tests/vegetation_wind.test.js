import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVegetationWind } from '../src/vegetation-wind.js';
import { buildVegetationPatch, vegetationTint, MAX_GRASS_INSTANCES } from '../src/vegetation-patches.js';
import { vegetationSettings } from '../src/map/landscape.js';

const object = { id:'test-grass',kind:'grass',variant:'tall',position:[10,-30],radius:3.5,scale:1,rotation:.3 };
const configured = changes => ({...object,vegetation:{...vegetationSettings(object),...changes}});
const windMap = (wind={},windZones=[]) => ({landscape:{version:1,wind,windZones}});

test('legacy patch density/heights remain unchanged, while editable density and height are independent of width', () => {
 const legacy=buildVegetationPatch(object);
 assert.equal(legacy.patch.instanceCount,245);assert.equal(legacy.patch.crossedStalkCount,980);
 assert.ok(legacy.patch.minBladeHeight>=2.25&&legacy.patch.maxBladeHeight<=2.6);
 const high=buildVegetationPatch(configured({height:3,heightVariation:0,edgeSoftness:0}));
 const low=buildVegetationPatch(configured({height:.25,heightVariation:0,edgeSoftness:0}));
 assert.equal(high.patch.instanceCount,low.patch.instanceCount);
 assert.deepEqual(high.instances.map(i=>[i.position,i.scale[0],i.scale[2]]),low.instances.map(i=>[i.position,i.scale[0],i.scale[2]]));
 assert.ok(Math.abs(high.patch.minBladeHeight/low.patch.minBladeHeight-12)<1e-10);
 assert.equal(buildVegetationPatch(configured({density:0})).patch.instanceCount,0);
 assert.equal(buildVegetationPatch(configured({density:.5})).patch.instanceCount,123);
 assert.equal(buildVegetationPatch(configured({}),{budget:3}).patch.instanceCount,3);
 assert.equal(buildVegetationPatch(configured({}),{budget:3}).patch.budgetLimited,true);
 assert.ok(MAX_GRASS_INSTANCES>=239693&&MAX_GRASS_INSTANCES<=500000);
});

test('seven grass presets share geometry and deterministic irregular silhouettes; editable height variation is bounded', () => {
 for(const type of ['short','meadow','tall','dry','forest','swamp','flowers']){
  const p=buildVegetationPatch(configured({type,heightVariation:.5,edgeSoftness:1}));
  assert.ok(['short','tall'].includes(p.renderVariant)); assert.ok(p.instances.length>0);
  assert.ok(p.patch.minBladeHeight>=p.patch.height*.5&&p.patch.maxBladeHeight<=p.patch.height*1.5);
  assert.deepEqual(p,buildVegetationPatch(configured({type,heightVariation:.5,edgeSoftness:1})));
 }
 const solid=buildVegetationPatch(configured({edgeSoftness:0}));
 const soft=buildVegetationPatch(configured({edgeSoftness:1}));
 assert.notDeepEqual(soft.instances.map(i=>i.position),solid.instances.map(i=>i.position));
 assert.equal(soft.patch.instanceCount,solid.patch.instanceCount);
});

test('terrain tint responds to ground edits, retains natural vegetation colour, varies per tuft without alpha changes', () => {
 const s=vegetationSettings(configured({groundColor:true,groundBlend:1,colorVariation:0}));
 const green=vegetationTint(s,0,0,new THREE.Color('#408844'));
 const sand=vegetationTint(s,0,0,new THREE.Color('#ccb77a'));
 assert.notEqual(green.getHexString(),sand.getHexString());
 assert.notEqual(sand.getHexString(),'ccb77a');
 const independent={...s,groundColor:false};
 assert.equal(vegetationTint(independent,0,0,new THREE.Color('#fff')).getHexString(),vegetationTint(independent,0,0,new THREE.Color('#000')).getHexString());
 assert.notEqual(vegetationTint({...s,colorVariation:1},0,0).getHexString(),vegetationTint({...s,colorVariation:1},2,1).getHexString());
});

test('GPU wind CPU reference anchors roots, travels coherently, obeys off/speed and soft sheltered directional zones', () => {
 const field=createVegetationWind(windMap({direction:0,strength:.5,gusts:false,turbulence:0}));
 assert.deepEqual(field.sampleVertex(0,0,0,1),{x:0,z:0});
 const a=field.sample(0,0,1),b=field.sample(.1,.1,1);
 assert.equal(a.x,0);assert.ok(a.z<0);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.01);
 assert.notDeepEqual(a,field.sample(0,0,2));
 field.configure(windMap({enabled:false}));assert.deepEqual(field.sample(0,0,2),{x:0,z:0});
 field.configure(windMap({speed:0}));assert.deepEqual(field.sample(3,4,2),field.sample(3,4,5));
 field.configure(windMap({direction:0,strength:.5,gusts:false,turbulence:0},[{id:'shelter',name:'Shelter',position:[0,0],radius:10,falloff:.5,strength:0,direction:0}]));
 assert.deepEqual(field.sample(0,0,1),{x:0,z:0});
 assert.ok(Math.abs(field.sample(9.999,0,1).z-field.sample(10.001,0,1).z)<.0001);
 field.configure(windMap({direction:0,strength:.5,gusts:false,turbulence:0},[{id:'east',name:'East',position:[0,0],radius:10,falloff:.5,strength:.5,direction:Math.PI/2}]));
 assert.ok(field.sample(0,0,1).x>0);assert.ok(Math.abs(field.sample(0,0,1).z)<1e-10);
});

test('wind shader is instancing aware, changes no fragment alpha and updates uniforms without rewriting instances', () => {
 const field=createVegetationWind({}),mat=new THREE.MeshStandardMaterial({alphaTest:.45,transparent:true,opacity:.7});
 mat.onBeforeCompile=shader=>{shader.fragmentShader+='\n// existing coverage';};
 field.apply(mat,{height:7,response:.5});
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <alphatest_fragment>'};
 mat.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/modelMatrix \* instanceMatrix/);
 assert.match(shader.vertexShader,/vegetationHeight \* vegetationHeight/);
 assert.match(shader.vertexShader,/uVegetationZoneArea\[32\]/);
 assert.equal(shader.fragmentShader,'#include <alphatest_fragment>\n// existing coverage');
 assert.equal(mat.alphaTest,.45);assert.equal(mat.opacity,.7);assert.equal(mat.transparent,true);
 field.update(5);assert.equal(shader.uniforms.uVegetationTime.value,5);
 assert.equal(field.stats.gpu,true);mat.dispose();
});
