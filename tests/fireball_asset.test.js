import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../assets/imported/tripo-fireball/', import.meta.url);
const pin = '48be7b6326161097ac628d6d52cede7a3c1f202a3e7a3309741d4144ece02f65';

test('the uploaded flame remains intact and its browser derivative meets its recorded budgets', () => {
  const original = readFileSync(new URL('../assets/inbox/fiery flame 3d model.glb', import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'), pin);
  const report = JSON.parse(readFileSync(new URL('inspection.json', root)));
  const bytes = readFileSync(new URL('runtime/fireball.glb', root));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), report.runtime.sha256);
  assert.equal(report.original.sha256, pin);
  assert.ok(Object.values(report.validation).every(Boolean));
  assert.ok(bytes.length <= 1536 * 1024);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(gltf.buffers.every(b => !b.uri));
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(primitive.attributes[attribute], undefined);
    triangles += (primitive.indices !== undefined ? gltf.accessors[primitive.indices].count : gltf.accessors[primitive.attributes.POSITION].count) / 3;
  }
  assert.equal(triangles, report.runtime.triangles); assert.ok(triangles > 0 && triangles <= 6000);
  for (const material of gltf.materials) {
    assert.ok(material.pbrMetallicRoughness.baseColorTexture);
    assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(material.normalTexture);
  }
  assert.ok(report.textures.every(texture => Math.max(...texture.runtimeSize) <= 512));
});
