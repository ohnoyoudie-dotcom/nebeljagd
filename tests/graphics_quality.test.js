import test from 'node:test';
import assert from 'node:assert/strict';
import { isIPadDevice, initialGraphicsQuality, graphicsSettings } from '../src/graphics-quality.js';

test('detect iPadOS Safari on both iPad and Macintosh touch user agents', () => {
  assert.equal(isIPadDevice({userAgent:'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X)',platform:'iPad'}), true);
  assert.equal(isIPadDevice({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:5}), true);
  assert.equal(isIPadDevice({platform:'MacIntel',maxTouchPoints:0}), false);
  assert.equal(isIPadDevice({platform:'Win32',maxTouchPoints:10}), false);
});
test('touch and iPad default to low; explicit high overrides automatic profile', () => {
  assert.equal(initialGraphicsQuality({}), 'high');
  assert.equal(initialGraphicsQuality({iPad:true}), 'low');
  assert.equal(initialGraphicsQuality({coarsePointer:true}), 'low');
  assert.equal(initialGraphicsQuality({iPad:true,requestedQuality:'high'}), 'high');
  assert.equal(initialGraphicsQuality({requestedQuality:'low'}), 'low');
  assert.equal(initialGraphicsQuality({requestedQuality:'ipad'}), 'low');
});
test('iPad low caps GPU resolution and shadow memory without changing desktop quality', () => {
  assert.deepEqual(graphicsSettings('low',{iPad:true,devicePixelRatio:2}), {
    quality:'low',touch:true,pixelRatio:1,shadowMapSize:1024,shadowBlurSamples:8,shadowRadius:1.5,
  });
  assert.deepEqual(graphicsSettings('low',{devicePixelRatio:2}),{
    quality:'low',touch:false,pixelRatio:1.15,shadowMapSize:2048,shadowBlurSamples:14,shadowRadius:2,
  });
  assert.deepEqual(graphicsSettings('high',{devicePixelRatio:2}),{
    quality:'high',touch:false,pixelRatio:1.75,shadowMapSize:4096,shadowBlurSamples:24,shadowRadius:3,
  });
  assert.equal(graphicsSettings('high',{iPad:true,devicePixelRatio:2}).shadowMapSize,2048);
  assert.equal(graphicsSettings('high',{iPad:true,devicePixelRatio:2}).pixelRatio,1.5);
  assert.equal(graphicsSettings('low',{iPad:true,devicePixelRatio:0}).pixelRatio,1);
});
