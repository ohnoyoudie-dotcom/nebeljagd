import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons, DEFAULT_WEAPON_VARIANTS } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { weaponStats } from '../src/loot-tiers.js';

const kinds = { poisonStaff: 'kit-tripo-poison-staff', moonStaff: 'kit-tripo-moon-staff', bow: 'kit-tripo-ornate-bow' };
function prototypes() {
  return Object.fromEntries(Object.entries(kinds).map(([type, variant]) => {
    const prototype = new THREE.Group(); prototype.name = variant;
    const body = new THREE.BoxGeometry(.07, type === 'bow' ? 1.35 : 1.7, .05);
    if (type === 'bow') body.translate(-.08, 0, 0); else body.translate(0, .5, 0);
    prototype.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({color: '#48683d'})));
    if (type === 'bow') {
      const string = new THREE.BufferGeometry();
      string.setAttribute('position', new THREE.Float32BufferAttribute([
        .148,-.65,0, .152,-.65,0, .148,0,0, .152,0,0, .148,.65,0, .152,.65,0,
      ], 3));
      string.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]);
      prototype.add(new THREE.Mesh(string, new THREE.MeshStandardMaterial({color:'#d6d9cc'})));
      prototype.userData.bowRig = {stringLower:[.15,-.65,0],stringUpper:[.15,.65,0],stringRadiusMetres:.005,drawDistanceMetres:.28};
    }
    return [variant, prototype];
  }));
}
function setup(placements, options = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const combat = options.combat ?? createCombat();
  const hands = {left:new THREE.Vector3(.1,1.3,.4),right:new THREE.Vector3(-.24,1.22,.46)};
  const character = {setCombatState(){},getHandPosition:(side,target)=>target.copy(hands[side]),getGripPosition:(side,target)=>target.copy(hands[side])};
  const tripoPrototypes = options.tripoPrototypes ?? prototypes();
  const weapons = createWeapons(scene,actor,{heightAt:()=>0,traceProjectile:()=>null},character,{placements,combat,tripoPrototypes,...options});
  return {scene,actor,combat,hands,tripoPrototypes,weapons};
}
const placed = (type, position=[0,0]) => ({id:type,kind:type,variant:kinds[type],position,rarity:'rare'});
function tick(weapons, duration, step=.04) {for(let time=0;time<duration;time+=step)weapons.update(step,time);}

test('new staffs require their imported prototypes even for ungraded chest-style drops', () => {
  const {weapons}=setup([],{tripoPrototypes:{}});
  for(const type of ['poisonStaff','moonStaff']) {
    assert.equal(DEFAULT_WEAPON_VARIANTS[type],kinds[type]);
    assert.throws(()=>weapons.addDrop({type,position:[0,0]}),/muss vor dem Platzieren geladen/);
  }
  weapons.dispose();
});

test('all three new models remain the same pickups through automatic pickup, swaps and reset', () => {
  const {actor,weapons}=setup(Object.keys(kinds).map((type,i)=>placed(type,[i*4,0])));
  assert.equal(weapons.tryAutoPickup(actor.position).variant,kinds.poisonStaff);
  for(const [i,type] of Object.keys(kinds).entries()) {
    actor.position.x=i*4;
    if(i) assert.equal(weapons.interact(actor.position).variant,kinds[type]);
    assert.equal(weapons.equippedItem.type,type);
    assert.equal(weapons.telemetry.heldModel.model,'tripo');
    assert.equal(weapons.telemetry.heldModel.variant,kinds[type]);
    assert.equal(weapons.telemetry.heldGrip.error,0);
  }
  assert.equal(weapons.items.filter(item=>item.collected).length,1);
  weapons.reset();
  assert.equal(weapons.equipped,null);
  assert.equal(weapons.items.length,3);
  assert.ok(weapons.items.every(item=>!item.collected));
  weapons.dispose();
});

test('Giftstab applies independent poison while Mondstab deals direct magical damage without slow or burn', () => {
  for(const type of ['poisonStaff','moonStaff']) {
    const combat=createCombat();
    const target=combat.addTarget({id:'victim',position:{x:0,y:0,z:4},radius:.7,maxHealth:500});
    const {actor,weapons}=setup([placed(type)],{combat});
    weapons.tryAutoPickup(actor.position);weapons.attack(actor.position,0);tick(weapons,1);
    const stats=weaponStats(type,'rare');
    assert.equal(target.health,500-stats.damage);
    assert.equal(weapons.telemetry.damageHits,1);
    assert.equal(target.burnRemaining,0);assert.equal(target.slowRemaining,0);
    assert.equal(weapons.telemetry.effects.emitted[type].launches,1);
    if(type==='poisonStaff') {
      assert.equal(target.poisonRemaining,3);
      combat.update(4);
      assert.equal(target.health,500-stats.damage-3*stats.poison.damagePerSecond);
    }else assert.equal(target.poisonRemaining,0);
    weapons.dispose();
  }
});

