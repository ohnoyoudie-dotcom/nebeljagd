import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Matrix4, Raycaster, Vector3 } from 'three';
import { CASTLE_DEFINITION } from '../src/map/castle-definition.js';
import { CASTLE_TORCH_LIMIT, createCastleTorches } from '../src/castle-torches.js';

const definition={floorHeight:.18,torches:[
  {id:'west',x:0,z:0,normal:[1,0],height:1.9},
  {id:'east',x:12,z:0,normal:[-1,0],height:1.9},
  {id:'distant',x:90,z:0,normal:[0,1],height:1.9},
]};
const flame=t=>t.group.getObjectByName('Fackelflammen und kleine Glutfunken');
const strengths=t=>Array.from(flame(t).geometry.attributes.aTorch.array).filter((_,i)=>i%2);

test('castle torches have stable detailed mounts with bounded geometry and no leaking point lights',()=>{
  const torches=createCastleTorches({definition:CASTLE_DEFINITION});
  try {
    assert.ok(torches.stats.mounts>=24&&torches.stats.mounts<=CASTLE_TORCH_LIMIT);
    assert.equal(torches.stats.mounts,CASTLE_DEFINITION.torches.length);
    assert.equal(torches.stats.drawCalls,4);assert.ok(torches.stats.triangles<12000);assert.equal(torches.stats.pointLights,0);
    const lights=[];torches.group.traverse(n=>{if(n.isLight)lights.push(n);});assert.deepEqual(lights,[]);
    const model=torches.group.getObjectByName('Geschmiedete Wandhalter'),matrix=new Matrix4(),position=new Vector3();
    CASTLE_DEFINITION.torches.forEach((mount,i)=>{
      model.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
      assert.ok(Math.abs(position.x-mount.x)<1e-5&&Math.abs(position.z-mount.z)<1e-5);
      assert.ok(Math.abs(position.y-CASTLE_DEFINITION.floorHeight-mount.height)<1e-5);
      for(const amount of [.04,1.6,3.18])for(const side of [-1.35,0,1.35]) {
        const x=mount.x+mount.normal[0]*amount-mount.normal[1]*side,z=mount.z+mount.normal[1]*amount+mount.normal[0]*side;
        assert.ok(CASTLE_DEFINITION.footprintAreas.some(a=>x>=a.minX&&x<=a.maxX&&z>=a.minZ&&z<=a.maxZ),'light wash stays on covered corridor floor');
      }
    });
    torches.group.updateMatrixWorld(true);
    assert.equal(new Raycaster(new Vector3(0,4,0),new Vector3(0,-1,0),0,5).intersectObject(torches.group,true).length,0,'decorative torches never obstruct passage ray checks');
  } finally {torches.dispose();}
});

test('torch flame clock freezes with paused simulation even when render time advances',()=>{
  const torches=createCastleTorches({definition});
  try {
    torches.update(.1,200,{x:1,z:0});const material=flame(torches).material;
    assert.equal(material.uniforms.uTime.value,.1);
    for(const time of [201,500,99999])torches.update(0,time,{x:1,z:0});
    assert.equal(material.uniforms.uTime.value,.1);
    torches.update(.1,100000,{x:1,z:0});assert.equal(material.uniforms.uTime.value,.2);
    assert.equal(torches.group.userData.castleTorches.elapsed,.2);
    torches.update(NaN,100001,{x:1,z:0});assert.equal(material.uniforms.uTime.value,.2);
  } finally {torches.dispose();}
});

test('shared visibility gates every flame, ember and surface glow and respects quality range',()=>{
  const torches=createCastleTorches({definition});
  try {
    torches.update(0,0,{x:0,z:0},{isVisible:p=>p.x<5});
    assert.deepEqual(strengths(torches),[1,0,0]);assert.equal(torches.group.userData.castleTorches.activeMounts,1);
    for(const mesh of torches.group.getObjectByName('Schlossanlage · warmes Fackellicht').children) {
      assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.depthWrite,false);
      assert.equal(mesh.geometry.attributes.aTorch,flame(torches).geometry.attributes.aTorch);
    }
    torches.update(0,0,{x:0,z:0},{visible:false,isVisible:()=>true});assert.deepEqual(strengths(torches),[0,0,0]);
    assert.equal(torches.group.getObjectByName('Schlossanlage · warmes Fackellicht').visible,false);
    torches.update(0,0,{x:-33,z:0},{quality:'low',isVisible:()=>true});assert.deepEqual(strengths(torches),[0,0,0]);
    torches.update(0,0,null);assert.deepEqual(strengths(torches),[1,1,1],'editor overview keeps all torches visible');
  } finally {torches.dispose();}
});

test('torch resources remain fixed through repeated animation and dispose exactly once',()=>{
  const torches=createCastleTorches({definition,seed:312}),parent=new Group();parent.add(torches.group);
  const geometries=new Set(),materials=new Set(),meshes=[];
  torches.group.traverse(n=>{if(n.isMesh){meshes.push(n);geometries.add(n.geometry);materials.add(n.material);}});
  const events=new Map();for(const resource of [...geometries,...materials,...meshes])resource.addEventListener('dispose',()=>events.set(resource,(events.get(resource)??0)+1));
  const attribute=flame(torches).geometry.attributes.aTorch,buffer=attribute.array;
  for(let i=0;i<500;i++)torches.update(1/60,i,{x:i%70,z:0},{isVisible:p=>p.x>5});
  assert.equal(flame(torches).geometry.attributes.aTorch,attribute);assert.equal(attribute.array,buffer);
  assert.ok(Array.from(buffer).every(Number.isFinite));
  torches.dispose();torches.dispose();torches.update(1,999,null);
  for(const resource of [...geometries,...materials,...meshes])assert.equal(events.get(resource),1);
  assert.equal(parent.children.length,0);
});
