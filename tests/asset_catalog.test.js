import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OBJECT_CATALOG, makeWorldObject } from '../src/map/objects.js';
import { ASSET_CATALOG, getVariantAsset, getVariantPreviewSvg } from '../src/map/asset-catalog.js';

const projectFile = path => new URL(`../${path}`, import.meta.url);
const thumbnails = JSON.parse(readFileSync(projectFile('assets/catalog/preview-manifest.json'), 'utf8'));

test('every selectable map variant maps to an existing renderer and its real model source', () => {
  const variants = OBJECT_CATALOG.flatMap(definition => definition.variants.map(variant => ({ kind: definition.kind, variant })));
  assert.equal(ASSET_CATALOG.length, variants.length);
  assert.equal(new Set(ASSET_CATALOG.map(asset => asset.id)).size, variants.length);
  for (const { kind, variant } of variants) {
    const asset = getVariantAsset(kind, variant.id);
    assert.ok(asset, `${kind}:${variant.id}`);
    assert.equal(variant.assetId, asset.id);
    assert.equal(asset.status, 'available');
    assert.ok(existsSync(projectFile(asset.renderer)), asset.renderer);
    for (const source of asset.sourcePaths) assert.ok(existsSync(projectFile(source)), source);
    if (asset.companion) assert.ok(existsSync(projectFile(asset.companion)), asset.companion);
    const object = makeWorldObject(kind, [30, -42], { variant: variant.id });
    assert.equal(object.variant, asset.variant);
    assert.equal(object.assetId, undefined, 'map format does not duplicate implementation metadata');
  }
});

test('embedded thumbnails are exact, real WebP renders for every variant and stay offline', () => {
  assert.equal(thumbnails.variants.length, ASSET_CATALOG.length);
  assert.deepEqual(thumbnails.errors, []);
  for (const record of thumbnails.variants) {
    const bytes = readFileSync(projectFile(record.file));
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    const svg = getVariantPreviewSvg(record.kind, record.variant);
    assert.ok(svg.startsWith('<svg'));
    const match = svg.match(/href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
    assert.ok(match, `${record.kind}:${record.variant} must embed its picture`);
    assert.deepEqual(Buffer.from(match[1], 'base64'), bytes);
    assert.ok(!/<script|foreignObject|onload=|onerror=/.test(svg));
  }
});

test('unknown imported variant strings cannot become executable preview markup or external URLs', () => {
  for (const variant of ['__proto__', 'constructor', '"><script>alert(1)</script>', 'https://outside.example/model.glb']) {
    assert.equal(getVariantAsset('tree', variant), null);
    assert.equal(getVariantPreviewSvg('tree', variant), '');
  }
  assert.equal(getVariantPreviewSvg('unknown', 'oak'), '');
  const grass = getVariantAsset('grass', 'tall');
  assert.equal(grass.format, 'procedural');
  assert.ok(!grass.sourcePaths.some(path => path.includes('grassGN3_3_v2_Rei.glb')), 'source without grass blades is not advertised as the grass model');
});
