import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Scene, Vector3 } from 'three';
import { createWaldhausWindowLight, WALDHAUS_SUN_DIRECTION } from '../src/waldhaus-window-light.js';
import { WALDHAUS_DEFINITION } from '../src/map/waldhaus-definition.js';
import { createVision } from '../src/vision.js';

const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-5, message);

test('Waldhaus window light follows world sunlight at every house rotation', () => {
  for (const rotation of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, -.37]) {
    const light = createWaldhausWindowLight({ rotation });
    try {
      assert.ok(light.group.children.length > 0 && light.group.children.length <= 3);
      const c = Math.cos(rotation), s = Math.sin(rotation);
      for (const mesh of light.group.children) {
        const ray = mesh.userData.lightRay;
        close(c * ray.x + s * ray.z, -WALDHAUS_SUN_DIRECTION.x, 'house yaw must not rotate sunlight');
        close(-s * ray.x + c * ray.z, -WALDHAUS_SUN_DIRECTION.z, 'sunlight must keep its world bearing');
        assert.ok(mesh.material.uniforms.lightOpacity.value < .27, 'wood should stay visible through subtle light');
      }
      if (rotation === 0) assert.deepEqual(light.group.children.map(mesh => mesh.userData.windowName), ['Fenster Hauptraum seitlich']);
      if (rotation === Math.PI / 2) assert.ok(light.group.children.some(mesh => mesh.userData.windowName === 'Fenster Nebenraum 1'));
    } finally { light.dispose(); }
  }
});

test('Waldhaus root yaw and local house yaw compose before projecting sunlight', () => {
  const a = createWaldhausWindowLight({ rotation: .6, worldRotation: -.9 });
  const b = createWaldhausWindowLight({ rotation: -.3 });
  try {
    assert.equal(a.group.children.length, b.group.children.length);
    a.group.children.forEach((mesh, i) => {
      const positions = mesh.geometry.attributes.position.array;
      const expected = b.group.children[i].geometry.attributes.position.array;
      positions.forEach((value, index) => close(value, expected[index], 'combined yaw should give identical patches'));
    });
  } finally { a.dispose(); b.dispose(); }
});

test('Floor light lands where the actual window glass projects along sunlight', () => {
  const light = createWaldhausWindowLight();
  try {
    const mesh = light.group.children[0], position = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    const window = WALDHAUS_DEFINITION.windows.find(value => value.side === 'west');
    for (let i = 0; i < position.count; i++) {
      const heightAbovePatch = window.sillHeight + .125 + (window.height - .25) * uv.getY(i) - .004;
      const time = heightAbovePatch / WALDHAUS_SUN_DIRECTION.y;
      const glassX = window.x + .135;
      const glassZ = window.z - (uv.getX(i) - .5) * (window.width - .24);
      close(position.getX(i), glassX - WALDHAUS_SUN_DIRECTION.x * time, 'glass projects onto the floor along the sun ray');
      close(position.getZ(i), glassZ - WALDHAUS_SUN_DIRECTION.z * time, 'projection must use aperture height and width');
    }
  } finally { light.dispose(); }
});

test('Window projections stay inside their owning room even at a low sun angle', () => {
  let clipped = false;
  for (const sunDirection of [WALDHAUS_SUN_DIRECTION, { x: -20, y: 6, z: 2 }, { x: -20, y: 6, z: -2 }]) {
    for (let rotation = 0; rotation < Math.PI * 2; rotation += .19) {
      const light = createWaldhausWindowLight({ rotation, sunDirection });
      try {
        for (const mesh of light.group.children) {
          const room = WALDHAUS_DEFINITION.rooms.find(value => value.name === mesh.userData.roomName);
          const position = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
          for (let i = 0; i < position.count; i++) {
            const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
            assert.ok([x, y, z, uv.getX(i), uv.getY(i)].every(Number.isFinite));
            assert.ok(x >= room.minX - 1e-6 && x <= room.maxX + 1e-6);
            assert.ok(z >= room.minZ - 1e-6 && z <= room.maxZ + 1e-6);
            close(y, WALDHAUS_DEFINITION.floorHeight + .004, 'light remains on floor');
            assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
            if ([room.minX, room.maxX].some(boundary => Math.abs(boundary - x) < 1e-5)
              || [room.minZ, room.maxZ].some(boundary => Math.abs(boundary - z) < 1e-5)) clipped = true;
          }
        }
      } finally { light.dispose(); }
    }
  }
  assert.ok(clipped, 'test must exercise an actual room-wall clipping case');
});

test('Window light skips the night and never participates in collision raycasts', () => {
  for (const sunDirection of [{ x: -22, y: 0, z: 20 }, { x: 0, y: -42, z: 0 }, { x: NaN, y: 42, z: 0 }]) {
    const light = createWaldhausWindowLight({ sunDirection });
    assert.equal(light.group.children.length, 0);
    light.dispose();
  }
  const light = createWaldhausWindowLight();
  try {
    light.group.updateMatrixWorld(true);
    const mesh = light.group.children[0], point = mesh.geometry.boundingSphere.center.clone();
    const ray = new Raycaster(new Vector3(point.x, 2, point.z), new Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(light.group, true).length, 0);
  } finally { light.dispose(); }
});

test('Window light releases every geometry and material once', () => {
  const light = createWaldhausWindowLight({ rotation: Math.PI / 2 });
  const resources = light.group.children.flatMap(mesh => [mesh.geometry, mesh.material]);
  let disposed = 0;
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
  light.dispose(); light.dispose();
  assert.equal(disposed, resources.length);
});

test('Runtime vision also darkens the window light when the player is blinded', () => {
  const light = createWaldhausWindowLight(), scene = new Scene();
  light.group.userData.visionBlockerSurface = true;
  scene.add(light.group);
  const vision = createVision(scene, { projectileObstacles: [], spawn: { x: 0, z: 0 }, heightAt: () => 0 }, { samples: 16 });
  try {
    assert.equal(vision.stats.materials, light.group.children.length, 'floor patches participate in runtime sight shading');
    const mesh = light.group.children[0], material = mesh.material;
    const shader = { uniforms: {}, vertexShader: material.vertexShader, fragmentShader: material.fragmentShader };
    material.onBeforeCompile(shader);
    mesh.onBeforeRender(null, scene, null, mesh.geometry, material, null);
    vision.setSightLimit(3, { smoke: true });
    assert.equal(shader.uniforms.uBlindRadius.value, 3);
    assert.equal(shader.uniforms.uBlindSmoke.value, 1);
    assert.equal(shader.uniforms.uTacticalBlockerSurface.value, 1, 'same architectural visibility policy as its parent house');
    assert.ok(shader.fragmentShader.includes('gl_FragColor.rgb = applyTacticalSight(gl_FragColor.rgb, vWorld.xz)'));
    vision.setSightLimit();
    assert.equal(shader.uniforms.uBlindRadius.value, 0, 'light recovers with the rest of the scenery');
  } finally { vision.dispose(); light.dispose(); }
});
