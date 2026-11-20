import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createFloatingIsland } from '../src/floating-island.js';
import { ensureLandscape } from '../src/map/landscape.js';
import { validateWorldmap } from '../src/map/model.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json',import.meta.url)));
test('floating edge survives editor landscape edits and preserves coast collision',()=>{
  const map=structuredClone(fixture),water=createWorldSpatialModel(map);
  ensureLandscape(map).worldEdge='floating';ensureLandscape(map).woodlandDetails=false;
  assert.equal(map.landscape.worldEdge,'floating');assert.equal(validateWorldmap(map).valid,true);
  const floating=createWorldSpatialModel(map);
  for(const point of [[30,-42],[-599,-719],[600,700]]){
    assert.equal(floating.isLand(...point),water.isLand(...point));
    assert.equal(floating.isWater(...point),water.isWater(...point));
    const a={x:point[0],z:point[1]},b={...a};floating.resolveWaterMovement(a,.42);water.resolveWaterMovement(b,.42);assert.deepEqual(a,b);
  }
  map.landscape.worldEdge='invalid';assert.equal(validateWorldmap(map).valid,false);
  const old=structuredClone(fixture);delete old.landscape?.worldEdge;ensureLandscape(old);assert.equal(old.landscape.worldEdge,undefined);
});
test('floating cliffs meet all land outlines and background stays below play area',()=>{
  const root=new THREE.Group(),map={bounds:{minX:-80,maxX:80,minZ:-80,maxZ:80},island:{points:[[-50,-50],[50,-50],[50,50],[-50,50]]},islets:[{points:[[60,60],[70,60],[70,70],[60,70]]}]};
  const before=JSON.stringify(map),time={value:0};
  const result=createFloatingIsland(root,{map,heightAt:()=>2,biomeAt:()=> 'forest',timeUniform:time});
  assert.equal(JSON.stringify(map),before);assert.ok(result.coastVertices>100);
  const [cliff,floor,clouds]=root.children[0].children;
  assert.ok([...cliff.geometry.attributes.position.array].every(Number.isFinite));
  const p=cliff.geometry.attributes.position;
  for(let i=0;i<p.count;i+=6){assert.ok(Math.abs(p.getY(i)-1.975)<1e-5);assert.ok(p.getY(i+5)<-70);}
  floor.geometry.computeBoundingBox();assert.ok(floor.geometry.boundingBox.max.y < -150);
  assert.equal(clouds.material.uniforms.uTime,time);assert.equal(clouds.material.depthWrite,false);
  assert.ok(cliff.userData.ignoreVision&&clouds.userData.ignoreVision);
  root.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
});
