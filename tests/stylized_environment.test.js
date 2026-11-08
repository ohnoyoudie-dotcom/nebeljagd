import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TERRAIN_TYPES, terrainSettings, getLandscape } from '../src/map/landscape.js';
import { groundGrassSettings } from '../src/meadow-ground.js';
import { terrainPalette } from '../src/terrain-art.js';
import { terrainStampWeight, terrainSurfaceDetail } from '../src/map/terrain-paint.js';

test('quiet ground avoids automatic grass geometry but leaves explicit legacy cover supported', () => {
  assert.equal(groundGrassSettings({}).enabled, false);
  assert.equal(groundGrassSettings({objects:[{kind:'grass',variant:'tall',position:[0,0]}]}).enabled, false);
  assert.equal(groundGrassSettings({groundCover:{enabled:true}}).enabled, true);
  assert.equal(groundGrassSettings({groundCover:{type:'rei-grass'}}).enabled, true);
  assert.equal(groundGrassSettings({groundCover:{type:'existing'}}).enabled, false);
});
test('terrain presets use restrained woodland colours and grey paving', () => {
  const byId=Object.fromEntries(TERRAIN_TYPES.map(t=>[t.id,t]));
  assert.equal(TERRAIN_TYPES.length,9);
  for(const key of ['meadow','forest','earth','cobble']) {
    assert.match(byId[key].color,/^#[0-9a-f]{6}$/i);
    assert.ok(byId[key].variation<=.11,key);
  }
  assert.deepEqual(terrainSettings('meadow'),{
    type:'meadow',color:byId.meadow.color,hardness:.65,strength:.9,variation:byId.meadow.variation,
  });
  const grass=new THREE.Color(byId.meadow.color),stone=new THREE.Color(byId.cobble.color);
  assert.ok(grass.g>grass.r && grass.r>grass.b);
  assert.ok(Math.abs(stone.r-stone.b)<.15);
  assert.ok(terrainPalette('forest','#568753').g<new THREE.Color('#568753').g);
});
test('edge-painted earth is controlled, with no map mutations', () => {
  const s={id:'a',type:'meadow',position:[0,0],radius:12,seed:42,...terrainSettings('meadow')};
  assert.ok(terrainStampWeight(s,0,0)>terrainStampWeight(s,10,0));
  assert.equal(terrainStampWeight(s,12,0),0);
  assert.ok(terrainSurfaceDetail('forest',2,2)>.85);
  assert.equal(getLandscape({}).terrain.length,0);
});
