import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GOLD_COIN_STYLE = Object.freeze({
  model: 'symmetric-gold-coin', radius: .21, halfDepth: .035,
  emblem: 'wizard-hat', emblemSides: 2,
  tilt: -Math.PI / 4, radiansPerSecond: .32,
});

/** A solid, gently bevelled coin. Mirrored profiles and vertex colours give
 * both faces the same small wizard-hat relief, inset groove and bright rim.
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

  // A simple, symmetric silhouette stays readable at pickup size. Modelling
  // it on both faces avoids an empty or different reverse while the coin turns.
  const hat = new THREE.Shape();
  hat.moveTo(-.12, -.075); hat.lineTo(0, .235); hat.lineTo(.12, -.075);
  hat.bezierCurveTo(.27, -.085, .28, -.16, 0, -.17);
  hat.bezierCurveTo(-.28, -.16, -.27, -.085, -.12, -.075);
  const relief = new THREE.ExtrudeGeometry(hat, { depth: .012, bevelEnabled: true,
    bevelSegments: 1, bevelSize: .006, bevelThickness: .003, steps: 1, curveSegments: 8 });
  relief.translate(0, 0, .054);
  const bronze = new THREE.Color('#986025'), band = new THREE.Color('#ffe095');
  const reliefColors = new Float32Array(relief.attributes.position.count * 3);
  for (let i = 0; i < relief.attributes.position.count; i++) {
    const normalZ = relief.attributes.normal.getZ(i);
    (Math.abs(normalZ) < .5 ? band : bronze).toArray(reliefColors, i * 3);
  }
  relief.setAttribute('color', new THREE.BufferAttribute(reliefColors, 3));
  const reverse = relief.clone(); reverse.scale(1, 1, -1);
  // Reflect the relief with matching normals, then restore outward winding.
  for (const attribute of Object.values(reverse.attributes)) {
    for (let i = 0; i < attribute.count; i += 3) for (let axis = 0; axis < attribute.itemSize; axis++) {
      const a = (i + 1) * attribute.itemSize + axis, b = (i + 2) * attribute.itemSize + axis;
      [attribute.array[a], attribute.array[b]] = [attribute.array[b], attribute.array[a]];
    }
  }
  const disc = geometry.toNonIndexed();
  const result = mergeGeometries([disc, relief, reverse]);
  result.scale(.5, .5, .5);
  result.computeBoundingBox(); result.computeBoundingSphere();
  geometry.dispose(); disc.dispose(); relief.dispose(); reverse.dispose();
  return result;
}

export function createGoldCoinMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, metalness: .55, roughness: .32,
    emissive: '#b97c1c', emissiveIntensity: .22,
  });
}
