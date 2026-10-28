import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ENVIRONMENT_KIT_DEFINITIONS,getEnvironmentKitDefinition} from '../src/map/environment-kit-definitions.js';
import {createCollisionIndex} from '../src/collision.js';
import {buildKitGrassPatch,MAX_KIT_GRASS_INSTANCES} from '../src/vegetation-patches.js';
import {TAVERN_DRESSING,shouldOmitTavernDetail} from '../src/map/tavern-dressing.js';

test('the environment kit keeps its published sources and the user tavern remains a separate GLB asset',async()=>{
 const root=new URL('../Blender/nebeljagd_umwelt_kit_v1/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 assert.match(manifest.license,/CC0-1\.0/);assert.equal(ENVIRONMENT_KIT_DEFINITIONS.length,13);
 for(const item of manifest.assets){
  const bytes=await readFile(new URL(item.file,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.file);
  const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  assert.equal(gltf.asset.version,'2.0');assert.ok((gltf.buffers??[]).every(buffer=>!buffer.uri));assert.equal(gltf.images?.length??0,0);
  const triangles=gltf.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),0);
  assert.equal(triangles,item.triangles,item.file);
  const definition=ENVIRONMENT_KIT_DEFINITIONS.find(d=>d.asset===item.name);assert.ok(definition);
  const transformedHeight=(definition.nativeBounds.max[1]-definition.nativeBounds.min[1])*definition.normalization.scale;
  assert.ok(Math.abs(transformedHeight-definition.targetHeight)<1e-8,item.file);
 }
 const tavern=getEnvironmentKitDefinition('house','kit-taverne');
 assert.equal(tavern.asset,'taverne');assert.equal(tavern.roofless,true);assert.equal(tavern.height,4.8);assert.equal(tavern.targetHeight,4.065);
 assert.equal(tavern.normalization.scale,1);assert.equal(tavern.normalization.offset[1],0);
 assert.ok(tavern.walls.length>=10);assert.ok(tavern.interior.halfWidth>10);
});

test('kit arch and opened house retain traversable centers, but their sides and rotated module boxes stop players',()=>{
 const arch=getEnvironmentKitDefinition('ruin','kit-arch'),house=getEnvironmentKitDefinition('house','kit-timber');
 const archIndex=createCollisionIndex([],arch.walls),houseIndex=createCollisionIndex([],house.walls);
 const archX=-arch.normalization.offset[0]*arch.normalization.scale;
 assert.equal(archIndex.traceSegment({x:archX,y:1,z:-4},{x:archX,y:1,z:4},.1),null);
 assert.ok(archIndex.traceSegment({x:arch.walls[0].minX+.3,y:1,z:-4},{x:arch.walls[0].minX+.3,y:1,z:4},.1));
 assert.equal(houseIndex.traceSegment({x:house.interior.centerX,y:1,z:house.floorBounds.maxZ+2},{x:house.interior.centerX,y:1,z:house.interior.centerZ},.1),null);
 assert.ok(houseIndex.traceSegment({x:-5,y:1,z:house.interior.centerZ},{x:0,y:1,z:house.interior.centerZ},.1));
 const table=house.walls.find(w=>w.type==='furniture');assert.ok(table);
 assert.ok(houseIndex.traceSegment({x:table.minX-1,y:.5,z:(table.minZ+table.maxZ)/2},{x:table.maxX+1,y:.5,z:(table.minZ+table.maxZ)/2},.05));
 for(const [kind,variant]of[['wall','kit-stone'],['fence','kit-wood'],['crate','kit-wood']]){
  const def=getEnvironmentKitDefinition(kind,variant),index=createCollisionIndex([],def.walls),yaw=Math.PI*.37,scale=1.7;
  const toWorld=p=>({x:10+scale*(Math.cos(yaw)*p.x+Math.sin(yaw)*p.z),z:4+scale*(-Math.sin(yaw)*p.x+Math.cos(yaw)*p.z)});
  const toLocal=p=>({x:(Math.cos(yaw)*(p.x-10)-Math.sin(yaw)*(p.z-4))/scale,z:(Math.sin(yaw)*(p.x-10)+Math.cos(yaw)*(p.z-4))/scale});
  const point=toLocal(toWorld({x:0,z:0}));index.resolve(point,.42/scale);
  assert.ok(!def.walls.some(w=>point.x>w.minX&&point.x<w.maxX&&point.z>w.minZ&&point.z<w.maxZ),kind);
 }
});

