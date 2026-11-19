import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { createAerialLandscape } from '../src/aerial-landscape.js';

test('far scenery uses original geometry and textures, restores culled sectors and preserves intentional cutaways',()=>{
 const root=new Group(),sector=new Group();sector.name='Objekte · Sektor 5,6';sector.visible=false;root.add(sector);
 const mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial());sector.add(mesh);
 const roof=mesh.clone();roof.name='Dach entfernt';roof.visible=false;sector.add(roof);
 const grass=new Group();grass.name='Magebrawl · dichte animierte Wiese';root.add(grass);
 const far=createAerialLandscape({root});far.update(1600);
 const copy=root.children.at(-1);assert(copy.visible);assert.equal(copy.children.length,1);assert(copy.children[0].visible);
 const detail=copy.children[0].children[0];assert.equal(detail.geometry,mesh.geometry);assert.notEqual(detail.material,mesh.material);
 assert.equal(detail.layers.mask,2);assert(detail.userData.ignoreVision);assert(detail.material.userData.ignoreVision);
 assert(detail.material.depthWrite);assert(!copy.children[0].children[1].visible);assert(!sector.visible);
 far.update(100);assert(detail.material.opacity>0&&detail.material.opacity<1);assert.equal(mesh.material.opacity,1);
 far.update(0);assert(!copy.visible);assert.equal(far.inspect().bitmapAtlas,false);
 let released=false;mesh.geometry.addEventListener('dispose',()=>released=true);far.dispose();assert(!released);assert.equal(root.children.length,2);
});

test('terrain batches preserve the original coastline vertices while reducing distant draw calls',()=>{
 const root=new Group(),material=new MeshStandardMaterial();
 for(let i=0;i<3;i++){const mesh=new Mesh(new BoxGeometry(),material);mesh.name=`Geländeabschnitt ${i}`;mesh.visible=false;root.add(mesh);}
 const originals=[...root.children],count=originals.reduce((n,m)=>n+m.geometry.attributes.position.count,0);
 const far=createAerialLandscape({root,map:{terrainPaint:[]}});far.update(1600);
 const terrain=root.children.at(-1).children[0];assert.equal(far.inspect().meshes,1);assert.equal(terrain.geometry.attributes.position.count,count);
 assert(originals.every(m=>!m.visible&&m.material===material));assert(terrain.material.depthWrite);
 let disposed=false;terrain.geometry.addEventListener('dispose',()=>disposed=true);far.dispose();assert(disposed);
});

test('wide aerial views have enough ocean coverage without changing the playable sea',()=>{
 const root=new Group(),sea=new Mesh(new BoxGeometry(),new MeshStandardMaterial());sea.name='Meer um die Nebelinsel';root.add(sea);
 const far=createAerialLandscape({root});far.update(1600);const distantSea=root.children.at(-1).children[0];assert.equal(distantSea.scale.x,4);assert.equal(sea.scale.x,1);assert.equal(distantSea.geometry,sea.geometry);far.dispose();
});

test('selection scenery contains real buildings but hides loot without modifying the playable world',()=>{
 const root=new Group(),sector=new Group();sector.name='Objekte · Sektor 0';sector.visible=false;root.add(sector);
 const house=new Mesh(new BoxGeometry(),new MeshStandardMaterial());house.name='Waldhaus · house1';sector.add(house);
 const chest=house.clone();chest.name='Truhe · loot1';chest.userData.mapObjectId='loot1';sector.add(chest);
 const barrels=house.clone();barrels.name='barrel:oak · 0';sector.add(barrels);
 const far=createAerialLandscape({root,map:{objects:[{id:'house1',kind:'house'},{id:'loot1',kind:'chest'}]}},{attach:false,sceneryOnly:true});
 far.update(200);assert.equal(root.children.length,1);const copy=far.group.children[0];
 assert(copy.visible&&copy.children[0].visible);assert(!copy.children[1].visible&&!copy.children[2].visible);
 assert(chest.visible&&barrels.visible);assert(!sector.visible);far.dispose();
});

test('static selection scenery draws opaque terrain before transparent roads',()=>{
 const root=new Group(),ground=new Mesh(new BoxGeometry(),new MeshStandardMaterial());ground.name='Geländeabschnitt 0';root.add(ground);
 const road=new Mesh(new BoxGeometry(),new MeshStandardMaterial({transparent:true,depthWrite:false}));road.name='Wegenetz · räumlicher Abschnitt';root.add(road);
 const far=createAerialLandscape({root,map:{objects:[]}},{attach:false,sceneryOnly:true});far.update(200);
 assert.equal(far.group.children[0].material.transparent,false);assert.equal(far.group.children[1].material.transparent,true);
 assert.equal(far.group.children[1].material.depthWrite,false);far.dispose();
});
