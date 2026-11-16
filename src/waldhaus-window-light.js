import * as THREE from 'three';
import { WALDHAUS_DEFINITION } from './map/waldhaus-definition.js';

// Source direction in scene space, matching the directional sunlight in main.js.
export const WALDHAUS_SUN_DIRECTION = Object.freeze({ x: -22, y: 42, z: 20 });
const inwardNormal = {
  north: { x: 0, z: 1 }, south: { x: 0, z: -1 },
  east: { x: -1, z: 0 }, west: { x: 1, z: 0 },
};

// Keep the aperture coordinates when clipping, so the blurred frame and crossbar
// shadows retain their shape even when another wall cuts the patch short.
function clipToRoom(polygon, room) {
  for (const [axis, boundary, sign] of [
    ['x', room.minX, 1], ['x', room.maxX, -1],
    ['z', room.minZ, 1], ['z', room.maxZ, -1],
  ]) {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = (a[axis] - boundary) * sign, db = (b[axis] - boundary) * sign;
      if (da >= 0) output.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db), point = {};
        for (const key of ['x', 'z', 'u', 'v']) point[key] = a[key] + (b[key] - a[key]) * t;
        point[axis] = boundary;
        output.push(point);
      }
    }
    polygon = output;
    if (polygon.length < 3) return [];
  }
  return polygon;
}

function lightMaterial(room, opacity) {
  return new THREE.ShaderMaterial({
    name: 'Waldhaus · weiches Fensterlicht',
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: {
      lightColor: { value: new THREE.Color('#f5d99a') },
      lightOpacity: { value: opacity },
      roomBounds: { value: new THREE.Vector4(room.minX, room.maxX, room.minZ, room.maxZ) },
    },
    vertexShader: `
      varying vec2 apertureUv;
      varying vec2 floorPoint;
      varying vec3 vWorld;
      void main() {
        apertureUv = uv;
        floorPoint = position.xz;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 lightColor;
      uniform float lightOpacity;
      uniform vec4 roomBounds;
      varying vec2 apertureUv;
      varying vec2 floorPoint;
      varying vec3 vWorld;
      void main() {
        vec2 edgeDistance = min(apertureUv, 1.0 - apertureUv);
        float penumbra = smoothstep(0.0, 0.14, edgeDistance.x)
                       * smoothstep(0.0, 0.17, edgeDistance.y);
        vec2 wallDistance = min(floorPoint - roomBounds.xz, roomBounds.yw - floorPoint);
        float wallFade = smoothstep(0.0, 0.075, min(wallDistance.x, wallDistance.y));
        vec2 crossDistance = abs(apertureUv - 0.5);
        float mullions = max(1.0 - smoothstep(0.015, 0.065, crossDistance.x),
                            1.0 - smoothstep(0.02, 0.085, crossDistance.y));
        float apertureFalloff = 0.87 + 0.13 * sin(apertureUv.y * 3.14159265);
        float alpha = lightOpacity * penumbra * wallFade * apertureFalloff * (1.0 - 0.23 * mullions);
        gl_FragColor = vec4(lightColor, alpha);
        // Also provides the existing vision.js hook for blindness and sight shading.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Small floor-only sunlight patches from the real glazed apertures. `rotation`
 * is the house's local yaw, `worldRotation` its world root's yaw; `sunDirection`
 * points toward the sun in scene space. Translation and uniform world/model
 * scale do not change the projection. The returned group stays house-local.
 * No lights, textures, animation loop or additional collision meshes are used.
 */
export function createWaldhausWindowLight({
  rotation = 0, worldRotation = 0, sunDirection = WALDHAUS_SUN_DIRECTION,
  definition = WALDHAUS_DEFINITION,
} = {}) {
  const group = new THREE.Group();
  group.name = 'Waldhaus · Fensterlicht';
  const resources = new Set();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    resources.forEach(resource => resource.dispose());
  };
  const yaw = rotation + worldRotation;
  if (![yaw, sunDirection.x, sunDirection.y, sunDirection.z].every(Number.isFinite) || sunDirection.y <= .001) {
    return { group, dispose };
  }
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Inverse Y rotation of the downward ray from sun to ground.
  const ray = {
    x: -c * sunDirection.x + s * sunDirection.z,
    y: -sunDirection.y,
    z: -s * sunDirection.x - c * sunDirection.z,
  };
  const rayLength = Math.hypot(ray.x, ray.y, ray.z);
  for (const window of definition.windows) {
    const normal = inwardNormal[window.side];
    if (!normal) continue;
    const incidence = (ray.x * normal.x + ray.z * normal.z) / rayLength;
    if (incidence <= .025) continue; // No light through the sun-facing back of a wall.
    const room = definition.rooms.find(candidate => {
      const x = window.x + normal.x * .2, z = window.z + normal.z * .2;
      return x > candidate.minX && x < candidate.maxX && z > candidate.minZ && z < candidate.maxZ;
    });
    if (!room) continue;
    // These insets and depth match the glass pane in waldhaus-model.js.
    const apertureWidth = window.width - .24, apertureHeight = window.height - .25;
    if (apertureWidth <= 0 || apertureHeight <= 0) continue;
    const along = { x: normal.z, z: -normal.x };
    const floorY = definition.floorHeight + .004;
    const project = (u, v) => {
      const height = definition.floorHeight + window.sillHeight + .125 + apertureHeight * v;
      const distance = (height - floorY) / -ray.y;
      return {
        x: window.x + normal.x * .135 + along.x * (u - .5) * apertureWidth + ray.x * distance,
        z: window.z + normal.z * .135 + along.z * (u - .5) * apertureWidth + ray.z * distance,
        u, v,
      };
    };
    const polygon = clipToRoom([project(0, 0), project(1, 0), project(1, 1), project(0, 1)], room);
    if (polygon.length < 3) continue;
    const positions = [], uvs = [], indices = [];
    for (const point of polygon) {
      positions.push(point.x, floorY, point.z); uvs.push(point.u, point.v);
    }
    for (let i = 1; i < polygon.length - 1; i++) indices.push(0, i, i + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const material = lightMaterial(room, .27 * Math.sqrt(incidence));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Fensterlicht · ${window.name}`;
    mesh.renderOrder = 1;
    // Decorative light must not become a selectable surface or block gameplay rays.
    mesh.raycast = () => {};
    mesh.userData.windowName = window.name;
    mesh.userData.roomName = room.name;
    mesh.userData.lightRay = { ...ray };
    mesh.userData.windowLight = true;
    resources.add(geometry); resources.add(material);
    group.add(mesh);
  }
  return { group, dispose };
}
