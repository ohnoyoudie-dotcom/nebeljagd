import * as THREE from 'three';

/** Variant 2: seven broad, folded leaves in a curved rosette. One shared
 * mesh per tuft; the existing instanced wind field keeps roots anchored. */
export const HIDING_GRASS_STYLE = Object.freeze({
  sourceVersion: 'nebeljagd-broadleaf-v2', stalksPerInstance: 7, halfWidth: .16,
  height: Object.freeze([1.75, 2.6]), instanceDensity: 4 / (Math.PI * .72),
  nearDistance: 24, lowViewDistance: 34, highViewDistance: 48,
  rootColor: '#3d5731', tipColor: '#91a45f',
});

export function createHidingGrassGeometry({ low = false, rootColor = HIDING_GRASS_STYLE.rootColor, tipColor = HIDING_GRASS_STYLE.tipColor } = {}) {
  const positions = [], colors = [], indices = [], segments = low ? 4 : 8;
  const base = new THREE.Color(rootColor), tip = new THREE.Color(tipColor), tint = new THREE.Color();
  for (let leaf = 0; leaf < 7; leaf++) {
    const offset = positions.length / 3, angle = leaf * 2.399963;
    const c = Math.cos(angle), s = Math.sin(angle), height = [1,.78,.92,.66,.88,.72,.96][leaf];
    const reach = [.58,.72,.50,.82,.64,.75,.55][leaf];
    for (let row = 0; row <= segments; row++) {
      const t = row / segments, width = (.025 + Math.sin(Math.PI * t) ** .8 * HIDING_GRASS_STYLE.halfWidth) * (1-t*t*t);
      const outward = .035 + reach * t * t;
      // The last quarter bends down, rather than ending in an upright spike.
      const y = height * Math.sin(t * Math.PI * .65) / Math.sin(.75 * Math.PI * .65);
      tint.copy(base).lerp(tip, Math.min(1, t*.85 + .06 * (leaf%3)));
      for (const side of [-1,0,1]) {
        positions.push(c*outward - s*width*side, y - (side ? width*.08 : 0) * Math.min(1,t*8), s*outward + c*width*side);
        colors.push(tint.r * (side===1 ? .94 : 1), tint.g * (side===1 ? .94 : 1), tint.b * (side===1 ? .94 : 1));
      }
      if (row < segments) {
        const a=offset+row*3;
        indices.push(a,a+3,a+1, a+1,a+3,a+4, a+1,a+4,a+2, a+2,a+4,a+5);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  geometry.userData = { sourceVersion: HIDING_GRASS_STYLE.sourceVersion, leavesPerTuft: 7, crossedStalks: 7, low };
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
