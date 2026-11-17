import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HOUSE_BUILDER_VARIANTS, getHouseDefinition} from '../src/map/house-builder.js';
import {HOUSE_STONE_COLORS, HOUSE_WALL_COLORS} from '../src/map/house-colors.js';
import {makeWorldObject, normalizeWorldmap} from '../src/map/objects.js';
import {validateWorldmap} from '../src/map/model.js';
import {renderWorldmapSvg} from '../src/map/render.js';
import {builderHouseSymbolKey, getBuilderHousePreviewSvg} from '../src/map/house-map-symbol.js';

const base=JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json',import.meta.url)));
const schema=JSON.parse(readFileSync(new URL('../worldmap.schema.json',import.meta.url)));
const fields=['houseRooms','houseLayout','houseStoneColor','houseWallColor'];
const placed=(variant='waldhaus',options={})=>makeWorldObject('house',[30,-42],{variant,id:'rooms-house',...options});
const mapOf=object=>({...structuredClone(base),objects:[object]});

test('room counts, layouts and independent mineral colours persist through saved maps and copies without changing older houses',()=>{
  for(const {id:variant} of HOUSE_BUILDER_VARIANTS) for(const houseRooms of [1,2,3]) for(const houseLayout of [0,1,2]) {
    const object=placed(variant,{houseRooms,houseLayout,houseStoneColor:HOUSE_STONE_COLORS[(houseRooms+houseLayout)%4].id,
      houseWallColor:HOUSE_WALL_COLORS[(houseRooms+houseLayout)%5].id,houseStyle:'dark',houseSeed:519,houseEntrances:'double',rotation:Math.PI/2,scale:1.25});
    const map=mapOf(object),roundtrip=normalizeWorldmap(JSON.parse(JSON.stringify(map)));
    assert.deepEqual(roundtrip,map);
    assert.deepEqual(validateWorldmap(roundtrip).errors,[]);
    const copy=makeWorldObject('house',[31,-43],{...object,id:'rooms-copy'});
    for(const key of [...fields,'variant','houseStyle','houseSeed','houseEntrances','rotation','scale'])assert.equal(copy[key],object[key]);
  }
  assert.deepEqual(normalizeWorldmap(base),base);
  for(const key of fields)assert.equal(placed()[key],undefined);
  assert.equal(builderHouseSymbolKey(placed()),'house-waldhaus');
  assert.equal(builderHouseSymbolKey(placed('waldhaus',{houseSeed:3,houseStyle:'lime',houseEntrances:'single'})),'house-waldhaus-lime-3-single');
  const rock=makeWorldObject('rock',[30,-42],{houseRooms:2,houseLayout:1,houseStoneColor:'slate',houseWallColor:'sage'});
  for(const key of fields)assert.equal(rock[key],undefined);
});

test('invalid room/layout/colour values and values on unrelated objects are rejected without rewriting imported input',()=>{
  const invalid=[{houseRooms:0},{houseRooms:4},{houseRooms:1.5},{houseRooms:'2'},{houseRooms:null},
    {houseLayout:-1},{houseLayout:3},{houseLayout:.1},{houseLayout:'0'},{houseLayout:null},
    {houseStoneColor:'neon'},{houseStoneColor:'constructor'},{houseStoneColor:null},
    {houseWallColor:'<script>'},{houseWallColor:'__proto__'},{houseWallColor:null}];
  for(const options of invalid) {
    const map=mapOf(placed('waldhaus',options)),snapshot=structuredClone(map);
    assert.ok(validateWorldmap(map).errors.length,JSON.stringify(options));assert.deepEqual(map,snapshot);
  }
  for(const object of [placed('kit-tripo-tavern'),makeWorldObject('rock',[30,-42])]) {
    for(const [key,value] of Object.entries({houseRooms:2,houseLayout:1,houseStoneColor:'sand',houseWallColor:'clay'})) {
      assert.ok(validateWorldmap(mapOf({...object,[key]:value})).errors.length,key);
    }
  }
  const props=schema.$defs.worldObject.properties;
  assert.deepEqual(props.houseRooms,{type:'integer',minimum:1,maximum:3});
  assert.deepEqual(props.houseLayout,{type:'integer',minimum:0,maximum:2});
  assert.deepEqual(props.houseStoneColor.enum,HOUSE_STONE_COLORS.map(option=>option.id));
  assert.deepEqual(props.houseWallColor.enum,HOUSE_WALL_COLORS.map(option=>option.id));
  const guard=schema.$defs.worldObject.allOf.find(rule=>rule.if?.anyOf?.some(option=>option.required?.includes('houseRooms')));
  assert.equal(guard.then.properties.kind.const,'house');
  for(const key of fields)assert.ok(guard.if.anyOf.some(option=>option.required.includes(key)));
});

test('saved room layouts and colour choices get distinct safe SVG symbols from the actual architectural definition',()=>{
  const keys=new Set();
  for(const houseRooms of [1,2,3]) for(const houseLayout of [0,1,2]) for(const stone of HOUSE_STONE_COLORS) for(const wall of HOUSE_WALL_COLORS) {
    const object=placed('waldhaus',{houseRooms,houseLayout,houseStoneColor:stone.id,houseWallColor:wall.id});
    const key=builderHouseSymbolKey(object);assert.ok(!keys.has(key));keys.add(key);
    assert.match(key,/^[a-z0-9-]+$/);
    const svg=getBuilderHousePreviewSvg(object),definition=getHouseDefinition(object);
    assert.equal((svg.match(/data-waldhaus-wall=/g)??[]).length,definition.architecturalWalls.length);
    assert.equal((svg.match(/data-waldhaus-room=/g)??[]).length,definition.rooms.length);
    assert.ok(svg.includes(`data-house-stone-color="${stone.id}"`));
    if(wall.color)assert.ok(svg.includes(`fill="${wall.color}"`));
    assert.equal(svg,getBuilderHousePreviewSvg(JSON.parse(JSON.stringify(object))));
    const mapSvg=renderWorldmapSvg(mapOf(object));assert.ok(mapSvg.includes(`href="#world-object-${key}"`));
  }
  const poisoned=getBuilderHousePreviewSvg(placed('waldhaus',{houseRooms:'"><script>',houseLayout:'"><script>',houseStoneColor:'"><script>',houseWallColor:'"><script>'}));
  assert.doesNotMatch(poisoned,/<script|onerror=|foreignObject/);
});

test('L-room floor pieces retain a shared floor colour and the courtyard stays free in the SVG',()=>{
  const object=placed('waldhaus-corner',{houseRooms:1,houseLayout:0,houseStoneColor:'moss',houseWallColor:'sage'});
  const definition=getHouseDefinition(object),svg=getBuilderHousePreviewSvg(object);
  assert.equal(definition.roomCount??definition.rooms.length,1);
  assert.doesNotMatch(svg,/<rect x="-8" y="-7" width="16" height="14"/);
  const fills=[...svg.matchAll(/data-waldhaus-room="[^"]*" fill="([^"]*)"/g)].map(match=>match[1]);
  assert.equal(new Set(fills).size,1,'one continuous logical room uses one floor colour');
});
