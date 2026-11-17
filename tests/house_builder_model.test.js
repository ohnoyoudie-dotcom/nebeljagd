import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3 } from 'three';
import { HOUSE_BUILDER_VARIANTS, HOUSE_STYLES, getHouseAppearance, getHouseDefinition } from '../src/map/house-builder.js';
import { WALDHAUS_DEFINITION } from '../src/map/waldhaus-definition.js';
import { createWaldhausModel } from '../src/waldhaus-model.js';
import { createCollisionIndex } from '../src/collision.js';

function raysThrough(model, definition) {
  model.group.updateMatrixWorld(true);
  const collision = createCollisionIndex([],definition.walls);
  for(const route of [...definition.qaRoutes.entrances,...definition.qaRoutes.rooms]) {
    for(const height of [.2,.45,.8,1.6,2.2])for(const offset of [-.55,0,.55]) {
      const xAxis=route.from[0]!==route.to[0];
      const from=new Vector3(route.from[0]+(xAxis?0:offset),definition.floorHeight+height,route.from[1]+(xAxis?offset:0));
      const to=new Vector3(route.to[0]+(xAxis?0:offset),from.y,route.to[1]+(xAxis?offset:0));
      const direction=to.clone().sub(from);
      assert.equal(new Raycaster(from,direction.clone().normalize(),.001,direction.length()).intersectObject(model.group,true).length,0,`${definition.variant}: ${route.name}, y=${height}, offset=${offset}`);
      assert.equal(collision.traceSegment(from,to,.32),null,`${definition.variant}: ${route.name} capsule`);
    }
  }
}

test('Builder keeps the existing Waldhaus default and exposes five distinct, finite empty shells',()=>{
  assert.equal(getHouseDefinition('waldhaus'),WALDHAUS_DEFINITION);
  assert.equal(HOUSE_BUILDER_VARIANTS.filter(v=>!v.fixedLayout).length,5);
  for(const variant of HOUSE_BUILDER_VARIANTS.filter(v=>!v.fixedLayout)) {
    const definition=getHouseDefinition(variant.id),model=createWaldhausModel({definition});
    try {
      const bounds=new Box3().setFromObject(model.group);
      assert.ok(bounds.min.x>=-definition.footprint.halfWidth-.8 && bounds.max.x<=definition.footprint.halfWidth+.8);
      assert.ok(bounds.min.z>=-definition.footprint.halfDepth-.8 && bounds.max.z<=definition.footprint.halfDepth+.8);
      assert.ok(bounds.max.y<3.3);
      assert.equal(model.stats.rooms,definition.rooms.length);
      assert.equal(model.roof.visible,false);
      assert.ok(model.stats.drawCalls<=22);
      assert.ok(model.stats.triangles<120000,`${variant.id}: ${model.stats.triangles}`);
      model.group.traverse(node=>{if(node.isMesh)for(const value of node.geometry.attributes.position.array)assert.ok(Number.isFinite(value));});
    } finally {model.dispose();}
  }
});

test('All five houses have visible and physical passages with either one or two exterior entrances',()=>{
  for(const variant of HOUSE_BUILDER_VARIANTS.filter(v=>!v.fixedLayout))for(const houseEntrances of ['single','double']) {
    const definition=getHouseDefinition({variant:variant.id,houseEntrances}),model=createWaldhausModel({definition});
    try {
      assert.equal(definition.entrances.length,houseEntrances==='single'?1:2);
      raysThrough(model,definition);
      const index=createCollisionIndex([],definition.walls);
      for(const wall of definition.walls) {
        const horizontal=wall.maxX-wall.minX>wall.maxZ-wall.minZ;
        const center={x:(wall.minX+wall.maxX)/2,y:1,z:(wall.minZ+wall.maxZ)/2};
        const a={...center,[horizontal?'z':'x']:(horizontal?wall.minZ:wall.minX)-.5};
        const b={...center,[horizontal?'z':'x']:(horizontal?wall.maxZ:wall.maxX)+.5};
        assert.ok(index.traceSegment(a,b,.06),`${variant.id}: ${wall.name} blocks shots`);
      }
    } finally {model.dispose();}
  }
});

test('The L-shaped courtyard contains no foundation, floor or roof and both wings connect through open doors',()=>{
  const definition=getHouseDefinition('waldhaus-corner'),model=createWaldhausModel({definition});
  model.group.updateMatrixWorld(true);
  try {
    for(const [x,z] of [[2,2],[4,4],[6,5]]) {
      assert.ok(!definition.footprintAreas.some(a=>x>=a.minX&&x<=a.maxX&&z>=a.minZ&&z<=a.maxZ));
      assert.equal(new Raycaster(new Vector3(x,6,z),new Vector3(0,-1,0),0,8).intersectObject(model.group,true).length,0);
    }
    for(const [x,z]of [[-4,4],[-4,-4],[4,-4]])assert.ok(new Raycaster(new Vector3(x,2,z),new Vector3(0,-1,0),0,3).intersectObject(model.group,true).length>0);
  } finally {model.dispose();}
});

function signature(model) {
  const colors=[],positions=[];
  model.group.traverse(node=>{if(node.isMesh&&node.geometry.attributes.color){colors.push(...node.geometry.attributes.color.array.slice(0,24));positions.push(...node.geometry.attributes.position.array.slice(0,24));}});
  return {colors,positions};
}
test('Saved appearance seeds reproduce the same house; styles and seeds change visible facade colours without changing collision',()=>{
  const definition=getHouseDefinition('waldhaus-small');
  const create=(houseStyle,houseSeed)=>createWaldhausModel({definition,houseStyle,houseSeed});
  const models=[create('natural',1234),create('natural',1234),create('natural',907),...HOUSE_STYLES.slice(1).map(s=>create(s.id,1234))];
  try {
    assert.deepEqual(signature(models[0]),signature(models[1]));
    for(const model of models.slice(2))assert.notDeepEqual(signature(model).colors,signature(models[0]).colors);
    for(const model of models)assert.equal(model.stats.rooms,definition.rooms.length);
    assert.equal(getHouseAppearance({houseStyle:'invalid',houseSeed:Infinity}).seed,87123);
  } finally {models.forEach(m=>m.dispose());}
});
