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
