import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStormCloud } from '../src/storm-cloud.js';
const uniforms=()=>({uAge:{value:0},uOpacity:{value:1},uFlash:{value:0},uCutouts:{value:Array.from({length:8},()=>new THREE.Vector3())},uCutoutCount:{value:0}});
test('reference cloud uses the supplied shared artwork in a compact bounded billboard',()=>{
 const texture=new THREE.Texture();texture.userData.artwork='thunder-reference-v1';
 const cloud=createStormCloud(uniforms(),texture);
 assert.equal(cloud.artwork,'thunder-reference-v1');assert.ok(cloud.triangles<=400);assert.ok(cloud.horizontalRadius<=2.85);
 for(const mesh of cloud.meshes){assert.equal(mesh.material.uniforms.uCloud.value,texture);assert.equal(mesh.material.depthWrite,false);assert.ok(mesh.geometry.parameters.width>=5.05&&mesh.geometry.parameters.width<=5.18);assert.equal(mesh.frustumCulled,false);
  // Include billow motion and breathing in the conservative visibility bound.
  assert.ok(mesh.geometry.parameters.width*.5*1.012+.025+.035+.035<cloud.horizontalRadius);
 }
 cloud.dispose();texture.dispose();
});
test('disposing a field frees its meshes but never the shared texture needed by the next cast',()=>{
 const texture=new THREE.Texture(),first=createStormCloud(uniforms(),texture),second=createStormCloud(uniforms(),texture);
 let texturesDisposed=0,firstDisposed=0,secondDisposed=0;
 texture.addEventListener('dispose',()=>texturesDisposed++);
 for(const m of first.meshes){m.geometry.addEventListener('dispose',()=>firstDisposed++);m.material.addEventListener('dispose',()=>firstDisposed++);}
 for(const m of second.meshes){m.geometry.addEventListener('dispose',()=>secondDisposed++);m.material.addEventListener('dispose',()=>secondDisposed++);}
 first.dispose();assert.equal(firstDisposed,4);assert.equal(secondDisposed,0);assert.equal(texturesDisposed,0);
 assert.equal(second.meshes[0].material.uniforms.uCloud.value,texture);
 second.dispose();assert.equal(secondDisposed,4);assert.equal(texturesDisposed,0);texture.dispose();
});
