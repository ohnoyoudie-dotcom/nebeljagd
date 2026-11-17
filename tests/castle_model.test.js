import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,MeshStandardMaterial,Texture,Raycaster,Vector3} from 'three';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {createCastleModel} from '../src/castle-model.js';

const definition=getHouseDefinition('schlossanlage');
const create=options=>createCastleModel({definition,...options});

test('Castle renders a single-storey empty compound with bounded instanced geometry',()=>{
  const model=create();
  try {
    const bounds=new Box3().setFromObject(model.group);
    assert.ok(bounds.min.x>=-35.5&&bounds.max.x<=35.5);
    assert.ok(bounds.min.z>=-31&&bounds.max.z<=31);
    assert.ok(bounds.max.y<=definition.height+.1);
    assert.equal(model.roof.visible,false);assert.equal(model.frontFacade.children.length,0);
    assert.equal(model.stats.rooms,18);assert.equal(model.stats.entrances,6);
    assert.ok(model.stats.drawCalls<=20);assert.ok(model.stats.triangles<210000);
    const unique=new Set();
    model.group.traverse(node=>{
      if(!node.isMesh)return;unique.add(node.geometry);
      for(const v of node.geometry.attributes.position.array)assert.ok(Number.isFinite(v));
      if(node.isInstancedMesh)for(const v of node.instanceMatrix.array)assert.ok(Number.isFinite(v));
    });
    assert.ok(unique.size<=8,'stonework and paving share instanced shapes');
  }finally{model.dispose();}
});

test('Castle doorways stay visibly open from above and through movement/projectile height',()=>{
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
      assert.equal(new Raycaster(new Vector3(door.x,7,door.z),new Vector3(0,-1,0),0,7-definition.floorHeight-.025).intersectObject(model.group,true).length,0,'doorways have no hidden overhead lintel');
    }
  }finally{model.dispose();}
});

test('Castle courtyard has no mesh floor or furniture, while every room has its real floor',()=>{
  const model=create();model.group.updateMatrixWorld(true);
  try {
    for(const [x,z]of [[0,0],[-12,-7],[12,7]])assert.equal(new Raycaster(new Vector3(x,6,z),new Vector3(0,-1,0),0,8).intersectObject(model.group,true).length,0);
    for(const room of definition.rooms) {
      const origin=new Vector3((room.minX+room.maxX)/2,1,(room.minZ+room.maxZ)/2);
      const hits=new Raycaster(origin,new Vector3(0,-1,0),0,2).intersectObject(model.group,true);
      assert.ok(hits.length,room.name);
      assert.ok(hits[0].point.y<=definition.floorHeight+.006&&hits[0].point.y>=definition.floorHeight-.05,`${room.name} floor and recessed grout follow movement height`);
    }
  }finally{model.dispose();}
});

test('Castle glazing is visible on room-facing surfaces instead of buried inside the masonry',()=>{
  const model=create();model.group.updateMatrixWorld(true);
  try {
    for(const window of definition.windows) {
      const horizontal=['north','south'].includes(window.side),inward=['north','west'].includes(window.side)?1:-1;
      const origin=new Vector3(horizontal?window.center:window.boundary+inward*1.2,definition.floorHeight+window.sillHeight+window.height*.73,horizontal?window.boundary+inward*1.2:window.center);
      const direction=new Vector3(horizontal?0:-inward,0,horizontal?-inward:0);
      const hits=new Raycaster(origin,direction,.001,1.5).intersectObject(model.group,true);
      assert.ok(hits.length,window.name);
      assert.match(hits[0].object.material.name,/Bleiglas/,window.name);
    }
  }finally{model.dispose();}
});

function appearanceSignature(model) {
  const result=[];
  model.group.traverse(mesh=>{if(mesh.isInstancedMesh)result.push(mesh.material.name,...mesh.instanceColor.array.slice(0,36),...mesh.instanceMatrix.array.slice(0,32));});
  return result;
}
test('Castle seeds and mineral/plaster controls are visible, saved and deterministic',()=>{
  const models=[create({houseSeed:543}),create({houseSeed:543}),create({houseSeed:981}),create({houseSeed:543,houseStoneColor:'slate'}),create({houseSeed:543,houseWallColor:'clay'})];
  try {
    assert.deepEqual(appearanceSignature(models[0]),appearanceSignature(models[1]));
    for(const model of models.slice(2))assert.notDeepEqual(appearanceSignature(models[0]),appearanceSignature(model));
  }finally{models.forEach(model=>model.dispose());}
});

test('Castle disposal frees owned instancing resources once and preserves borrowed Tripo maps',()=>{
  const map=new Texture(),normalMap=new Texture(),source=new MeshStandardMaterial({map,normalMap});
  const borrowed=[source,map,normalMap],released=new Set();borrowed.forEach(resource=>resource.addEventListener('dispose',()=>released.add(resource)));
  const model=create({stoneMaterial:source}),owned=new Set(),instances=[];
  model.group.traverse(mesh=>{if(mesh.isMesh){owned.add(mesh.geometry);for(const material of [mesh.material].flat())owned.add(material);if(mesh.isInstancedMesh)instances.push(mesh);}});
  const events=new Map();for(const resource of [...owned,...instances])resource.addEventListener('dispose',()=>events.set(resource,(events.get(resource)??0)+1));
  model.dispose();model.dispose();
  for(const resource of [...owned,...instances])assert.equal(events.get(resource),1);
  assert.equal(released.size,0);
  borrowed.forEach(resource=>resource.dispose());
});
