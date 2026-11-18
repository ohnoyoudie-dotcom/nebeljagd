import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,MeshStandardMaterial,Texture,Raycaster,Vector3,Matrix4} from 'three';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {createCastleModel} from '../src/castle-model.js';
import {createCastleSurface} from '../src/castle-materials.js';

const definition=getHouseDefinition('schlossanlage');
const create=options=>createCastleModel({definition,...options});

test('Expanded castle keeps metre-sized all-stone architecture within bounded instanced geometry',()=>{
  const model=create();
  try {
    const bounds=new Box3();
    for(const child of model.group.children)if(!child.userData.castleTorches)bounds.union(new Box3().setFromObject(child));
    assert.ok(bounds.min.x>=-70.5&&bounds.max.x<=70.5);
    assert.ok(bounds.min.z>=-61&&bounds.max.z<=61);
    assert.ok(bounds.max.y<=definition.height+.12);
    assert.equal(model.roof.visible,false);assert.equal(model.frontFacade.children.length,0);
    assert.equal(model.stats.rooms,definition.rooms.length);assert.equal(model.stats.entrances,definition.entrances.length);
    assert.ok(bounds.max.y>=12,'The exterior has a genuinely tall tower silhouette');
    assert.ok(model.stats.drawCalls<=38);assert.ok(model.stats.staticTriangles<670000);
    assert.equal(model.stats.triangles,model.stats.staticTriangles+model.stats.torches.triangles+model.stats.courtyards.triangles);
    assert.equal(model.stats.fortifications.towers,4);assert.equal(model.stats.fortifications.banners,4);
    assert.equal(model.stats.windows,definition.windows.length);
    const unique=new Set();
    model.group.traverse(node=>{
      if(!node.isMesh)return;unique.add(node.geometry);
      assert.doesNotMatch(node.material.name,/Holz|wood|Kalkputz|plaster|glass|Glas/i,'architecture contains no timber, plaster or glazing');
      for(const v of node.geometry.attributes.position.array)assert.ok(Number.isFinite(v));
      if(node.isInstancedMesh)for(const v of node.instanceMatrix.array)assert.ok(Number.isFinite(v));
    });
    assert.ok(unique.size<=16,'masonry, terrace caps and all seventeen arch stones share instanced shapes');
  }finally{model.dispose();}
});

test('Both courtyard loops and all castle doors stay visually open at movement/projectile height',()=>{
  const model=create();model.group.updateMatrixWorld(true);
  try {
    const routes=[...definition.qaRoutes.entrances,...definition.qaRoutes.courtyardEntrances,...definition.qaRoutes.rooms];
    for(const route of routes)for(const height of [.3,1.6,2.7])for(const offset of [-.65,0,.65]) {
      const alongX=route.from[0]!==route.to[0];
      const from=new Vector3(route.from[0]+(alongX?0:offset),definition.floorHeight+height,route.from[1]+(alongX?offset:0));
      const to=new Vector3(route.to[0]+(alongX?0:offset),from.y,route.to[1]+(alongX?offset:0));
      const delta=to.clone().sub(from);
      assert.equal(new Raycaster(from,delta.clone().normalize(),.001,delta.length()).intersectObject(model.group,true).length,0,`${route.name}: ${height}m, ${offset}m`);
    }
    for(const door of definition.interiorDoorways) {
      const lower=model.group.children.filter(node=>!node.userData.castleFortifications);
      assert.equal(new Raycaster(new Vector3(door.x,7,door.z),new Vector3(0,-1,0),0,7-definition.floorHeight-.025).intersectObjects(lower,true).length,0,'indoor cutaway doorways have no hidden overhead lintel');
    }
  }finally{model.dispose();}
});

test('Both courts have open centres and narrow stone borders while rooms retain their stone floor height',()=>{
  const model=create();model.group.updateMatrixWorld(true);
  try {
    for(const court of definition.courtyardPavingAreas) {
      const cx=(court.minX+court.maxX)/2,cz=(court.minZ+court.maxZ)/2,matrix=new Matrix4();let groutTop=null;
      model.group.traverse(mesh=>{if(!mesh.isInstancedMesh||!mesh.material.name.includes('Steinmörtel'))return;
        for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const e=matrix.elements;
          if(Math.abs(e[12]-cx)<.001&&Math.abs(e[14]-cz)<.001&&Math.abs(e[0]-(court.maxX-court.minX))<.001&&Math.abs(e[10]-(court.maxZ-court.minZ))<.001)groutTop=e[13]+e[5]/2;}
      });
      assert.ok(groutTop>=.003&&groutTop<=.008,'continuous mineral grout covers every narrow border joint');
    }
    for(const court of definition.courtyards)for(const [dx,dz]of [[0,0],[-4,-5],[4,5]]) {
      const x=(court.minX+court.maxX)/2+dx,z=(court.minZ+court.maxZ)/2+dz;
      const hits=new Raycaster(new Vector3(x,6,z),new Vector3(0,-1,0),0,8).intersectObject(model.group,true);
      assert.equal(hits.length,0,'the courtyard is a real opening onto map terrain');
    }
    for(const room of definition.rooms) {
      const origin=new Vector3((room.minX+room.maxX)/2,1,(room.minZ+room.maxZ)/2);
      const hits=new Raycaster(origin,new Vector3(0,-1,0),0,2).intersectObject(model.group,true);
      assert.ok(hits.length,room.name);
      assert.ok(hits[0].point.y<=definition.floorHeight+.006&&hits[0].point.y>=definition.floorHeight-.05,`${room.name} floor and recessed grout follow movement height`);
    }
  }finally{model.dispose();}
});

