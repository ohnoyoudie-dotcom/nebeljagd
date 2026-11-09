import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpecialWeapons } from '../src/special-weapons.js';

const payload = { type: 'poisonStaff', damage: 18 };
const player = new THREE.Vector3(), origin = new THREE.Vector3(0,1.4,0);
function setup(visible = () => true) {
  const scene = new THREE.Scene();
  const special = createSpecialWeapons(scene, { heightAt: () => 0 }, null, 'player', () => {}, visible);
  const fire = () => { special.beginAim(player,0); special.update(1.2,player,0); special.releasePoison(origin,payload); };
  const land = () => { special.beginAim(player,0); special.releasePoison(origin,payload,{point:new THREE.Vector3(0,0,6)}); };
  return { scene, special, fire, land };
}

test('poison has a tapered physical projectile and a swept ribbon, both hidden by visibility and frozen by pause', () => {
  let visible=true;
  const {scene,special,fire}=setup(()=>visible);
  fire(); special.update(.1,player,.1);
  const thorn=scene.getObjectByName('Giftstab · Venomstachel'), ribbon=scene.getObjectByName('Giftstab · Rauchspur');
  const bounds=new THREE.Box3().setFromBufferAttribute(thorn.children[0].geometry.attributes.position);
  const size=bounds.getSize(new THREE.Vector3());
  assert.ok(size.z>size.x*3 && size.z>size.y*3, 'recognizable long projectile rather than a round orb');
  assert.ok(ribbon.geometry.drawRange.count>0);
  const before=thorn.position.clone(), time=ribbon.material.uniforms.uTime.value;
  special.update(0,player,100);
  assert.deepEqual(thorn.position,before); assert.equal(ribbon.material.uniforms.uTime.value,time);
  visible=false; special.update(.05,player,.15);
  assert.equal(thorn.visible,false); assert.equal(ribbon.visible,false);
  special.reset(); assert.equal(special.telemetry.visuals.activeProjectiles,0);
  assert.equal(scene.getObjectByName(thorn.name),undefined);
  assert.equal(scene.getObjectByName(ribbon.name),undefined);
  special.dispose(); assert.equal(scene.children.length,0);
});

test('one continuous cloud volume fades in/out, has independent age, and releases its resources on expiry and reset', () => {
  const {scene,special,land}=setup();
  land();
  const mesh=scene.getObjectByName('Giftwolke · turbulentes Volumen');
  assert.equal(mesh.geometry.type,'BoxGeometry');
  assert.equal(mesh.parent.children.filter(p=>p.isMesh).length,2,'one volume and the useful ground boundary');
  assert.equal(mesh.material.depthTest,true); assert.equal(mesh.material.depthWrite,false);
  assert.equal(mesh.material.side,THREE.FrontSide,'test the volume entry rather than clipping its exit against the ground');
  assert.equal(mesh.material.uniforms.uFade.value,0);
  special.update(.05,player,.05); assert.equal(mesh.material.uniforms.uFade.value,1,'impact is fully visible within 50ms');
  special.update(.25,player,.3);
  const age=mesh.material.uniforms.uAge.value;
  special.update(0,player,10); assert.equal(mesh.material.uniforms.uAge.value,age);
  land(); const newer=scene.children.filter(p=>p.name==='Giftwolke · 3 Sekunden')[1].children[0];
  assert.notEqual(mesh.material,newer.material);
  assert.equal(newer.material.uniforms.uAge.value,0);
  let disposed=0; mesh.material.addEventListener('dispose',()=>disposed++);
  special.update(2.3,player,2.6);
  assert.ok(mesh.material.uniforms.uFade.value>0 && mesh.material.uniforms.uFade.value<1);
  special.update(.4,player,3); assert.equal(disposed,1);
  assert.equal(special.telemetry.visuals.activeClouds,1,'newer cloud keeps its own lifetime');
  special.reset(); assert.equal(special.telemetry.visuals.activeClouds,0);
  special.dispose(); assert.equal(scene.children.length,0); assert.equal(disposed,1);
});

test('cloud camera uniforms work with scaled world roots and both camera projections', () => {
  const {scene,special,land}=setup(); scene.scale.setScalar(2); land();
  const mesh=scene.getObjectByName('Giftwolke · turbulentes Volumen');
  scene.updateMatrixWorld(true);
  for(const camera of [new THREE.OrthographicCamera(-5,5,5,-5),new THREE.PerspectiveCamera(45,1)]) {
    camera.position.set(3,15,20); camera.lookAt(0,0,12); camera.updateMatrixWorld(true);
    mesh.onBeforeRender(null,scene,camera);
    const uniforms=mesh.material.uniforms;
    assert.equal(uniforms.uOrtho.value,camera.isOrthographicCamera?1:0);
    assert.ok(uniforms.uEye.value.distanceTo(mesh.worldToLocal(camera.position.clone()))<1e-8);
    assert.ok(Math.abs(uniforms.uDirection.value.length()-1)<1e-8);
  }
  special.dispose();
});
