import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshStandardMaterial, Texture } from 'three';
import { createWaldhausModel } from '../src/waldhaus-model.js';
import { HOUSE_STONE_COLORS, HOUSE_WALL_COLORS } from '../src/map/house-colors.js';

const meshes = model => {
 const result=new Map();model.group.traverse(node=>{if(node.isMesh)result.set(node.name,node);});return result;
};
test('Material colours remain local to one house and preserve original stone maps and geometry',()=>{
 const map=new Texture(),normalMap=new Texture(),source=new MeshStandardMaterial({map,normalMap,color:'#faf8ed'});
 const sourceColor=source.color.clone(),original=createWaldhausModel({stoneMaterial:source});
 const before=meshes(original);
 try {
  for(const stone of HOUSE_STONE_COLORS) {
   const model=createWaldhausModel({stoneMaterial:source,houseStoneColor:stone.id});
   try {
    const after=meshes(model);
    for(const [name,a] of before) {
     const b=after.get(name);assert.ok(b);
     assert.deepEqual(b.geometry.attributes.position.array,a.geometry.attributes.position.array);
     assert.deepEqual(b.geometry.attributes.uv?.array,a.geometry.attributes.uv?.array);
     assert.deepEqual(b.geometry.attributes.color?.array,a.geometry.attributes.color?.array);
     if(a.material.map===map) {
      assert.equal(b.material.map,map);assert.equal(b.material.normalMap,normalMap);
      assert.notEqual(b.material,source);
      assert.equal(b.material.color.equals(a.material.color),stone.id==='natural');
     } else if(a.material.color) assert.ok(b.material.color.equals(a.material.color));
    }
    assert.ok(source.color.equals(sourceColor),'another house and the freestanding stone wall keep their source colour');
   } finally {model.dispose();}
  }
 } finally {original.dispose();source.dispose();map.dispose();normalMap.dispose();}
});
test('Wall colours change plaster only while default colour preserves the established facade',()=>{
 const original=createWaldhausModel(),before=meshes(original);
 try {
  for(const wall of HOUSE_WALL_COLORS) {
   const model=createWaldhausModel({houseWallColor:wall.id});
   try {
    let changed=0;
    for(const [name,a] of before) {
     const b=meshes(model).get(name);
     assert.deepEqual(b.geometry.attributes.position.array,a.geometry.attributes.position.array);
     if(a.material.name==='Waldhaus · Kalkputz'&&wall.id!=='style') {
      assert.notDeepEqual(b.geometry.attributes.color.array,a.geometry.attributes.color.array);changed++;
     } else assert.deepEqual(b.geometry.attributes.color?.array,a.geometry.attributes.color?.array);
    }
    assert.equal(changed>0,wall.id!=='style');
   } finally {model.dispose();}
  }
 } finally {original.dispose();}
});
