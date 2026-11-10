import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { relative, resolve, join, sep } from 'node:path';

const root = 'assets/effects/gravity-reference/';
const manifest = JSON.parse(await readFile(root + 'manifest.json', 'utf8'));
assert.equal(manifest.id, 'gravity-reference-v1');
const entries = await readdir(root, { recursive: true, withFileTypes: true });
assert.ok(entries.every(entry => entry.isFile() || entry.isDirectory()), 'No linked or special package files');
const paths = entries.filter(entry => entry.isFile()).map(entry =>
  relative(resolve(root), resolve(join(entry.parentPath, entry.name))).split(sep).join('/'))
  .filter(path => path !== 'manifest.json').sort();
assert.deepEqual(paths, manifest.files.map(file => file.path).sort(), 'Closed effect package roster');
for (const file of manifest.files) {
  assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
  const bytes = await readFile(root + file.path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
let encodedBytes = 0, decodedMipBytes = 0;
for (const texture of manifest.runtime) {
  const bytes = await readFile(root + texture.path);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  let size;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), data = offset + 8;
    assert.ok(data + length <= bytes.length);
    if (tag === 'VP8X') { size = [bytes.readUIntLE(data + 4, 3) + 1, bytes.readUIntLE(data + 7, 3) + 1, Boolean(bytes[data] & 16)]; break; }
    if (tag === 'VP8 ') { assert.equal(bytes.toString('hex', data + 3, data + 6), '9d012a'); size = [bytes.readUInt16LE(data + 6) & 16383, bytes.readUInt16LE(data + 8) & 16383, false]; break; }
    if (tag === 'VP8L') { const bits = bytes.readUInt32LE(data + 1); size = [(bits & 16383) + 1, ((bits >>> 14) & 16383) + 1, Boolean(bits >>> 28 & 1)]; break; }
    offset = data + length + (length % 2);
  }
  assert.deepEqual(size, [texture.width, texture.height, texture.alpha], texture.path);
  assert.ok(texture.width <= 1024 && texture.height <= 1024);
  encodedBytes += bytes.length; decodedMipBytes += texture.width * texture.height * 4 * 4 / 3;
}
assert.equal(manifest.runtime.length, 3);
assert.ok(encodedBytes <= manifest.budgets.encodedBytes && manifest.budgets.encodedBytes <= 512 * 1024);
assert.ok(decodedMipBytes <= manifest.budgets.decodedMipBytes && manifest.budgets.decodedMipBytes <= 8 * 1024 * 1024);
console.log(JSON.stringify({ status: 'passed', package: manifest.id, textures: 3,
  encodedBytes, decodedMipBytes: Math.ceil(decodedMipBytes), note: 'Integrity and image-header budgets; GPU and visual checks run in the generated game.' }));