test('ornate bow animates its actual baked string only on the held clone and releases a damaging arrow', () => {
  const combat=createCombat(), target=combat.addTarget({id:'victim',position:{x:0,y:0,z:4},radius:.7,maxHealth:500});
  const {actor,weapons,tripoPrototypes}=setup([placed('bow')],{combat});
  const prototypeString=tripoPrototypes[kinds.bow].children[1].geometry;
  const source=Array.from(prototypeString.attributes.position.array);
  weapons.tryAutoPickup(actor.position);
  const held=actor.children.find(child=>child.userData.weaponType==='bow');
  assert.equal(held.scale.x,1,'metric imported bow is not scaled as the old procedural bow');
  const stringMesh=held.children[0].children[0].children[1];
  assert.notEqual(stringMesh.geometry,prototypeString);
  assert.ok(weapons.telemetry.heldModel.stringVertices>0);
  let addedLines=0;held.traverse(part=>{if(part.isLine)addedLines++;});assert.equal(addedLines,0,'no duplicate rope overlays the uploaded string');
  weapons.attack(actor.position,0);weapons.update(.12,.12);
  assert.ok(stringMesh.geometry.attributes.position.getX(2)>.20,'middle of the original string is drawn back');
  assert.equal(stringMesh.geometry.attributes.position.getX(0),prototypeString.attributes.position.getX(0),'limb endpoint remains fixed');
  assert.deepEqual(Array.from(prototypeString.attributes.position.array),source,'template and ground pickup keep their original positions');
  tick(weapons,1);
  assert.equal(weapons.telemetry.shotsFired,1);
  assert.equal(target.health,500-weaponStats('bow','rare').damage);
  assert.equal(weapons.telemetry.heldGrip.side,'left');
  assert.equal(weapons.telemetry.heldGrip.error,0);
  let sharedDisposed=0;prototypeString.addEventListener('dispose',()=>sharedDisposed++);
  weapons.dispose();assert.equal(sharedDisposed,0,'disposing a drawn copy cannot destroy the immutable model');
});

test('ornate bow uses its variant label in pickup data, equipped HUD data and pickup message without changing legacy or authored names', () => {
  const {actor,weapons}=setup([
    {...placed('bow'),name:'Bogen'},
    {...placed('bow',[4,0]),id:'named-bow',name:'Majas Jagdbogen'},
    {id:'old-bow',kind:'bow',variant:'wood',position:[8,0],rarity:'rare'},
  ]);
  assert.equal(weapons.nearest(actor.position).label,'Verzierter Bogen');
  const pickup=weapons.tryAutoPickup(actor.position);
  assert.equal(pickup.label,'Verzierter Bogen');
  assert.equal(pickup.name,'Verzierter Bogen · Selten');
  assert.match(pickup.message,/Verzierter Bogen · Selten aufgenommen/);
  assert.equal(weapons.equippedItem.label,'Verzierter Bogen');
  assert.equal(weapons.equippedItem.damage,weaponStats('bow','rare').damage);
  actor.position.x=4;
  assert.equal(weapons.nearest(actor.position).label,'Majas Jagdbogen');
  assert.match(weapons.interact(actor.position).message,/Majas Jagdbogen · Selten aufgenommen/);
  assert.equal(weapons.equippedItem.label,'Majas Jagdbogen');
  actor.position.x=8;
  assert.equal(weapons.interact(actor.position).label,'Holzbogen');
  assert.equal(weapons.equippedItem.name,'Holzbogen · Selten');
  assert.equal(weaponStats('bow','rare','kit-tripo-ornate-bow').label,'Verzierter Bogen');
  assert.equal(weaponStats('bow','rare','wood').label,'Holzbogen');
  weapons.dispose();
});

test('an asymmetrical staff head launches from its measured moved tip at target height', () => {
  const templates=prototypes();
  const tip=[.13,1.2,.08];templates[kinds.moonStaff].userData.weaponTipPoint=tip;
  const {actor,weapons,scene}=setup([placed('moonStaff')],{tripoPrototypes:templates});
  actor.scale.setScalar(1.2);actor.rotation.y=.7;
  weapons.tryAutoPickup(actor.position);weapons.attack(actor.position,.7);
  for(let i=0;i<3;i++)weapons.update(.1,i*.1);
  const held=actor.children.find(child=>child.userData.weaponType==='moonStaff');
  const actual=held.localToWorld(new THREE.Vector3(...tip));scene.worldToLocal(actual);
  const launch=weapons.telemetry.lastSpellLaunch;
  assert.ok(actual.distanceTo(new THREE.Vector3(launch.tip.x,launch.tip.y,launch.tip.z))<1e-7);
  assert.ok(Math.abs(launch.flightHeight-1.4)<1e-7,'offset Moonhead preserves the same chest-height aim as axial staffs');
  weapons.dispose();
});
