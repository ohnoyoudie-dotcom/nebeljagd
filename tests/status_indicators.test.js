import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createStatusIndicators } from '../src/status-indicators.js';
class Element {
 constructor(){this.children=[];this.dataset={};this.style={};this.hidden=false;}
 append(child){child.parent=this;this.children.push(child);}
 setAttribute(){}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
}
function setup(t,capacity=128){
 const original=globalThis.document;globalThis.document={createElement:()=>new Element()};t.after(()=>{globalThis.document=original;});
 const combat=createCombat(),container=new Element(),root=new THREE.Group();let cover=false,grass=false;
 const local=combat.addTarget({id:'local',local:true,position:new THREE.Vector3(),health:100});
 const enemy=combat.addTarget({id:'enemy',position:new THREE.Vector3(1,0,0),health:100});
 const camera=new THREE.PerspectiveCamera(50,1,.1,100);camera.position.set(0,8,12);camera.lookAt(0,1,0);
 const ui=createStatusIndicators(container,{combat,world:{root,concealmentAt:()=>grass?1:0},isVisible:()=>!cover,capacity});t.after(()=>ui.dispose());
 const update=(phase='playing')=>ui.update(camera,{width:600,height:600,phase});
 const burn=target=>combat.hit(target,{sourceId:'source',burn:{duration:3,damagePerSecond:1}});
 return{combat,local,enemy,ui,container,camera,update,burn,cover:v=>cover=v,grass:v=>grass=v};
}
test('status badges obey cover, concealment, reveal, camera clipping and local visibility',t=>{
 const s=setup(t);s.burn(s.local);s.burn(s.enemy);s.update();assert.deepEqual(s.ui.inspect().visible.map(e=>e.id),['local','enemy']);
 s.cover(true);s.update();assert.deepEqual(s.ui.inspect().visible.map(e=>e.id),['local']);
 s.cover(false);s.grass(true);s.update();assert.deepEqual(s.ui.inspect().visible.map(e=>e.id),['local']);
 s.combat.hit(s.enemy,{sourceId:'source',reveal:1});s.update();assert.deepEqual(s.ui.inspect().visible[1].effects.map(e=>e.id),['burn','revealed']);
 s.enemy.position.set(500,0,0);s.update();assert.deepEqual(s.ui.inspect().visible.map(e=>e.id),['local']);
 s.update('dead');assert.deepEqual(s.ui.inspect().visible,[]);
});
test('pause preserves badges while expiration, reset and removed targets clear them without unbounded rows',t=>{
 const s=setup(t,1);s.burn(s.local);s.burn(s.enemy);s.update();assert.equal(s.ui.inspect().allocated,1);
 const before=s.ui.inspect().visible;s.update('paused');assert.deepEqual(s.ui.inspect().visible,before);
 s.combat.removeTarget('local');s.update();assert.equal(s.ui.inspect().allocated,1);assert.equal(s.ui.inspect().visible[0].id,'enemy');
 s.combat.update(4);s.update();assert.deepEqual(s.ui.inspect().visible,[]);
 s.burn(s.enemy);s.update();s.ui.reset();assert.deepEqual(s.ui.inspect().visible,[]);assert.equal(s.container.children[0].children[0].hidden,true);
 s.ui.dispose();assert.equal(s.container.children.length,0);
});
