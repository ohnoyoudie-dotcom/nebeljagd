import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSnowCover } from '../src/snow-cover.js';

function spatial(snow = true) {
  return {
    isLand: () => true,
    isWater: () => false,
    biomeWeightsAt: () => [{ biome: snow ? 'snow' : 'meadow', weight: 1 }],
  };
}

const map = { paths: [], rivers: [], objects: [] };

test('snow cover creates depth-writing powder instances only in snow', () => {
  const root = new THREE.Group();
  const cover = createSnowCover(root, { map, heightAt: () => 2, spatial: spatial(true), quality: 'high' });
  cover.update(0, new THREE.Vector3(0, 2, 0));
  const state = cover.inspect();
  assert.equal(state.enabled, true);
  assert.equal(state.depthWriting, true);
  assert.equal(state.collisionIndependent, true);
  assert.ok(state.visibleInstances > 0);
  assert.equal(state.layerStyle, 'overlapping-irregular-powder-with-wind-drifts');
  assert.equal(state.nominalSurfaceDepthMeters, .19);
  assert.equal(state.multiScaleSurface, true);
  assert.equal(state.windShading, true);
  assert.ok(state.broadDriftAmplitudeMeters > state.fineDriftAmplitudeMeters);
  assert.ok(cover.surfaceHeightAt(0, 0) > 2.14);
  cover.dispose();
  assert.equal(root.children.length, 0);
});

test('snow cover emits no powder instances outside snow', () => {
  const root = new THREE.Group();
  const cover = createSnowCover(root, { map, heightAt: () => 2, spatial: spatial(false), quality: 'low' });
  cover.update(0, new THREE.Vector3(0, 2, 0));
  assert.equal(cover.inspect().visibleInstances, 0);
  assert.equal(cover.weightAt(0, 0), 0);
  cover.dispose();
});
