import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeWorldObject, normalizeWorldmap, isObjectPlaceable} from '../src/map/objects.js';
import {getVariantAsset, getVariantPreviewSvg} from '../src/map/asset-catalog.js';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {getCastleMaterialColors,CASTLE_STYLE_LABELS,CASTLE_FLOOR_LABELS,CASTLE_WALL_LABELS} from '../src/map/castle-colors.js';
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

test('castle SVG distinguishes green court centres, narrow stone borders, tower silhouettes and clear room access',()=>{
  const object=castle(),def=getHouseDefinition(object),svg=getBuilderHousePreviewSvg(object);
  assert.equal((svg.match(/data-waldhaus-wall=/g)??[]).length,def.architecturalWalls.length);
  assert.equal((svg.match(/data-waldhaus-room=/g)??[]).length,def.rooms.length);
  assert.equal((svg.match(/data-waldhaus-entrance=/g)??[]).length,def.entrances.length);
  assert.equal((svg.match(/data-castle-doorway=/g)??[]).length,def.interiorDoorways.length);
  assert.equal((svg.match(/data-castle-courtyard=/g)??[]).length,2);
  assert.equal((svg.match(/data-castle-ground="grass"/g)??[]).length,2);
  assert.equal((svg.match(/data-castle-court-edge=/g)??[]).length,def.courtyardPavingAreas.length);
  assert.equal((svg.match(/data-castle-tower=/g)??[]).length,4);
  assert.equal((svg.match(/data-castle-window="barred"/g)??[]).length,def.windows.length);
  assert.equal((svg.match(/data-castle-grille=/g)??[]).length,def.windows.length);
  assert.equal((svg.match(/data-castle-torch=/g)??[]).length,def.torches.length);
  assert.equal((svg.match(/data-castle-floor-joints=/g)??[]).length,def.rooms.length);
  assert.ok(def.floorAreas.every(area=>area.material==='stone'));
  for(const court of def.courtyards) {
    const cx=(court.minX+court.maxX)/2,cz=(court.minZ+court.maxZ)/2;
    const rectangles=[...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" ([^>]*)>/g)];
    const contains=match=>{const [,x,z,w,d]=match.slice(0,5).map(Number);return x<cx&&x+w>cx&&z<cz&&z+d>cz;};
    assert.ok(rectangles.some(match=>contains(match)&&match[5].includes('data-castle-ground="grass"')&&match[5].includes('fill="#65834c"')),'each court has a green outdoor lawn');
    assert.ok(!rectangles.some(match=>contains(match)&&match[5].includes('data-castle-court-edge')),'stone edging does not cover the lawn centre');
    assert.ok(!rectangles.some(match=>contains(match)&&/data-house-foundation|data-waldhaus-room|data-waldhaus-wall/.test(match[5])),'courtyard is not a covered room or raised foundation');
  }
  const stone=getCastleMaterialColors(object);
  assert.ok(svg.includes(`data-waldhaus-wall="true" fill="${stone.wall}"`));
  assert.notEqual(stone.wall,stone.floor);
  assert.doesNotMatch(svg,/data-castle-plaster|#a2c6c3|#b49160/);
  const sage=getBuilderHousePreviewSvg({...object,houseWallColor:'sage'}),clay=getBuilderHousePreviewSvg({...object,houseWallColor:'clay'});
  assert.notEqual(sage.match(/data-waldhaus-wall="true" fill="([^"]+)"/)[1],clay.match(/data-waldhaus-wall="true" fill="([^"]+)"/)[1]);
  assert.notEqual(svg,getBuilderHousePreviewSvg({...object,houseSeed:28,houseStoneColor:'slate'}));
  assert.notEqual(builderHouseSymbolKey(object),builderHouseSymbolKey({...object,houseWallColor:'sage'}));
  assert.equal(svg,getBuilderHousePreviewSvg(JSON.parse(JSON.stringify(object))));
  assert.doesNotMatch(svg,/<text|<script|foreignObject/);
  assert.doesNotMatch(getBuilderHousePreviewSvg({...object,houseStyle:'"><script>',houseStoneColor:'"><script>',houseWallColor:'"><script>'}),/<script/);
  assert.ok(svg.length<65000,'reusable joint patterns keep the fourfold larger plan compact');
});

test('castle material controls retain legacy saved IDs while only describing restrained stone palettes',()=>{
  assert.deepEqual(Object.keys(CASTLE_STYLE_LABELS),['natural','lime','ochre','dark']);
  assert.deepEqual(Object.keys(CASTLE_FLOOR_LABELS),['natural','sand','slate','moss']);
  assert.deepEqual(Object.keys(CASTLE_WALL_LABELS),['style','chalk','sand','sage','clay']);
  assert.doesNotMatch(Object.values({...CASTLE_STYLE_LABELS,...CASTLE_FLOOR_LABELS,...CASTLE_WALL_LABELS}).join(' '),/Holz|Putz|Fachwerk|Glas/);
  const base=getCastleMaterialColors();
  assert.deepEqual(getCastleMaterialColors({houseStyle:'constructor',houseWallColor:'__proto__',houseStoneColor:'<script>'}),base);
  for(const houseStyle of Object.keys(CASTLE_STYLE_LABELS)) {
    const palette=getCastleMaterialColors({houseStyle});
    assert.notEqual(palette.wall,palette.floor);
    for(const value of Object.values(palette))assert.match(value,/^#[0-9a-f]{6}$/);
  }
  assert.equal(getCastleMaterialColors({houseStoneColor:'slate'}).wall,base.wall);
  assert.notEqual(getCastleMaterialColors({houseStoneColor:'slate'}).floor,base.floor);
  assert.equal(getCastleMaterialColors({houseWallColor:'clay'}).floor,base.floor);
  assert.notEqual(getCastleMaterialColors({houseWallColor:'clay'}).wall,base.wall);
});
