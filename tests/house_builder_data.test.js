import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HOUSE_BUILDER_VARIANTS, HOUSE_STYLES, getHouseDefinition} from '../src/map/house-builder.js';
import {makeWorldObject, normalizeWorldmap, isObjectPlaceable, getObjectFootprintRadius} from '../src/map/objects.js';
import {validateWorldmap} from '../src/map/model.js';
import {renderWorldmapSvg} from '../src/map/render.js';
import {getVariantAsset,getVariantPreviewSvg} from '../src/map/asset-catalog.js';
import {builderHouseSymbolKey,getBuilderHousePreviewSvg} from '../src/map/house-map-symbol.js';
import {removeNonTripoObjects} from '../src/map/tripo-object-cleanup.js';
import {removeRetiredBuildings} from '../src/map/retired-buildings.js';

const base=JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json',import.meta.url)));
const schema=JSON.parse(readFileSync(new URL('../worldmap.schema.json',import.meta.url)));
const placed=(variant,options={})=>makeWorldObject('house',[30,-42],{variant,id:'builder-house',...options});
const mapOf=objects=>({...structuredClone(base),objects});

test('all five builder houses persist independent style, seed, entrances and transforms without affecting legacy maps',()=>{
  assert.equal(HOUSE_BUILDER_VARIANTS.filter(v=>!v.fixedLayout).length,5);
  const houseRule=schema.$defs.worldObject.allOf.find(rule=>rule.if?.properties?.kind?.const==='house');
  for(const variant of HOUSE_BUILDER_VARIANTS) for(const {id:houseStyle} of HOUSE_STYLES) for(const houseEntrances of ['single','double']) {
    assert.ok(isObjectPlaceable('house',variant.id));
    assert.ok(houseRule.then.properties.variant.enum.includes(variant.id));
    assert.equal(getObjectFootprintRadius('house',variant.id),Math.hypot(variant.footprintWidth/2,variant.footprintDepth/2));
    const object=placed(variant.id,{houseStyle,houseEntrances,houseSeed:12983,rotation:Math.PI/2,scale:1.25});
    const map=mapOf([object]),roundtrip=normalizeWorldmap(JSON.parse(JSON.stringify(map)));
    assert.deepEqual(roundtrip,map);
    assert.deepEqual(validateWorldmap(roundtrip).errors,[]);
    assert.deepEqual(removeNonTripoObjects(roundtrip).map.objects,[object]);
    assert.deepEqual(removeRetiredBuildings(roundtrip).map.objects,[object]);
    const clone=makeWorldObject('house',[31,-43],{...object,id:'builder-copy'});
    for(const key of ['variant','houseStyle','houseSeed','houseEntrances','rotation','scale'])assert.equal(clone[key],object[key]);
  }
  const legacy=placed('waldhaus');
  assert.equal(legacy.houseSeed,undefined);assert.equal(legacy.houseStyle,undefined);assert.equal(legacy.houseEntrances,undefined);
  assert.deepEqual(normalizeWorldmap(base),base);
  assert.equal(makeWorldObject('rock',[30,-42],{houseSeed:123,houseStyle:'dark',houseEntrances:'single'}).houseSeed,undefined);
});

test('invalid or misplaced builder settings are rejected without silently normalizing them',()=>{
  const bad=[{houseSeed:-1},{houseSeed:2147483648},{houseSeed:.5},{houseSeed:'7'},{houseSeed:null},{houseStyle:'<script>'},{houseStyle:'constructor'},{houseEntrances:'three'}];
  for(const options of bad)assert.ok(validateWorldmap(mapOf([placed('waldhaus',options)])).errors.length,JSON.stringify(options));
  for(const variant of ['kit-tripo-tavern','kit-tripo-house-02']) for(const options of [{houseSeed:3},{houseStyle:'natural'},{houseEntrances:'single'}]) {
    assert.ok(validateWorldmap(mapOf([{...placed(variant),...options}])).errors.length);
  }
  assert.ok(validateWorldmap(mapOf([{...makeWorldObject('rock',[30,-42]),houseStyle:'dark'}])).errors.length);
});

test('SVG distinguishes saved configurations, draws real openings and preserves the L courtyard cutout',()=>{
  for(const {id:variant} of HOUSE_BUILDER_VARIANTS) {
    const original=placed(variant,{houseStyle:'lime',houseSeed:21,houseEntrances:'single'});
    const second=placed(variant,{id:'builder-second',houseStyle:'dark',houseSeed:26,houseEntrances:'double'});
    const svg=renderWorldmapSvg(mapOf([original,second]));
    for(const object of [original,second]) {
      const key=builderHouseSymbolKey(object);
      assert.equal(svg.split(`id="world-object-${key}"`).length-1,1);
      assert.ok(svg.includes(`href="#world-object-${key}"`));
      const preview=getBuilderHousePreviewSvg(object),definition=getHouseDefinition(object);
      assert.equal((preview.match(/data-waldhaus-wall=/g)??[]).length,definition.architecturalWalls.length);
      assert.equal((preview.match(/data-waldhaus-entrance=/g)??[]).length,definition.entrances.length);
      assert.equal((preview.match(/data-waldhaus-room=/g)??[]).length,definition.rooms.length);
      assert.equal(preview,getBuilderHousePreviewSvg(JSON.parse(JSON.stringify(object))));
      assert.doesNotMatch(preview,/<script|foreignObject|onerror=|https?:\/\/(?!www.w3.org)/);
    }
    assert.notEqual(getBuilderHousePreviewSvg(original),getBuilderHousePreviewSvg({...original,houseSeed:22}));
  }
  assert.notEqual(builderHouseSymbolKey(placed('waldhaus-small')),builderHouseSymbolKey(placed('waldhaus-small',{houseEntrances:'double'})));
  const corner=getBuilderHousePreviewSvg(placed('waldhaus-corner'));
  assert.doesNotMatch(corner,/<rect x="-8" y="-7" width="16" height="14"/,'courtyard cannot be painted as a rectangular floor');
});

test('new house previews are honest offline floor plans and cannot interpolate imported executable strings',()=>{
  for(const {id} of HOUSE_BUILDER_VARIANTS.filter(v=>v.id!=='waldhaus')) {
    const asset=getVariantAsset('house',id);
    assert.equal(asset.previewKind,'floorplan');
    assert.match(getVariantPreviewSvg('house',id),/Grundriss/);
    assert.match(getVariantPreviewSvg('house',id),/data-waldhaus-room=/);
  }
  assert.equal(getBuilderHousePreviewSvg({variant:'"><script>alert(1)</script>'}), '');
  assert.equal(getBuilderHousePreviewSvg({variant:'__proto__'}), '');
  assert.doesNotMatch(getBuilderHousePreviewSvg({variant:'waldhaus',houseStyle:'"><script>',houseSeed:'"><script>'}),/<script/);
});
