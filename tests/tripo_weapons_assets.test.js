import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIPO_WEAPON_DEFINITIONS } from '../src/map/tripo-weapon-definitions.js';

// Inspect the exported bytes, not Blender's export receipt: a wrong export can
// keep its declared name and still contain the original two-million-face mesh.
for (const definition of TRIPO_WEAPON_DEFINITIONS) {
  test(`${definition.variant} is a bounded, textured, self-contained runtime GLB with a reachable tip`, () => {
    const raw = readFileSync(new URL(`../${definition.runtimePath}`, import.meta.url));
    assert.equal(raw.toString('ascii', 0, 4), 'glTF');
    assert.equal(raw.readUInt32LE(4), 2);
    assert.equal(raw.readUInt32LE(8), raw.length);
    assert.ok(raw.length < 5_000_000, 'weapons must not embed their huge upload');
    const gltf = JSON.parse(raw.toString('utf8', 20, 20 + raw.readUInt32LE(12)));
    assert.ok(gltf.meshes?.length > 0 && gltf.materials?.length > 0);
    assert.ok(gltf.buffers.every(buffer => !buffer.uri));
    assert.ok(gltf.images.length >= 3 && gltf.images.every(image => image.bufferView !== undefined && !image.uri),
      'retain embedded base-colour, normal and metallic/roughness maps');
    let triangles = 0;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
      const position = gltf.accessors[primitive.attributes.POSITION];
      triangles += (gltf.accessors[primitive.indices]?.count ?? position.count) / 3;
      assert.notEqual(primitive.attributes.NORMAL, undefined);
      assert.notEqual(primitive.attributes.TEXCOORD_0, undefined);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], position.min[axis]);
        max[axis] = Math.max(max[axis], position.max[axis]);
      }
    }
    assert.ok(triangles > 1000 && triangles <= 16000, `${triangles} triangles`);
    assert.deepEqual(definition.grip, [0, 0, 0]);
    assert.ok(min[1] < -.05 && max[1] > .7, 'grip lies between the pommel and tip');
    assert.ok(Math.abs((max[1] - min[1]) - definition.length) < .04, 'exported metre scale matches its contract');
    assert.ok(definition.tip[1] > .7);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(definition.tip[axis] >= min[axis] - .03 && definition.tip[axis] <= max[axis] + .03,
        'the casting/blade tip must belong to actual exported geometry');
    }
  });
}
