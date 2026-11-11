import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGravityVortex, gravityVortexMotion } from '../src/gravity-vortex.js';
import { GRAVITY_RULES as rules } from '../src/gravity-spell.js';

test('the vortex accelerates inward continuously as its sphere rises and grows, independent of frame rate', () => {
  const start = gravityVortexMotion(rules.warning, rules);
  assert.ok(start.spinSpeed < .25, 'rotation starts very gently');
  assert.ok(gravityVortexMotion(rules.warning + 1, rules).spinSpeed < 1.2,
    'the first second stays slower than the previous immediate rotation');
  let previous = start;
  for (let i = 1; i <= 60; i++) {
    const now = gravityVortexMotion(rules.warning + rules.pullDuration * i / 60, rules);
    assert.ok(now.spin > previous.spin && now.spinSpeed > previous.spinSpeed);
    assert.ok(now.sphereHeight > previous.sphereHeight);
    if (i / 60 <= .94) assert.ok(now.sphereRadius > previous.sphereRadius);
    else assert.ok(now.sphereRadius < previous.sphereRadius, 'energy contracts just before release');
    // In a*5+r*19+spin*5, keeping the spiral phase fixed moves r inward.
    assert.ok(-(now.spin - previous.spin) * 5 / 19 < 0);
    previous = now;
  }
  assert.ok(previous.spinSpeed > start.spinSpeed * 8);
  assert.ok(previous.sphereHeight > 1.6 && previous.sphereRadius > .6);
  assert.deepEqual(gravityVortexMotion(rules.warning + rules.pullDuration, rules), previous);
  const justBefore = gravityVortexMotion(rules.warning + rules.pullDuration - .000001, rules);
  const justAfter = gravityVortexMotion(rules.warning + rules.pullDuration + .000001, rules);
  assert.ok(justAfter.spin > justBefore.spin && justAfter.spin - justBefore.spin < .00003,
    'burst does not reset the rotation or its velocity');
});

test('a shallow filled surface follows terrain once per placement without deforming the map', () => {
  const parent = new THREE.Group(); let samples = 0;
  const heightAt = (x, z) => { samples++; return x * .03 + z * .02; };
  const vortex = createGravityVortex(parent, rules, { heightAt });
  const center = new THREE.Vector3(10, .7, 20);
  vortex.update(center, .8);
  const surface = parent.getObjectByName('Gravitationsfeld · gefärbter Bodenstrudel');
  const attribute = surface.geometry.attributes.position;
  assert.ok(attribute.count < 2500 && surface.material.forceSinglePass);
  const bounds = new THREE.Box3().setFromBufferAttribute(attribute);
  assert.ok(bounds.max.x > rules.radius * 1.1 && bounds.max.x <= rules.radius * 1.17,
    'small soft wisps fit inside a restrained outer margin');
  for (let i = 0; i < attribute.count; i++) {
    const relativeHeight = attribute.getY(i) - ((center.x + attribute.getX(i)) * .03
      + (center.z + attribute.getZ(i)) * .02 - center.y);
    assert.ok(relativeHeight >= .024 && relativeHeight <= .286);
  }
  const firstSamples = samples;
  vortex.update(center, 1.1); assert.equal(samples, firstSamples, 'no repeated terrain sampling per frame');
  center.x++; vortex.update(center, 1.1); assert.equal(samples, firstSamples * 2);
  assert.equal(vortex.telemetry.surfaceOpacity, .97);
  vortex.dispose(); assert.equal(parent.children.length, 0);
});

test('the raised sphere pops into one bounded instance batch, then every reusable buffer is released once', () => {
  const parent = new THREE.Group(), center = new THREE.Vector3();
  const vortex = createGravityVortex(parent, rules);
  vortex.update(center, rules.warning + rules.pullDuration - .1);
  const before = vortex.telemetry;
  assert.ok(before.sphereVisible && before.shellCount === 0);
  const sphere = parent.getObjectByName('Gravitationsfeld · Singularität');
  const shell = parent.getObjectByName('Gravitation · zerplatzende Kugelschale');
  const geometries = new Set(parent.children.map(object => object.geometry));
  let disposed = 0; geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposed++));
  vortex.update(center, rules.warning + rules.pullDuration + .05);
  assert.equal(sphere.visible, false); assert.equal(shell.count, 24);
  assert.equal(vortex.telemetry.capVisible, false, 'the complete ball breaks apart without an intact hemisphere lingering');
  assert.ok(vortex.telemetry.sphereHeight >= before.sphereHeight);
  const matrix = Array.from(shell.instanceMatrix.array);
  vortex.update(center, rules.warning + rules.pullDuration + .05);
  assert.deepEqual(Array.from(shell.instanceMatrix.array), matrix, 'same simulation age freezes every fragment');
  vortex.update(center, rules.warning + rules.pullDuration + rules.afterglow);
  assert.equal(vortex.telemetry.capVisible, false);
  assert.equal(shell.count, 0); assert.ok(vortex.telemetry.surfaceOpacity < 1e-10);
  vortex.dispose(); vortex.dispose(); assert.equal(disposed, geometries.size); assert.equal(parent.children.length, 0);
});

test('reference maps are borrowed, retained through casts, and never disposed with one vortex', () => {
  const parent = new THREE.Group(), center = new THREE.Vector3();
  const textures = { ground: new THREE.Texture(), orb: new THREE.Texture() };
  let disposed = 0; Object.values(textures).forEach(map => map.addEventListener('dispose', () => disposed++));
  const vortex = createGravityVortex(parent, rules, { textures });
  vortex.update(center, .8);
  assert.equal(vortex.telemetry.artwork, 'gravity-reference-v1');
  assert.equal(parent.getObjectByName('Gravitationsfeld · gefärbter Bodenstrudel').material.uniforms.uGround.value, textures.ground);
  assert.equal(parent.getObjectByName('Gravitationsfeld · Singularität').material.uniforms.uOrb.value, textures.orb);
  vortex.dispose(); assert.equal(disposed, 0, 'the app owns the maps across restarts');
  Object.values(textures).forEach(map => map.dispose()); assert.equal(disposed, 2);
});
