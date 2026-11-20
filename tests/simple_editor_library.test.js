import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENT_OBJECT_CATALOG } from '../src/map/objects.js';
import { LIBRARY_ITEMS, LIBRARY_GROUPS, filterLibrary } from '../src/map/simple-editor-model.js';
test('picture library exposes every approved model exactly once and excludes retired models',()=>{
 const ids=items=>items.map(i=>`${i.kind}:${i.variant}`).sort();
 const approved=PLACEMENT_OBJECT_CATALOG.flatMap(d=>d.variants.map(v=>({kind:d.kind,variant:v.id})));
 assert.deepEqual(ids(LIBRARY_ITEMS),ids(approved));assert.equal(new Set(ids(LIBRARY_ITEMS)).size,approved.length);
 for(const item of LIBRARY_ITEMS){assert.ok(LIBRARY_GROUPS.some(([g])=>g===item.group));assert.doesNotMatch(item.label,/· (GLB|Tripo)$/);}
});
test('children can find rare chests, biome rocks and staffs by words, case and unaccented spelling',()=>{
 assert.ok(filterLibrary('loot','SELtene truhe').some(i=>i.variant==='kit-tripo-rare-chest'));
 assert.ok(filterLibrary('nature','fels schnee').length>0);
 assert.ok(filterLibrary('nature','durre').some(i=>i.variant==='dead-tree'));
 assert.equal(filterLibrary('houses','sonnenstab').length,0);
 assert.ok(filterLibrary('weapons','sonnenstab').some(i=>i.kind==='sunStaff'));
 assert.equal(filterLibrary('all','zzzzkeinobjekt').length,0);
 assert.equal(filterLibrary('all','  ').length,LIBRARY_ITEMS.length);
});
