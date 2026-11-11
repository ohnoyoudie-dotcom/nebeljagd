import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { packageWorldBundle } from '../scripts/package-world-bundle.js';

test('the compressed offline bundle preserves every entry and is deterministic', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nebeljagd-bundle-'));
  const names = ['index.html', 'teacher.html', 'lobby.html', 'magebrawl.html', 'nebeljagd.html',
    'map-editor.html', 'editor.html', 'avatar-preview.html', 'worldmap.json', 'worldmap.svg', 'worldmap.schema.json'];
  const expected = new Map(names.map((name, i) => [name, Buffer.concat([
    Buffer.from(`${name}: Zauberstäbe & Gravitationsprojektil\n`.repeat(50)), Buffer.from([i, 0, 255, 128]),
  ])]));
  try {
    for (const [name, bytes] of expected) await writeFile(join(dir, name), bytes);
    await packageWorldBundle(dir);
    const path = join(dir, 'magebrawl-welt-und-editor.zip'), zip = await readFile(path);
    let offset = 0, entries = 0;
    while (zip.readUInt32LE(offset) === 0x04034b50) {
      assert.equal(zip.readUInt16LE(offset + 8), 8, 'standard ZIP deflate remains widely readable');
      const size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26);
      const name = zip.toString('utf8', offset + 30, offset + 30 + nameSize);
      const start = offset + 30 + nameSize + zip.readUInt16LE(offset + 28);
      const bytes = inflateRawSync(zip.subarray(start, start + size));
      assert.equal(crc32(bytes), zip.readUInt32LE(offset + 14));
      assert.equal(bytes.length, zip.readUInt32LE(offset + 22));
      if (name === 'Anleitung.txt') assert.match(bytes.toString(), /map-editor\.html/);
      else { assert.deepEqual(bytes, expected.get(name)); expected.delete(name); }
      offset = start + size; entries++;
    }
    assert.equal(expected.size, 0); assert.equal(entries, names.length + 1);
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    await packageWorldBundle(dir);
    assert.deepEqual(await readFile(path), zip);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
