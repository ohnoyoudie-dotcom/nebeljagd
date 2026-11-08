import * as THREE from 'three';

export const GOLD_COIN_STYLE = Object.freeze({
  model: 'symmetric-gold-coin', radius: .42, halfDepth: .07,
  tilt: -Math.PI / 4, radiansPerSecond: .32,
});

/** A solid, gently bevelled coin. Mirrored profiles and vertex colours give
 * both faces exactly the same blank centre, inset groove and bright rim.
 * One mesh/material, no texture or external model download is needed. */
export function createGoldCoinGeometry() {
  const face = '#efbf51', groove = '#c18c32', rim = '#ffe095', edge = '#cf962f';
  const half = [
    [0, .052, face], [.325, .052, face], [.342, .052, groove],
    [.354, .07, rim], [.388, .07, rim], [.410, .05, rim], [.42, .025, edge],
  ];
  const profile = [...half.map(([r, z, color]) => [r, -z, color]), ...half.slice().reverse()];
  const geometry = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 64);
  const colors = profile.map(([, , color]) => new THREE.Color(color));
  const values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < geometry.attributes.position.count; i++) colors[i % profile.length].toArray(values, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  // The flat faces lie in XY; the identical reverse is along -Z.
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createGoldCoinMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, metalness: .55, roughness: .32,
    emissive: '#b97c1c', emissiveIntensity: .22,
  });
}
