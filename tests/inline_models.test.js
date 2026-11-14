import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packInlineModels} from '../scripts/pack-inline-models.js';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
test('standalone model storage restores exact GLB bytes and data URLs without external requests',async()=>{
 const raw=readFileSync('assets/imported/tripo-blink-staff/runtime/blink-staff.glb'),url='data:model/gltf-binary;base64,'+raw.toString('base64');
 const packed=packInlineModels('const model='+JSON.stringify(url)+';const duplicate=`'+url+'`;', {minimumBytes:1,minimumSaving:-Infinity});
 assert.equal(packed.models,1);const result=await new AsyncFunction(packed.javascript+';return [model,duplicate];')();assert.deepEqual(result,[url,url]);
 assert.deepEqual(Buffer.from(result[0].split(',')[1],'base64'),raw);
 const withoutNative=await new AsyncFunction('DecompressionStream',packed.javascript+';return model;')(undefined);assert.equal(withoutNative,url);
});
test('small models and non-GLB data URLs retain the original literal and need no decompressor',()=>{
 const text='const x="data:image/png;base64,aGVsbG8=";const y="data:model/gltf-binary;base64,Z2xURg==";';
 assert.deepEqual(packInlineModels(text),{javascript:text,models:0,originalBytes:0,packedBytes:0});
});
