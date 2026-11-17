import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MeshStandardMaterial, Texture, Raycaster, Vector3 } from 'three';
import { createWaldhausStoneSegment, WALDHAUS_STONE_LENGTH } from '../src/waldhaus-stone.js';
import { createWaldhausModel } from '../src/waldhaus-model.js';
import { WALDHAUS_DEFINITION } from '../src/map/waldhaus-definition.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const data = JSON.parse(read('assets/derived/waldhaus-stone/geometry.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} should equal ${b}`);
const sourceKey = i => [...data.positions.slice(i * 3, i * 3 + 3), ...data.uvs.slice(i * 2, i * 2 + 2)].map(Math.fround).join(',');

function checkGeometry(geometry, end) {
  const {position, normal, uv} = geometry.attributes;
  assert.ok(position.count > 0);
  assert.equal(normal.count, position.count);
  assert.equal(uv.count, position.count);
  for (let i = 0; i < position.count; i++) {
    assert.ok([position.getX(i), position.getY(i), position.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i), uv.getX(i), uv.getY(i)].every(Number.isFinite));
    assert.ok(position.getX(i) >= -data.length / 2 - 1e-5 && position.getX(i) <= end + 1e-5);
    assert.ok(position.getY(i) >= -1e-5 && position.getY(i) <= .6 + 1e-5);
    assert.ok(Math.abs(position.getZ(i)) <= .18 + 1e-5);
    close(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)), 1);
    assert.ok(uv.getX(i) >= -1e-5 && uv.getX(i) <= 1 + 1e-5);
    assert.ok(uv.getY(i) >= -1e-5 && uv.getY(i) <= 1 + 1e-5);
  }
}

test('Waldhaus masonry retains the original wall strip coordinates and atlas UVs', () => {
  assert.equal(WALDHAUS_STONE_LENGTH, 6);
  const geometry = createWaldhausStoneSegment(6);
  try {
    checkGeometry(geometry, 3);
    assert.equal(geometry.attributes.position.count, data.indices.length);
    const position = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < data.indices.length; i++) {
      const index = data.indices[i];
      for (let axis = 0; axis < 3; axis++) close(position.array[i * 3 + axis], data.positions[index * 3 + axis]);
      close(uv.getX(i), data.uvs[index * 2]);
      close(uv.getY(i), data.uvs[index * 2 + 1]);
    }
  } finally { geometry.dispose(); }
});

test('Short masonry ends are clipped without stretching retained stones or UVs', () => {
  for (const length of [.25, .65, 1.4, 3.1, 5.95]) {
    const geometry = createWaldhausStoneSegment(length), end = -3 + length;
    try {
      checkGeometry(geometry, end);
      const {position, uv} = geometry.attributes;
      const output = new Set(Array.from({length: position.count}, (_, i) =>
        [position.getX(i), position.getY(i), position.getZ(i), uv.getX(i), uv.getY(i)].join(',')));
      const retained = new Set(data.indices.filter(i => data.positions[i * 3] < end - 1e-6));
      assert.ok(retained.size > 0);
      for (const index of retained) assert.ok(output.has(sourceKey(index)), 'cutting an end must preserve existing position/UV pairs');
    } finally { geometry.dispose(); }
  }
  for (const length of [0, -1, 7, Infinity, NaN]) assert.throws(() => createWaldhausStoneSegment(length), RangeError);
});

test('The derived strip has reproducible source evidence without copying or changing the wall textures', () => {
  const provenance = JSON.parse(read('assets/derived/waldhaus-stone/provenance.json'));
  assert.equal(sha(read(provenance.source.path)), provenance.source.sha256);
  assert.equal(sha(read('assets/derived/waldhaus-stone/' + provenance.geometry.path)), provenance.geometry.sha256);
  assert.equal(sha(read(provenance.preparation.script)), provenance.preparation.scriptSha256);
  assert.equal(provenance.preparation.xScale, 1);
  assert.equal(provenance.preparation.yScale, 1);
  assert.equal(provenance.material.borrowedFrom, 'wall:kit-tripo-wall');
  assert.equal(provenance.material.duplicatedTextureFiles, 0);
  assert.equal(data.indices.length / 3, provenance.geometry.triangles);
  assert.ok(provenance.geometry.triangles <= provenance.geometry.triangleLimit);
  assert.ok(Object.values(provenance.validation).every(value => value === true));
});

test('Disposing one Waldhaus preserves the borrowed original wall material and PBR textures', () => {
  const map = new Texture(), normalMap = new Texture(), roughnessMap = new Texture();
  const source = new MeshStandardMaterial({map, normalMap, roughnessMap, metalnessMap: roughnessMap, color: '#faf8ed'});
  const borrowed = [source, map, normalMap, roughnessMap], released = new Set();
  borrowed.forEach(resource => resource.addEventListener('dispose', () => released.add(resource)));
  const model = createWaldhausModel({stoneMaterial: source});
  try {
    const clones = new Set();
    model.group.traverse(node => {
      for (const material of [node.material].flat().filter(Boolean)) if (material.map === map) {
        clones.add(material);
        assert.notEqual(material, source);
        assert.equal(material.normalMap, normalMap);
        assert.equal(material.roughnessMap, roughnessMap);
        assert.equal(material.metalnessMap, roughnessMap);
        assert.ok(material.color.equals(source.color));
        const colors = node.geometry.attributes.color;
        for (const value of colors.array) assert.equal(value, 1, 'original stone colour must not receive the old green tint');
      }
    });
    assert.equal(clones.size, 1);
    let cloneDisposals = 0;
    clones.forEach(material => material.addEventListener('dispose', () => cloneDisposals++));
    model.dispose(); model.dispose();
    assert.equal(cloneDisposals, 1);
    assert.equal(released.size, 0);
  } finally { model.dispose(); borrowed.forEach(resource => resource.dispose()); }
});

test('Low masonry leaves every exterior and interior doorway open at normal and rotated placement', () => {
  for (const rotation of [0, Math.PI / 2]) {
    const model = createWaldhausModel({rotation});
    model.group.rotation.y = rotation; model.group.updateMatrixWorld(true);
    try {
      const routes = WALDHAUS_DEFINITION.qaRoutes.entrances.concat(WALDHAUS_DEFINITION.qaRoutes.rooms.slice(0, 2));
      for (const route of routes) for (const height of [.2, .45]) for (const offset of [-.55, 0, .55]) {
        const alongX = route.from[0] !== route.to[0];
        const from = new Vector3(route.from[0] + (alongX ? 0 : offset), WALDHAUS_DEFINITION.floorHeight + height, route.from[1] + (alongX ? offset : 0));
        const to = new Vector3(route.to[0] + (alongX ? 0 : offset), from.y, route.to[1] + (alongX ? offset : 0));
        model.group.localToWorld(from); model.group.localToWorld(to);
        const direction = to.clone().sub(from);
        const ray = new Raycaster(from, direction.clone().normalize(), .001, direction.length());
        assert.equal(ray.intersectObject(model.group, true).length, 0, `${route.name}, height ${height}, offset ${offset}, yaw ${rotation}`);
      }
    } finally { model.dispose(); }
  }
});
