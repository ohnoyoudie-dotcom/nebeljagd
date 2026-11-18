import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createRunicCharge,stepRunicCharge,rollRunicRarity} from '../src/runic-chest.js';
import {createChests} from '../src/chests.js';
import {makeWorldObject,normalizeWorldmap} from '../src/map/objects.js';
import {createLobbyMap} from '../src/lobby-map.js';import {validateWorldmap} from '../src/map/model.js';
const placement={id:'rune-chest',name:'Runentruhe',kind:'chest',variant:'wood',chestOpening:'rune',position:[0,0],scale:1,rotation:0};
const player={x:0,y:0,z:2},world={heightAt:()=>0,isLand:()=>true,isWater:()=>false,traceProjectile:()=>null};
const make=(options={})=>createChests(new THREE.Group(),{placements:[placement],heightAt:()=>0,world,rollRareRarity:()=> 'epic',...options});
function advance(c,seconds,p=player,options={}){for(let t=0;t<seconds-1e-8;t+=.05)c.update(Math.min(.05,seconds-t),t,p,options);}
test('Runic opening accelerates consistently across frame rates and requires continuous presence for speed',()=>{
 const state=createRunicCharge();stepRunicCharge(state,1,true);const first=state.progress;stepRunicCharge(state,1,true);assert.ok(state.progress-first>first);
 const a=createRunicCharge(),b=createRunicCharge();stepRunicCharge(a,4.5,true);for(let i=0;i<270;i++)stepRunicCharge(b,1/60,true);assert.ok(Math.abs(a.progress-b.progress)<1e-10);
 const saved=a.progress;stepRunicCharge(a,1,false);assert.equal(a.progress,saved);assert.equal(a.streak,0);stepRunicCharge(a,1,false);assert.ok(Math.abs(a.progress-(saved-.75*.09))<1e-10);
 const paused={...a};stepRunicCharge(a,0,true);assert.deepEqual(a,paused);
 stepRunicCharge(a,100,false);assert.equal(a.progress,0);
});
test('Runic chest cannot be bypassed with interact, releases premium loot once after the reveal and resets',()=>{
 const drops=[],c=make({onDrop:d=>drops.push(d)});try{
 assert.equal(c.interact(player).type,'chest');assert.equal(c.items[0].opened,false);
 advance(c,5.8);assert.equal(c.items[0].opened,false);advance(c,.2);assert.equal(c.items[0].opened,true);assert.equal(drops.length,0);
 advance(c,.8);assert.equal(drops.length,3);assert.equal(drops.find(d=>d.kind!=='gold').rarity,'epic');assert.ok(c.items[0].lid.rotation.x< -1.7);
 advance(c,10);assert.equal(drops.length,3);c.reset();assert.equal(c.items[0].charge.progress,0);assert.equal(c.items[0].lid.rotation.x,0);assert.equal(c.items[0].opened,false);
 }finally{c.dispose();}
});
test('Walls, fog, vertical separation, pause and disabled charge prevent remote rune unlocking',()=>{
 for(const options of [{world:{...world,traceProjectile:()=>({})}},{isVisible:()=>false}]){const c=make(options);advance(c,10);assert.equal(c.items[0].charge.progress,0);c.dispose();}
 const c=make();advance(c,10,{...player,y:4});assert.equal(c.items[0].charge.progress,0);advance(c,10,player,{canCharge:false});assert.equal(c.items[0].charge.progress,0);
 advance(c,1);const progress=c.items[0].charge.progress;c.update(0,300,player);assert.equal(c.items[0].charge.progress,progress);c.dispose();
});
test('Leaving keeps a brief grace period; overlapping circles charge only the nearest chest',()=>{
 const c=make({placements:[placement,{...placement,id:'second',position:[1,0]}]});advance(c,1);assert.ok(c.items[0].charge.progress>0);assert.equal(c.items[1].charge.progress,0);
 const p=c.items[0].charge.progress;advance(c,1,{x:20,y:0,z:20});assert.equal(c.items[0].charge.progress,p);advance(c,2,{x:20,y:0,z:20});assert.equal(c.items[0].charge.progress,0);c.dispose();
});
test('Rare roll has bounded tiers and chest behaviour survives duplication/JSON without changing normal chests',()=>{
 assert.equal(rollRunicRarity(()=>0),'rare');assert.equal(rollRunicRarity(()=>.65),'epic');assert.equal(rollRunicRarity(()=>.95),'legendary');
 const map=createLobbyMap();map.objects=[makeWorldObject('chest',[0,0],placement)];assert.deepEqual(validateWorldmap(map).errors,[]);assert.deepEqual(normalizeWorldmap(JSON.parse(JSON.stringify(map))),map);
 const copy=makeWorldObject('chest',[5,0],{...map.objects[0],id:'copy'});assert.equal(copy.chestOpening,'rune');assert.equal(makeWorldObject('chest',[0,0]).chestOpening,undefined);
 map.objects[0].chestOpening='bad';assert.ok(validateWorldmap(map).errors.length);
});
test('Rune effects freeze with pause, obey visibility and release their owned GPU resources',()=>{
 const scene=new THREE.Group(),c=make({});let calls=0;const fx=c.items[0].effects;scene.add(fx.group);const resources=new Set();fx.group.traverse(n=>{if(n.geometry&&!n.isSprite)resources.add(n.geometry);if(n.material)resources.add(n.material);});for(const r of resources)r.addEventListener('dispose',()=>calls++);
 advance(c,1);const p=fx.group.children.at(-1).geometry.attributes.position.array.slice();c.update(0,500,player);assert.deepEqual(fx.group.children.at(-1).geometry.attributes.position.array,p);
 c.update(0,0,player,{visible:()=>false});assert.equal(fx.group.visible,false);c.dispose();assert.equal(scene.children.length,0);assert.equal(calls,resources.size);
});
