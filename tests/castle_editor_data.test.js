import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeWorldObject, normalizeWorldmap, isObjectPlaceable} from '../src/map/objects.js';
import {getVariantAsset, getVariantPreviewSvg} from '../src/map/asset-catalog.js';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {getBuilderHousePreviewSvg, builderHouseSymbolKey} from '../src/map/house-map-symbol.js';
import {validateWorldmap} from '../src/map/model.js';
import {removeNonTripoObjects} from '../src/map/tripo-object-cleanup.js';
import {removeRetiredBuildings} from '../src/map/retired-buildings.js';

const base=JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json',import.meta.url)));
const castle=options=>makeWorldObject('house',[30,-42],{id:'castle-test',variant:'schlossanlage',...options});
const mapOf=object=>({...structuredClone(base),objects:[object]});

test('Schlossanlage is a placeable castle asset and retains independent colours and transforms through copies and save/reload',()=>{
  assert.ok(isObjectPlaceable('house','schlossanlage'));
  const asset=getVariantAsset('house','schlossanlage');
  assert.equal(asset.label,'Schlossanlage');assert.equal(asset.renderer,'src/castle-model.js');
  assert.equal(asset.previewKind,'floorplan');assert.match(getVariantPreviewSvg('house','schlossanlage'),/Grundriss/);
  const object=castle({houseStyle:'dark',houseSeed:419,houseStoneColor:'slate',houseWallColor:'clay',rotation:.7,scale:1.25});
  assert.equal(object.name,'Schlossanlage');
  const map=mapOf(object),saved=normalizeWorldmap(JSON.parse(JSON.stringify(map)));
  assert.deepEqual(saved,map);assert.deepEqual(validateWorldmap(saved).errors,[]);
  assert.deepEqual(removeNonTripoObjects(saved).map.objects,[object]);
  assert.deepEqual(removeRetiredBuildings(saved).map.objects,[object]);
  const copy=makeWorldObject('house',[34,-41],{...object,id:'castle-copy'});
  for(const key of ['variant','houseStyle','houseSeed','houseStoneColor','houseWallColor','rotation','scale']) assert.equal(copy[key],object[key]);
});

test('castle creation drops ordinary house partitions and imports reject settings that cannot change its fixed plan',()=>{
  const plain=castle();
  const inherited=castle({houseRooms:1,houseLayout:2,houseEntrances:'single'});
  assert.deepEqual(inherited,plain);
  for(const [key,value] of Object.entries({houseRooms:1,houseLayout:2,houseEntrances:'single'})) {
    const map=mapOf({...plain,[key]:value}),before=structuredClone(map);
    assert.ok(validateWorldmap(map).errors.some(message=>message.includes('festen Grundriss')));
    assert.deepEqual(map,before);
  }
  const schema=JSON.parse(readFileSync(new URL('../worldmap.schema.json',import.meta.url)));
  const rules=schema.$defs.worldObject.allOf;
  const houseRule=rules.find(rule=>rule.if?.properties?.kind?.const==='house');
  assert.ok(houseRule.then.properties.variant.enum.includes('schlossanlage'));
  const castleRule=rules.find(rule=>rule.if?.properties?.variant?.const==='schlossanlage');
  assert.deepEqual(castleRule.then.not.anyOf.map(rule=>rule.required[0]).sort(),['houseEntrances','houseLayout','houseRooms']);
});

test('castle SVG reflects the actual open courtyard, stone floors and all doorways without labels or executable imported text',()=>{
  const object=castle(),def=getHouseDefinition(object),svg=getBuilderHousePreviewSvg(object);
  assert.equal((svg.match(/data-waldhaus-wall=/g)??[]).length,def.architecturalWalls.length);
  assert.equal((svg.match(/data-waldhaus-room=/g)??[]).length,def.rooms.length);
  assert.equal((svg.match(/data-waldhaus-entrance=/g)??[]).length,def.entrances.length);
  assert.equal((svg.match(/data-castle-doorway=/g)??[]).length,def.interiorDoorways.length);
  // No floor or wall rectangle may cover the open heart of the courtyard.
  for(const rect of svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    const [,x,z,w,d]=rect.map(Number);
    assert.ok(!(x<0&&x+w>0&&z<0&&z+d>0),'courtyard centre is unpainted');
  }
  assert.notEqual(svg,getBuilderHousePreviewSvg({...object,houseSeed:28,houseStoneColor:'slate'}));
  assert.notEqual(builderHouseSymbolKey(object),builderHouseSymbolKey({...object,houseWallColor:'sage'}));
  const sage=getBuilderHousePreviewSvg({...object,houseWallColor:'sage'}),clay=getBuilderHousePreviewSvg({...object,houseWallColor:'clay'});
  assert.ok((sage.match(/data-castle-plaster=/g)??[]).length>0);
  assert.notEqual(sage.match(/data-castle-plaster="true" fill="([^"]+)"/)[1],clay.match(/data-castle-plaster="true" fill="([^"]+)"/)[1]);
  assert.equal(svg,getBuilderHousePreviewSvg(JSON.parse(JSON.stringify(object))));
  assert.doesNotMatch(svg,/<text|<script|foreignObject/);
  assert.doesNotMatch(getBuilderHousePreviewSvg({...object,houseStyle:'"><script>',houseStoneColor:'"><script>',houseWallColor:'"><script>'}),/<script/);
});
