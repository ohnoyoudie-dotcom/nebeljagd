import test from 'node:test';
import {relative,join} from 'node:path';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {weaponStats} from '../src/loot-tiers.js';
import {aimKind} from '../src/aim-input.js';
const json=p=>JSON.parse(readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
for(const [kind,slug] of [['shadowStaff','shadow-staff'],['clockworkStaff','clockwork-staff']]){
 test(`${kind}: untouched upload, closed derivative roster, embedded PBR, grip, schema and aim contract`,()=>{
  const root=`assets/imported/tripo-${slug}/`,manifest=json(root+'runtime-manifest.json'),r=json(root+`inspections/${slug}.json`);
  assert.equal(sha(readFileSync(r.source.path)),r.source.sha256);
  const roster=readdirSync(root,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()&&e.name!=='runtime-manifest.json').map(e=>relative(root,join(e.parentPath,e.name))).sort();
  assert.deepEqual(roster,manifest.files.map(f=>f.path).sort());
  for(const f of manifest.files){const b=readFileSync(root+f.path);assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256);}
  const bytes=readFileSync(r.runtime.path);assert.ok(bytes.length<300000);assert.ok(r.runtime.triangles<=5000);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.ok(gltf.images.every(i=>i.bufferView!=null&&!i.uri));assert.ok(gltf.buffers.every(b=>!b.uri));
  assert.ok(gltf.materials.every(m=>m.pbrMetallicRoughness.baseColorTexture&&m.normalTexture));
  assert.ok(r.normalization.gltfBounds[0][1]<0);assert.ok(r.normalization.tipPoint[1]>.8);assert.ok(r.textures.every(t=>Math.max(...t.after)<=256));
  const schema=json('worldmap.schema.json').$defs.worldObject;assert.ok(schema.properties.kind.enum.includes(kind));
  const entry=schema.allOf.find(e=>e.if?.properties?.kind?.const===kind);assert.ok(entry.then.properties.variant.enum.includes(`kit-tripo-${slug}`));
  assert.equal(aimKind(kind),'arc');assert.ok(weaponStats(kind,'legendary').damage>weaponStats(kind,'common').damage);
 });
}
