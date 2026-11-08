import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSnowFootprints } from '../src/snow-footprints.js';

function world(snow = true) {
  return {
    heightAt: () => 2,
    biomeAt: () => snow ? 'snow' : 'meadow',
    biomeWeightsAt: () => [{ biome: snow ? 'snow' : 'meadow', weight: 1 }],
  };
}

test('snow footprints use one instanced pool and fade out after ten seconds', () => {
  const root = new THREE.Group(), footprints = createSnowFootprints(root, world(true));
  footprints.update(0, [{ id:'player', x:0, z:0, direction:0, moving:true, speed:4 }]);
  assert.equal(footprints.inspect().count, 0, 'first sample establishes stride origin');
  footprints.update(.2, [{ id:'player', x:0, z:.7, direction:0, moving:true, speed:4 }]);
  assert.equal(footprints.inspect().count, 1);
  assert.equal(footprints.inspect().singleInstancedDraw, true);
  assert.equal(footprints.inspect().alignedToVisualSnowSurface, true);
  assert.equal(footprints.inspect().trackColor, '#cfdadd');
  assert.equal(footprints.inspect().footprintFacingOffsetRadians, Math.PI);
  assert.equal(footprints.inspect().footprintRotationJitterRadians, .04);
  assert.deepEqual(footprints.inspect().footprintScaleVariation, [.96, 1.04]);
  assert.deepEqual(footprints.inspect().footprintIntensityVariation, [.90, 1.08]);
  assert.equal(footprints.inspect().footprintLateralJitterMeters, .016);
  assert.equal(footprints.inspect().recommendedVisualSinkMeters, .22);
  assert.equal(footprints.inspect().wadingMounds, 0, 'no travelling snow ridge is created');
  assert.equal(footprints.inspect().wadingStyle, 'removed');
  assert.equal(footprints.inspect().particlesPerStep, 5);
  assert.equal(footprints.inspect().particleDirection, 'sideways-and-backward');
  assert.ok(footprints.inspect().activeStepParticles > 0, 'a step emits short-lived powder particles');
  assert.ok(footprints.inspect().particleBursts > 0);
  assert.equal(footprints.inspect().fadeStartSeconds, 6);
  assert.equal(footprints.inspect().lifetimeSeconds, 10);
  footprints.update(.3, [{ id:'player', x:0, z:.7, direction:0, moving:false, speed:0 }]);
  assert.equal(footprints.inspect().wadingMounds, 0, 'standing never creates a snow ring');
  footprints.update(7, []);
  assert.equal(footprints.inspect().count, 1, 'print remains while fading');
  assert.equal(footprints.inspect().activeStepParticles, 0, 'powder particles expire quickly');
  assert.ok(footprints.inspect().averageFade > .70 && footprints.inspect().averageFade < .90, 'fade and subtle per-print strength remain bounded');
  footprints.update(10.21, []);
  assert.equal(footprints.inspect().count, 0, 'expired print is removed');
  footprints.dispose();
  assert.equal(root.children.length, 0);
});

test('footprints are not emitted outside snow', () => {
  const root = new THREE.Group(), footprints = createSnowFootprints(root, world(false));
  footprints.update(0, [{ id:'player', x:0, z:0, direction:0, moving:true }]);
  footprints.update(.2, [{ id:'player', x:0, z:.8, direction:0, moving:true }]);
  assert.equal(footprints.inspect().count, 0);
  assert.equal(footprints.inspect().wadingMounds, 0);
  assert.equal(footprints.inspect().activeStepParticles, 0);
  assert.equal(footprints.inspect().particleBursts, 0);
  assert.equal(footprints.weightAt(0, 0), 0);
  footprints.dispose();
});

test('rolling leaves a continuous body-width furrow without soles, then walking resumes normal steps', () => {
  const root=new THREE.Group(), tracks=createSnowFootprints(root,world(true));
  const sample=(z,rolling=true)=>({id:'player',x:0,z,direction:0,moving:true,speed:rolling?9:4,rolling});
  tracks.update(0,[sample(0)]);
  tracks.update(.1,[sample(.8)]);
  tracks.update(.2,[sample(1.6)]);
  const roll=tracks.inspect();
  assert.equal(roll.footprintsCreated,0);
  assert.ok(roll.activeRollSegments>=6,'long frame steps are filled with adjoining track segments');
  assert.equal(roll.singleInstancedDraw,true,'roll and foot marks share the bounded pool');
  const mesh=root.children.find(m=>m.name==='Schneespuren'),matrix=new THREE.Matrix4();
  for(let i=0;i<mesh.count;i++) {
    mesh.getMatrixAt(i,matrix);
    assert.ok(Math.abs(matrix.elements[12])<1e-6,'roll stays centred instead of alternating left/right feet');
    assert.ok(Math.abs(matrix.elements[0])*.38>.70,'track is wider than a boot');
    assert.equal(mesh.geometry.attributes.instanceTrackKind.getX(i),1);
    const distances=mesh.geometry.attributes.instanceRollDistance;
    assert.ok(distances.getY(i)>0);
    if(i>0)assert.ok(Math.abs(distances.getX(i)-distances.getX(i-1)-distances.getY(i-1))<1e-6,
      'irregular scuff pattern continues across frame and segment boundaries');
    assert.equal(mesh.geometry.attributes.instanceTrackCaps.getX(i),i===0?1:i===mesh.count-1?2:0,
      'only the beginning and end fade; interior segments do not create transverse bands');
  }
  tracks.update(.3,[sample(1.7,false)]);
  assert.equal(tracks.inspect().footprintsCreated,0,'transition never adds a trailing sole to the roll');
  tracks.update(.5,[sample(2.4,false)]);
  assert.equal(tracks.inspect().footprintsCreated,1);
  assert.equal(tracks.inspect().activeRollSegments,roll.activeRollSegments);
  tracks.update(11,[]);assert.equal(tracks.inspect().count,0);
  tracks.dispose();
  const dry=createSnowFootprints(new THREE.Group(),world(false));
  dry.update(0,[sample(0)]);dry.update(.2,[sample(2)]);
  assert.equal(dry.inspect().rollSegmentsCreated,0);dry.dispose();
});

test('adjoining roll segments share their edge height on sloped snow without bright gaps',()=>{
  const root=new THREE.Group(),tracks=createSnowFootprints(root,{...world(true),snowSurfaceAt:(x,z)=>2+z*.15+Math.sin(z)*.05});
  tracks.update(0,[{id:'player',x:0,z:0,moving:true,rolling:true}]);
  tracks.update(.1,[{id:'player',x:0,z:1,moving:true,rolling:true}]);
  const mesh=root.children.find(m=>m.name==='Schneespuren'),a=new THREE.Matrix4(),b=new THREE.Matrix4();
  for(let i=1;i<mesh.count;i++) {
    mesh.getMatrixAt(i-1,a);mesh.getMatrixAt(i,b);
    for(const x of [-.19,.19])assert.ok(new THREE.Vector3(x,0,-.32).applyMatrix4(a)
      .distanceTo(new THREE.Vector3(x,0,.32).applyMatrix4(b))<1e-6);
  }
  tracks.dispose();
});
