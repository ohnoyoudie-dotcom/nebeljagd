import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Small, original modular scenery. Local X is the repeat direction; nothing
 * extends beyond ±2 m, so drawn passages keep their authored width. Geometry
 * is merged once per loaded variant and shared by the existing instance batches. */
export function createBarrierModelParts(variant) {
  if (!['kit-cut-stone', 'kit-cross-wood'].includes(variant)) return null;
  const pieces = [];
  function add(geometry, color, x, y, z, angle = 0) {
    const painted = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    painted.rotateZ(angle); painted.translate(x, y, z);
    const tint = new THREE.Color(color), colors = new Float32Array(painted.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
    painted.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    painted.deleteAttribute('uv'); pieces.push(painted);
  }
  function box(x, y, z, w, h, d, color, bevel = .02, angle = 0) {
    add(new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w / 4, h / 4, d / 4)), color, x, y, z, angle);
  }
  if (variant === 'kit-cut-stone') {
    // A recessed mortar core and staggered dressed blocks provide depth on both
    // faces. The cooler cap and taller half-piers distinguish this from rubble.
    box(0, .87, 0, 4, 1.58, .55, '#62635b', .01);
    box(0, .09, 0, 4, .18, .76, '#777d72');
    const shades = ['#b7ad92', '#a69f87', '#c0b59b', '#aca58c', '#b1aa92'];
    for (let row = 0; row < 4; row++) {
      const divisions = row % 2 ? [-1.8, -1.35, -.45, .45, 1.35, 1.8] : [-1.8, -.9, 0, .9, 1.8];
      for (let i = 1; i < divisions.length; i++) {
        const a = divisions[i - 1], b = divisions[i];
        box((a + b) / 2, .2 + row * .36 + .17, 0, b - a - .026, .334, .65,
          shades[(row * 3 + i) % shades.length], .026);
      }
    }
    for (let i = 0; i < 4; i++) box(-1.5 + i, 1.72, 0, .984, .16, .78, '#879286', .03);
    for (const sign of [-1, 1]) {
      for (let row = 0; row < 5; row++) box(sign * 1.9, .19 + row * .34, 0, .2, .32, .78, shades[(row + 2) % 5], .015);
      box(sign * 1.88, 1.8, 0, .24, .18, .88, '#707e73', .018);
      box(sign * 1.89, 1.97, 0, .22, .16, .82, '#9da58e', .018);
    }
  } else {
    // Open cross-bracing and warm timber, with dark straps and visible pegged
    // joints. This is deliberately a different silhouette, not a recolour.
    for (const sign of [-1, 1]) {
      box(sign * 1.92, .735, 0, .16, 1.47, .34, '#775033', .026);
      box(sign * 1.9, 1.495, 0, .2, .11, .44, '#a47846', .025);
      for (const y of [.3, 1.22]) box(sign * 1.918, y, 0, .164, .08, .355, '#494b43', .008);
    }
    for (const y of [.36, 1.26]) {
      box(0, y, 0, 3.84, .19, .18, '#a97b48', .022);
      for (const sign of [-1, 1]) {
        // Thin raised grain, read as carved streaks rather than a flat block.
        box(-.15, y - .035, sign * .092, 3.35, .012, .008, '#805634', .002);
        box(.25, y + .035, sign * .092, 2.8, .009, .008, '#bc9058', .002);
      }
    }
    const run = 3.62, rise = .84, diagonal = Math.hypot(run, rise);
    for (const sign of [-1, 1]) box(0, .81, sign * .067, diagonal, .125, .12,
      sign > 0 ? '#bf9359' : '#8f633d', .016, sign * Math.atan2(rise, run));
    for (const x of [-1.79, 0, 1.79]) for (const sign of [-1, 1]) {
      const ys = x === 0 ? [.81] : [.36, 1.26];
      for (const y of ys) {
        const peg = new THREE.CylinderGeometry(.027, .027, .025, 6).rotateX(Math.PI / 2);
        add(peg, '#45473e', x, y, sign * .145);
      }
    }
  }
  const geometry = mergeGeometries(pieces);
  pieces.forEach(piece => piece.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88 });
  return [{ geometry, material, castShadow: true, interior: false, vegetationTint: false }];
}