test('the open-roof tavern keeps its front doorway and room entrances passable while stopping movement at walls',()=>{
 const tavern=getEnvironmentKitDefinition('house','kit-taverne'),index=createCollisionIndex([],tavern.walls);
 assert.equal(index.traceSegment({x:-1.5,y:.9,z:10},{x:-1.5,y:.9,z:7},.08),null,'the double main doorway stays open');
 assert.ok(index.traceSegment({x:5,y:.9,z:10},{x:5,y:.9,z:7},.08),'the remaining front wall blocks movement');
 assert.equal(index.traceSegment({x:0,y:.9,z:0},{x:6,y:.9,z:0},.08),null,'the central room doorway stays open');
 assert.ok(index.traceSegment({x:0,y:.9,z:3},{x:6,y:.9,z:3},.08),'room partitions block movement');
 assert.equal(index.traceSegment({x:-1.5,y:4.2,z:10},{x:-1.5,y:4.2,z:7},.08),null,'the very tall entrance stays open');
 assert.ok(index.traceSegment({x:5,y:4.2,z:10},{x:5,y:4.2,z:7},.08),'the 4.8 m facade stays solid');
 assert.equal(index.traceSegment({x:0,y:3.3,z:0},{x:6,y:3.3,z:0},.08),null,'the raised room doorway remains traversable');
 assert.ok(index.traceSegment({x:0,y:3.3,z:3},{x:6,y:3.3,z:3},.08),'3.8 m partitions block movement and shots');
 assert.equal(tavern.walls[0].maxY,4.8);assert.equal(tavern.walls[1].maxY,4.8);assert.equal(tavern.walls[5].maxY,3.8);
 assert.equal(tavern.roofless,true);
});

test('the tavern keeps its landmarks while selective dressing opens sightlines and floor space',()=>{
 assert.equal(TAVERN_DRESSING.omittedRoots.length,32);
 assert.ok(shouldOmitTavernDetail('Stool seat',['Round stool_026']));
 assert.ok(shouldOmitTavernDetail('Vintage bottle glass',['Vintage bottle_013']));
 assert.ok(shouldOmitTavernDetail('Barrel stave',['Oak ale barrel_004']));
 assert.ok(shouldOmitTavernDetail('Table top',['Trestle table_002']));
 assert.ok(shouldOmitTavernDetail('Bench seat',['Trestle bench_003']));
 assert.ok(shouldOmitTavernDetail('Ale tankard glass',['Ale tankard_006']));
 assert.ok(shouldOmitTavernDetail('Spielbrett_Feld.004'));
 assert.ok(shouldOmitTavernDetail('Ale tankard glass',['Ale tankard_029.001']));
 assert.ok(shouldOmitTavernDetail('Lit candle wick',['Lit candle_030']));
 assert.ok(!shouldOmitTavernDetail('Stool seat',['Round stool_001']));
 assert.ok(!shouldOmitTavernDetail('Vintage bottle glass',['Vintage bottle_012']));
 assert.ok(!shouldOmitTavernDetail('Curved barrel stave',['Oak ale barrel_001']));
 assert.ok(!shouldOmitTavernDetail('Runder_Tisch_Brettplatte'));
});

test('authored grass uses a bounded number of complete clusters and keeps height independent of its footprint',()=>{
 const definition=getEnvironmentKitDefinition('grass','kit-tall');
 const object={id:'kit-test',kind:'grass',variant:'kit-tall',position:[0,0],radius:3.5,scale:1,rotation:.4};
 const ordinary=buildKitGrassPatch(object,definition);assert.equal(ordinary.patch.instanceCount,11);assert.equal(ordinary.patch.maxBladeHeight,1.95);
 assert.equal(ordinary.patch.modelTrianglesPerInstance,1248);assert.ok(ordinary.patch.instanceCount*1248<15000);
 const huge=buildKitGrassPatch({...object,radius:20},definition);assert.equal(huge.patch.instanceCount,80);
 const none=buildKitGrassPatch({...object,vegetation:{density:0}},definition);assert.equal(none.patch.instanceCount,0);
 const tall=buildKitGrassPatch({...object,vegetation:{height:3,heightVariation:0}},definition);
 const short=buildKitGrassPatch({...object,vegetation:{height:.25,heightVariation:0}},definition);
 assert.deepEqual(tall.instances.map(i=>[i.position,i.scale[0],i.scale[2]]),short.instances.map(i=>[i.position,i.scale[0],i.scale[2]]));
 assert.ok(Math.abs(tall.patch.maxBladeHeight/short.patch.maxBladeHeight-12)<1e-10);
 assert.equal(buildKitGrassPatch(object,definition,{budget:19}).patch.instanceCount,1);
 assert.equal(MAX_KIT_GRASS_INSTANCES,12000);
});
