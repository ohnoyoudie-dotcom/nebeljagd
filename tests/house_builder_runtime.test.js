import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_BUILDER_VARIANTS, getHouseDefinition } from '../src/map/house-builder.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { houseFloorFactorAt } from '../src/map/house-floor.js';
import { createGroundGrassExclusion } from '../src/meadow-ground.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';
import { createLandscapePlacementGuard } from '../src/map/landscape-brush.js';
import { createLobbyMap } from '../src/lobby-map.js';
import { makeWorldObject } from '../src/map/objects.js';

test('Every builder variant uses its real foundation size and floor, including rotated placements',()=>{
 for(const {id} of HOUSE_BUILDER_VARIANTS) for(const rotation of [0,Math.PI/2]) {
  const def=getHouseDefinition(id),scale=1.25;
  assert.deepEqual(getEnvironmentKitDefinition('house',id).footprint,def.footprint);
  const map=createLobbyMap();map.objects=[makeWorldObject('house',[12,-8],{variant:id,rotation,scale})];
  const before=structuredClone(map),excluded=createGroundGrassExclusion(map,{padding:0}),spatial=createWorldSpatialModel(map);
  const c=Math.cos(rotation),s=Math.sin(rotation),world=(x,z)=>[12+scale*(c*x+s*z),-8+scale*(-s*x+c*z)];
  const plateau=spatial.groundAt(12,-8),guard=createLandscapePlacementGuard(map);
  for(const area of def.floorAreas??[def.floorBounds]) {
   const x=(area.minX+area.maxX)/2,z=(area.minZ+area.maxZ)/2;
   assert.equal(houseFloorFactorAt(x,z,def.floorBounds,def.interior,def.entrances,def.footprintAreas),1);
   assert.equal(excluded(...world(x,z)),true);
   assert.ok(Math.abs(spatial.groundAt(...world(x,z))-plateau)<1e-8);
  }
  if(id==='waldhaus-corner') {
   assert.equal(houseFloorFactorAt(4,4,def.floorBounds,def.interior,def.entrances,def.footprintAreas),null,'courtyard has no invisible floor');
   assert.equal(excluded(...world(4,4)),false,'courtyard remains available for grass');
   assert.equal(guard.reason(world(4,4),.1,'grass'),null,'courtyard can be painted');
   assert.equal(guard.reason(world(-4,4),.1,'grass'),'structure','indoor floor cannot be overgrown by brush');
  }
  assert.deepEqual(map,before);
 }
});

test('Single/double exit settings give height ramps only at actual open doors',()=>{
 for(const {id} of HOUSE_BUILDER_VARIANTS.filter(v=>!v.fixedLayout)) for(const mode of ['single','double']) {
  const def=getHouseDefinition({variant:id,houseEntrances:mode});
  assert.equal(def.entrances.length,mode==='single'?1:2);
  for(const e of def.entrances) {
   const sign=['north','west'].includes(e.side)?-1:1,horizontal=['north','south'].includes(e.side);
   const x=horizontal?e.center:e.boundary+sign*e.depth*.5,z=horizontal?e.boundary+sign*e.depth*.5:e.center;
   const factor=houseFloorFactorAt(x,z,def.floorBounds,def.interior,def.entrances,def.footprintAreas);
   assert.ok(Math.abs(factor-.5)<1e-8,`${id} ${mode} ${e.name}`);
  }
 }
});