test('Unglazed windows are genuine empty apertures between visible forged iron bars',()=>{
  const model=create();model.group.updateMatrixWorld(true);
  try {
    for(const window of definition.windows) {
      const horizontal=['north','south'].includes(window.side),inward=['north','west'].includes(window.side)?1:-1;
      const direction=new Vector3(horizontal?0:-inward,0,horizontal?-inward:0);
      for(const offset of [-window.width*.16,window.width*.16]) {
        const origin=new Vector3(horizontal?window.center+offset:window.boundary+inward*1.2,definition.floorHeight+window.sillHeight+window.height*.5,horizontal?window.boundary+inward*1.2:window.center+offset);
        const hits=new Raycaster(origin,direction,.001,2.25).intersectObject(model.group,true);
        assert.equal(hits.length,0,window.name+': air between grille bars, no glass or opaque wall backing');
      }
      const origin=new Vector3(horizontal?window.center:window.boundary+inward*1.2,definition.floorHeight+window.sillHeight+window.height*.5,horizontal?window.boundary+inward*1.2:window.center);
      const hits=new Raycaster(origin,direction,.001,2.25).intersectObject(model.group,true);
      assert.ok(hits.length,window.name);assert.match(hits[0].object.material.name,/Fenstergitter/,window.name);
    }
  }finally{model.dispose();}
});

test('Rough masonry and smooth worn paving use distinct deterministic texture detail',()=>{
  const wall=createCastleSurface('wall'),floor=createCastleSurface('floor'),repeat=createCastleSurface('wall');
  try {
    assert.notDeepEqual(wall.map.image.data,floor.map.image.data);
    assert.notDeepEqual(wall.bumpMap.image.data,floor.bumpMap.image.data);
    assert.deepEqual(wall.map.image.data,repeat.map.image.data);
    assert.notEqual(wall.map,repeat.map,'models own texture instances without shared disposal');
    assert.equal(wall.map.userData.castleSurface,'wall');assert.equal(floor.map.userData.castleSurface,'floor');
  }finally{for(const maps of [wall,floor,repeat])Object.values(maps).forEach(texture=>texture.dispose());}
});

function appearanceSignature(model) {
  const result=[];
  model.group.traverse(mesh=>{if(mesh.isInstancedMesh&&mesh.instanceColor)result.push(mesh.material.name,...mesh.instanceColor.array.slice(0,36),...mesh.instanceMatrix.array.slice(0,32));});
  return result;
}
test('Castle seeds and independent floor/wall mineral controls visibly change saved stone without changing geometry plan',()=>{
  const models=[create({houseSeed:543}),create({houseSeed:543}),create({houseSeed:981}),create({houseSeed:543,houseStoneColor:'slate'}),create({houseSeed:543,houseWallColor:'clay'})];
  try {
    assert.deepEqual(appearanceSignature(models[0]),appearanceSignature(models[1]));
    for(const model of models.slice(2))assert.notDeepEqual(appearanceSignature(models[0]),appearanceSignature(model));
  }finally{models.forEach(model=>model.dispose());}
});

test('Castle disposal frees static and animated owned resources exactly once and preserves borrowed assets',()=>{
  const map=new Texture(),normalMap=new Texture(),source=new MeshStandardMaterial({map,normalMap});
  const borrowed=[source,map,normalMap],released=new Set();borrowed.forEach(resource=>resource.addEventListener('dispose',()=>released.add(resource)));
  const model=create({stoneMaterial:source}),owned=new Set(),instances=[];
  model.group.traverse(mesh=>{if(mesh.isMesh){owned.add(mesh.geometry);for(const material of [mesh.material,mesh.customDepthMaterial,mesh.customDistanceMaterial].flat().filter(Boolean))owned.add(material);if(mesh.isInstancedMesh)instances.push(mesh);}});
  const events=new Map();for(const resource of [...owned,...instances])resource.addEventListener('dispose',()=>events.set(resource,(events.get(resource)??0)+1));
  model.update(.1,.1,{x:0,y:0,z:0});model.dispose();model.dispose();model.update(.1,.2,{x:0,y:0,z:0});
  for(const resource of [...owned,...instances])assert.equal(events.get(resource),1);
  assert.equal(released.size,0);borrowed.forEach(resource=>resource.dispose());
});
