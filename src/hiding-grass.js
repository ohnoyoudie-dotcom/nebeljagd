import * as THREE from 'three';

/** The broad crossed blade and four vertical sections come from the preserved
 * v011 world.js. Four offset stalks restore its close-set meadow appearance
 * without multiplying island-wide instance matrices. */
export const HIDING_GRASS_STYLE = Object.freeze({
  sourceVersion: 'nebeljagd-3d-v011', stalksPerInstance: 4, halfWidth: .14,
  height: Object.freeze([2.25, 2.6]), instanceDensity: 20 / (Math.PI * .72),
  nearDistance: 24, lowViewDistance: 34, highViewDistance: 48,
  rootColor: '#315e36', tipColor: '#bbc975',
});

export function createHidingGrassGeometry({ low = false, rootColor = HIDING_GRASS_STYLE.rootColor, tipColor = HIDING_GRASS_STYLE.tipColor } = {}) {
  const positions = [], colors = [], indices = [];
  const segments = low ? 2 : 4;
  const base = new THREE.Color(rootColor), tip = new THREE.Color(tipColor);
  const tint = new THREE.Color();
  const stalks = [
    [-.17, -.13, 1, -.35], [.15, .13, 1, .48], [.15, -.16, 1, 1.04], [-.14, .16, 1, -.88],
  ];
  for (const [x, z, height, yaw] of stalks) for (let plane = 0; plane < 2; plane++) {
    const offset = positions.length / 3, angle = yaw + plane * Math.PI / 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (let row = 0; row <= segments; row++) {
      const t = row / segments, halfWidth = HIDING_GRASS_STYLE.halfWidth * (1 - t);
      // Retain the original gently bent blade, with small variation per stalk.
      const bend = t * t * (.08 + Math.abs(yaw) * .035);
      const gradient = t * t * (3 - 2 * t);
      tint.copy(base).lerp(tip, gradient);
      for (const side of [-1, 1]) {
        const along = side * halfWidth + bend;
        positions.push(x + along * cos, t * height, z + along * sin);
        colors.push(tint.r, tint.g, tint.b);
      }
      if (row < segments) { const a = offset + row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  geometry.userData = { sourceVersion: HIDING_GRASS_STYLE.sourceVersion, crossedStalks: 4, low };
  return geometry;
}

/** Grass is local detail. Coarse geometry keeps the same stalks and height, so
 * performance mode does not turn a hiding place back into sparse short grass. */
export function hidingGrassDetail(player, bounds, quality = 'high') {
  const dx = Math.max(bounds.min.x - player.x, 0, player.x - bounds.max.x);
  const dz = Math.max(bounds.min.z - player.z, 0, player.z - bounds.max.z);
  const distance = Math.hypot(dx, dz);
  return {
    visible: distance < (quality === 'low' ? HIDING_GRASS_STYLE.lowViewDistance : HIDING_GRASS_STYLE.highViewDistance),
    low: quality === 'low' || distance > HIDING_GRASS_STYLE.nearDistance,
  };
}
