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
  assert.ok(footprints.inspect().averageFade > .79 && footprints.inspect().averageFade < .81, 'fade is gradual between 6 and 10 seconds');
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
