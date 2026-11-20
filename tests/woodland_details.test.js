import test from 'node:test';
import assert from 'node:assert/strict';
import {woodlandDetailPlacements,createWoodlandDetails} from '../src/woodland-details.js';
import * as THREE from 'three';
const objects=Array.from({length:100},(_,i)=>({id:'tree-'+i,kind:'tree',position:[(i%10)*8,Math.floor(i/10)*8],scale:1,rotation:0}));
const map={objects,paths:[],rivers:[]};
const spatial={isLand:()=>true,isWater:()=>false,biomeAt:()=> 'forest'};
test('woodland flowers and mushrooms form deterministic varied groups and preserve authored objects',()=>{
 const before=JSON.stringify(map),a=woodlandDetailPlacements(map,{spatial}),b=woodlandDetailPlacements(map,{spatial});assert.deepEqual(a,b);assert.ok(a.some(p=>p.kind==='mushroom'));assert.ok(a.some(p=>p.kind==='flower'));assert.ok(new Set(a.map(p=>p.scale)).size>10);assert.equal(JSON.stringify(map),before);
 assert.deepEqual(woodlandDetailPlacements({...map,landscape:{woodlandDetails:false}},{spatial}),[]);
});
test('decorations avoid water, paths, houses, painted paving while allowing elevated plateaus',()=>{
 const candidates=woodlandDetailPlacements(map,{spatial});
 for(const altered of [{...spatial,isWater:()=>true},{...spatial,isLand:()=>false},{...spatial,biomeAt:()=> 'snow'},{...spatial,terrainPaint:{near:(x,z)=>[{type:'stone',position:[x,z],radius:2}]}}])assert.deepEqual(woodlandDetailPlacements(map,{spatial:altered}),[]);
 assert.deepEqual(woodlandDetailPlacements(map,{spatial,ridgeSurface:{sample:()=>({d:3})}}),candidates);
 const p=candidates[0],withHouse={...map,objects:[...objects,{id:'house',kind:'house',variant:'herbal',position:[p.x,p.z],rotation:0,scale:1}]};assert.ok(!woodlandDetailPlacements(withHouse,{spatial}).some(q=>Math.abs(q.x-p.x)<5&&Math.abs(q.z-p.z)<5));
 const scene=new THREE.Scene(),details=createWoodlandDetails(scene,{map,spatial,heightAt:()=>0});assert.ok(details.stats.mushrooms>0&&details.stats.flowers>0);details.update({x:10000,z:10000});assert.ok(scene.children[0].children.every(c=>!c.visible));details.dispose();assert.equal(scene.children.length,0);
});


test('open lawns get sparse flowers, mushrooms and a few small stones without requiring trees',()=>{
 const lawn={objects:[],paths:[],rivers:[],bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60}};
 const a=woodlandDetailPlacements(lawn,{spatial});
 assert.deepEqual(a,woodlandDetailPlacements(lawn,{spatial}));
 const count=kind=>a.filter(p=>p.kind===kind).length;
 assert.ok(count('flower')>30&&count('mushroom')>5&&count('stone')>3);
 assert.ok(count('stone')<count('flower')/4,'stones are occasional accents');
 assert.ok(a.length<300,'most of the 120 × 120 m lawn remains empty');
 assert.deepEqual(lawn.objects,[]);
 const dry={...spatial,biomeAt:()=> 'dunes'};
 assert.deepEqual(woodlandDetailPlacements(lawn,{spatial:dry}),[]);
 assert.deepEqual(woodlandDetailPlacements({...lawn,landscape:{woodlandDetails:false}},{spatial}),[]);
 const scene=new THREE.Scene(),details=createWoodlandDetails(scene,{map:lawn,spatial,heightAt:()=>4});
 let stones=0;scene.traverse(o=>{if(o.name!=='Vereinzelte kleine Kiesel')return;const m=new THREE.Matrix4(),p=new THREE.Vector3(),s=new THREE.Vector3(),q=new THREE.Quaternion();
  stones+=o.count;for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);m.decompose(p,q,s);assert.ok(s.y<.15&&s.x<.35);assert.ok(p.y>4&&p.y<4.1);}
 });assert.equal(stones,count('stone'));details.dispose();
});
