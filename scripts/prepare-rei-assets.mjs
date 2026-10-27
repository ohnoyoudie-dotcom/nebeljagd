import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const sourceRoot = fileURLToPath(new URL('../assets/imported/rei/source/', import.meta.url));

const out = resolve(process.argv[2] || '/tmp/nebeljagd-rei-export');
await mkdir(out, {recursive:true});
class Reader {
  async readAsArrayBuffer(blob) { try { this.result=await blob.arrayBuffer(); this.onloadend?.({target:this}); } catch(e) {this.onerror?.(e);} }
  async readAsDataURL(blob) { try { const b=await blob.arrayBuffer();this.result=`data:${blob.type};base64,${Buffer.from(b).toString('base64')}`;this.onloadend?.({target:this}); } catch(e) {this.onerror?.(e);} }
}
globalThis.FileReader=Reader;
const sources={
  tree01:resolve(sourceRoot, 'Rei_treeLeavesGN.glb'),
  samples:resolve(sourceRoot, 'Rei_treeLeavesGN_samples.glb'),
  ground:resolve(sourceRoot, 'grassGN3_3_v2_Rei.glb'),
};
const sourceCache=new Map();
async function load(path){const b=await readFile(path);const model=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');model.scene.updateMatrixWorld(true);return {model,bytes:b};}
for(const path of Object.values(sources)) sourceCache.set(path,await load(path));
const sha=b=>createHash('sha256').update(b).digest('hex');
const inspect=scene=>{
 scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(scene);let triangles=0,vertices=0;const meshes=[];
 scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;const n=g.index?.count??g.attributes.position.count;triangles+=n/3;vertices+=g.attributes.position.count;meshes.push({name:o.name,triangles:n/3,vertices:g.attributes.position.count,material:o.material.name});});
 return {triangles,vertices,meshes,bounds:{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new THREE.Vector3()).toArray()}};
};
function materials(group,ground=false){group.traverse(o=>{if(!o.isMesh)return;const isLeaf=/leaves/i.test(o.name);o.material=new THREE.MeshStandardMaterial({name:ground?'Rei_BedGround':isLeaf?'Rei_Foliage':'Rei_Bark',color:0xffffff,roughness:.96,metalness:0,side:THREE.DoubleSide});});}
function center(group){group.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(group),c=b.getCenter(new THREE.Vector3());const translation={x:-c.x,y:-b.min.y,z:-c.z};group.position.add(new THREE.Vector3(translation.x,translation.y,translation.z));group.updateMatrixWorld(true);return translation;}
async function exportGroup(name,path,nodes,{filename=`${name}.glb`,ground=false}={}){
 const {model,bytes}=sourceCache.get(path);const group=new THREE.Group();group.name=`Rei_${name}`;
 const selected=nodes.map(nodeName=>{const o=model.scene.getObjectByName(nodeName);if(!o)throw Error(`Missing ${nodeName}`);const clone=o.clone(true);group.add(clone);return clone;});
 materials(group,ground);const before=inspect(group);const translation=center(group);const normalized=inspect(group);
 group.userData={originalFile:path.split('/').at(-1),sourceSHA256:sha(bytes),sourceNodeNames:nodes,adaptation:'Selected geometry only; centered horizontally, grounded; simple named runtime-replaceable materials. No original procedural shaders are present in GLB.'};
 const binary=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:false,trs:true,animations:[]});await writeFile(`${out}/${filename}`,Buffer.from(binary));
 const reimport=await load(`${out}/${filename}`);const actual=inspect(reimport.model.scene);if(before.triangles!==actual.triangles)throw Error('Topology changed for '+name);
 const trunk=selected.find(o=>/treeTrunk/.test(o.name));const trunkOrigin=trunk?trunk.getWorldPosition(new THREE.Vector3()).toArray():null;
 return {name,originalFile:path,sourceSHA256:sha(bytes),originalNodeNames:nodes,originalSelection:before,normalizationTranslation:translation,trunkOrigin,output:{file:filename,sha256:sha(reimport.bytes),bytes:reimport.bytes.length,...actual},topologyPreserved:true,materialPolicy:'Simple white named MeshStandardMaterial surfaces; original GLB contains no exported textures/colors. Integration assigns runtime materials.'};
}
const report={created:'2026-10-27',coordinateSystem:'glTF 2.0 right-handed, +Y up, metres',rights:'User-uploaded files; no independent public redistribution license metadata was supplied.',outputs:[]};
report.outputs.push(await exportGroup('tree01',sources.tree01,['leavesSphere_Sample','treeTrunk_Sample']));
report.outputs.push(await exportGroup('tree02',sources.samples,['leavesSphere_Sample02','treeTrunk_Sample02']));
const bush=await exportGroup('bush',sources.samples,['leavesSphere_Sample03','treeTrunk_Sample03'],{filename:'bush-raw.glb'});
await writeFile(`${out}/decimate-bush.py`, `import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\nbpy.ops.import_scene.gltf(filepath=${JSON.stringify(out + '/bush-raw.glb')})\nfor obj in list(bpy.data.objects):\n if obj.type == 'MESH' and obj.name.startswith('treeTrunk'):\n  bpy.context.view_layer.objects.active=obj\n  modifier=obj.modifiers.new('Browser bush simplification', 'DECIMATE')\n  modifier.ratio=0.33\n  modifier.use_collapse_triangulate=True\n  bpy.ops.object.modifier_apply(modifier=modifier.name)\nbpy.ops.export_scene.gltf(filepath=${JSON.stringify(out + '/bush-reduced.glb')}, export_format='GLB', export_animations=False)\n`);
const reduction=spawnSync('blender',['--background','--disable-autoexec','--python',`${out}/decimate-bush.py`],{encoding:'utf8',env:{...process.env,BLENDER_USER_CONFIG:`${out}/blender-config`}});
await writeFile(`${out}/bush-blender.log`,reduction.stdout+'\n'+reduction.stderr);if(reduction.status!==0)throw Error('Bush reduction failed');
const reduced=await load(`${out}/bush-reduced.glb`);const group=new THREE.Group();group.name='Rei_bush';group.add(reduced.model.scene);materials(group);const translation=center(group);group.userData={originalFile:sources.samples.split('/').at(-1),sourceSHA256:bush.sourceSHA256,sourceNodeNames:bush.originalNodeNames,adaptation:'Trunk mesh decimated to ratio 0.33 in Blender 4.3.2, canopy unchanged; normalized again after reduction.'};
const binary=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:false,trs:true,animations:[]});await writeFile(`${out}/bush.glb`,Buffer.from(binary));
const actualBush=await load(`${out}/bush.glb`);const verifiedBush=inspect(actualBush.model.scene);if(verifiedBush.triangles>4500)throw Error('Bush budget exceeded');
report.outputs.push({...bush,topologyPreserved:false,derivation:{method:'Blender DECIMATE COLLAPSE, trunk only',ratio:.33,canopyUnchanged:true,additionalNormalization:translation},output:{file:'bush.glb',bytes:actualBush.bytes.length,sha256:sha(actualBush.bytes),...verifiedBush}});
report.outputs.push(await exportGroup('bed-ground',sources.ground,['grassGround'],{ground:true}));
for(const item of report.outputs){const min=item.output.bounds.min,max=item.output.bounds.max;if(Math.abs(min[1])>1e-5||Math.abs(min[0]+max[0])>1e-5||Math.abs(min[2]+max[2])>1e-5)throw Error('Unnormalized output '+item.name);}
await writeFile(`${out}/inspection.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.outputs.map(o=>({name:o.name,file:o.output.file,bytes:o.output.bytes,triangles:o.output.triangles,bounds:o.output.bounds,trunkOrigin:o.trunkOrigin})),null,2));
