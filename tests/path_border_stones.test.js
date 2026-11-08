import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBorderStonePlacements, paintedPathCoverage, createPathBorderStones, BORDER_STONE_RULES } from '../src/path-border-stones.js';
import { createTerrainPaintIndex } from '../src/map/terrain-paint.js';
const stamp=(x,z,type='cobble',radius=2.5)=>({position:[x,z],radius,strength:1,hardness:.65,seed:1,type});

test('overlapping painted path strokes have only one shared exterior stone border',()=>{
  const map={paths:[],landscape:{terrain:Array.from({length:13},(_,i)=>stamp(0,i*.8))}};
  const before=JSON.stringify(map), index=createTerrainPaintIndex(map),stones=buildBorderStonePlacements(map,index);
  assert.ok(stones.length>40);assert.deepEqual(stones,buildBorderStonePlacements(map));assert.equal(JSON.stringify(map),before);
  for(const p of stones){
    assert.ok(Math.abs(paintedPathCoverage(index,p.x,p.z)-.5)<.16,'every stone belongs to the outer contour');
    if(p.z>1&&p.z<8)assert.ok(Math.abs(p.x)>1.7,'overlapping stamp interiors remain clear');
  }
  map.landscape.terrain.push(stamp(0,5,'meadow',30));
  assert.equal(buildBorderStonePlacements(map).length,0,'later grass paint removes the buried path border');
});

test('route borders follow bends and leave road junctions and bridges clear',()=>{
  const routes=[{kind:'main',width:4,points:[[-12,0],[0,0],[12,4]]},{kind:'main',width:4,points:[[0,-12],[0,12]]}];
  const stones=buildBorderStonePlacements({paths:routes});assert.ok(stones.length>80);
  assert.ok(stones.every(p=>Number.isFinite(p.direction)&&p.width>0&&p.height>0));
  assert.ok(stones.every(p=>!(Math.abs(p.x)<1.8&&Math.abs(p.z)<1.8)),'crossing interior is open');
  assert.deepEqual(buildBorderStonePlacements({paths:routes.map(p=>({...p,kind:'bridge'}))}),[]);
  const long=buildBorderStonePlacements({paths:[{kind:'main',width:4,points:[[0,0],[10000,0]]}]});
  assert.equal(long.length,BORDER_STONE_RULES.maximum);
});

test('stone batches sit on the actual ground, cull and release their meshes',()=>{
  const root=new THREE.Group(),stones=createPathBorderStones(root,{paths:[],landscape:{terrain:[stamp(0,0)]}},()=>3);
  assert.ok(stones.stats.count>10);const matrix=new THREE.Matrix4();
  for(const mesh of root.children)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert.ok(Math.abs(matrix.elements[13]-3.025)<1e-5);}
  stones.update({x:1000,z:1000});assert.equal(stones.stats.visibleChunks,0);
  stones.update({x:0,z:0});assert.ok(stones.stats.visibleChunks>0);
  stones.dispose();assert.equal(root.children.length,0);
});
