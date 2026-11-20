import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';
import {NATURE_KIT_DEFINITIONS,getNatureDefinition} from '../src/map/nature-kit-definitions.js';
import {createNatureModelParts} from '../src/nature-kit.js';import {makeWorldObject,isObjectPlaceable,normalizeWorldmap} from '../src/map/objects.js';
import {validateWorldmap} from '../src/map/model.js';import {removeNonTripoObjects} from '../src/map/tripo-object-cleanup.js';import {renderObjectPlacementPreview} from '../src/map/render.js';
import {createCollisionIndex} from '../src/collision.js';import {advanceZoneExposure} from '../src/zone-exposure.js';import {createZone} from '../src/zone.js';import {createPlayerFootprintRing} from '../src/player-footprint-ring.js';
const map=JSON.parse(fs.readFileSync(new URL('./fixtures/editor-project-worldmap.json',import.meta.url)));
test('all nature objects survive editor JSON/cleanup with their own placement symbols and portable schema',()=>{
 const schema=JSON.parse(fs.readFileSync(new URL('../worldmap.schema.json',import.meta.url)));const rule=schema.$defs.worldObject.allOf.find(x=>x.if?.properties?.kind?.const==='nature');
 const placed={...map,objects:NATURE_KIT_DEFINITIONS.map(d=>makeWorldObject('nature',[30,-42],{variant:d.variant,scale:1.3,rotation:.73,id:d.variant}))};
 for(const o of placed.objects){assert.ok(isObjectPlaceable('nature',o.variant));assert.ok(rule.then.properties.variant.enum.includes(o.variant));assert.match(renderObjectPlacementPreview(o),/data-placement-symbol="nature-/);}
 assert.deepEqual(validateWorldmap(placed).errors,[]);assert.deepEqual(normalizeWorldmap(JSON.parse(JSON.stringify(placed))),placed);assert.deepEqual(removeNonTripoObjects(placed).map.objects,placed.objects);
});
test('every generated nature model has finite metre-scale geometry, vertex paint and bounded draw/triangle cost',()=>{
 for(const d of NATURE_KIT_DEFINITIONS){let triangles=0;const parts=createNatureModelParts(d.variant);assert.ok(parts.length<=2);for(const p of parts){const a=p.geometry.attributes.position;triangles+=a.count/3;assert.ok([...a.array].every(Number.isFinite),d.variant);assert.equal(p.geometry.attributes.color.count,a.count);assert.ok(p.geometry.boundingBox.max.y<=d.height+.12,d.variant);assert.ok(p.geometry.boundingBox.min.x>=-d.footprint.halfWidth-.12,d.variant);assert.ok(p.geometry.boundingBox.max.x<=d.footprint.halfWidth+.12,d.variant);p.geometry.dispose();p.material.dispose();}assert.ok(triangles>100&&triangles<16000,`${d.variant}: ${triangles}`);}
});
test('arch opening admits movement and low shots, while columns and overhead stones stop shots',()=>{
 const d=getNatureDefinition('forest-arch');const shots=createCollisionIndex([],d.walls),movement=createCollisionIndex([],d.walls.filter(w=>!w.projectileOnly));let p={x:0,y:0,z:0};movement.resolve(p,.42);assert.deepEqual(p,{x:0,y:0,z:0});assert.equal(shots.traceSegment({x:0,y:1,z:-2},{x:0,y:1,z:2},.06),null);assert.ok(shots.traceSegment({x:2.1,y:1,z:-2},{x:2.1,y:1,z:2},.06));assert.ok(shots.traceSegment({x:0,y:3.6,z:-2},{x:0,y:3.6,z:2},.06));
});
test('fog damage ramps gently and integrates identically at different frame rates; safe reentry resets it',()=>{
 assert.equal(advanceZoneExposure(0,.6,true,11).damage,0);
 const simulate=dt=>{let exposure=0,damage=0;for(let t=0;t<12-1e-6;t+=dt){const next=advanceZoneExposure(exposure,dt,true,11);exposure=next.exposure;damage+=next.damage;}return damage;};
 assert.ok(Math.abs(simulate(1/30)-simulate(1/120))<1e-8);assert.ok(simulate(1/60)>35&&simulate(1/60)<60);
 assert.equal(advanceZoneExposure(40,1,true,11).damage,5.5);assert.deepEqual(advanceZoneExposure(5,1,false,11),{exposure:0,damage:0});assert.equal(advanceZoneExposure(2,0,true,11).damage,0);
});
test('mist boundary stays on sloped ground, closes small circles and keeps fixed geometry budget',()=>{
 const root=new THREE.Group(),heightAt=(x,z)=>1+x*.08+z*.02;const effect=createZone(root,{center:[10,-5],initialRadius:20,heightAt});const [wall,seam]=root.children[0].children;
 for(const radius of [20,960,35]){effect.update(radius,radius,false,{x:10+radius,z:-5});const pos=wall.geometry.attributes.position;assert.equal(pos.count,258);for(let i=0;i<pos.count;i+=2)assert.ok(Math.abs(pos.getY(i)-heightAt(pos.getX(i),pos.getZ(i))-.04)<1e-4);assert.ok([...seam.geometry.attributes.position.array].every(Number.isFinite));}
 const calls=effect.inspect().builds;effect.update(35.01,35,false,{x:45,z:-5});assert.equal(effect.inspect().builds,calls);assert.equal(wall.material.depthWrite,false);effect.dispose();assert.equal(root.children.length,0);
});
test('player marker follows feet and facing on slopes and hides during arrival/death',()=>{
 const root=new THREE.Group(),ring=createPlayerFootprintRing(root,{heightAt:(x,z)=>2+x*.1});ring.update({x:4,z:7},Math.PI/2,true);assert.equal(ring.inspect().direction,Math.PI/2);assert.equal(root.children[0].position.x,4);assert.ok(Math.abs(root.children[0].position.y-2.52)<1e-8);assert.equal(ring.inspect().radius,.603);ring.update({x:4,z:7},0,false);assert.equal(root.children[0].visible,false);ring.dispose();assert.equal(root.children.length,0);
});
