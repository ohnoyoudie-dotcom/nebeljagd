import * as THREE from 'three';

export const TREE_CANOPY_STYLE = Object.freeze({ minimumOpacity: .045, enterSeconds: .06, leaveSeconds: .32,
  fullFadeRadius: .94, outerFadeRadius: 1.18, opaqueThreshold: .999 });
const smooth = value => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
export const isTreeFoliage = part => Boolean(part.treePart === 'foliage' || part.foliage || part.kitFoliage);
export const canFadeTreeCanopy = part => isTreeFoliage(part) || part.canopyCore === true;

/** Measure the real crown, including its offset from the trunk. */
export function treeCanopyBounds(parts) {
  const bounds = new THREE.Box3();
  for (const part of parts) if (isTreeFoliage(part)) {
    part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox);
  }
  return bounds.isEmpty() ? null : bounds;
}

export function createTreeCanopy(bounds, placement) {
  if (!bounds) return null;
  const [sx, sy, sz] = placement.scale, yaw = placement.rotation;
  const x = (bounds.min.x + bounds.max.x) * .5 * sx, z = (bounds.min.z + bounds.max.z) * .5 * sz;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return { opacity: 1, targetOpacity: 1, underCanopy: false, barkOpacity: 1,
    footprint: { center: [placement.x + cos * x + sin * z, placement.z - sin * x + cos * z],
      radiusX: Math.max(.35, (bounds.max.x - bounds.min.x) * .5 * sx),
      radiusZ: Math.max(.35, (bounds.max.z - bounds.min.z) * .5 * sz), rotation: yaw,
      minY: placement.y + bounds.min.y * sy, maxY: placement.y + bounds.max.y * sy } };
}

export function updateTreeCanopy(canopy, player, dt) {
  const footprint = canopy.footprint, dx = player.x - footprint.center[0], dz = player.z - footprint.center[1];
  const cos = Math.cos(footprint.rotation), sin = Math.sin(footprint.rotation);
  const distance = Math.hypot((cos * dx - sin * dz) / footprint.radiusX, (sin * dx + cos * dz) / footprint.radiusZ);
  // Start at the crown's edge before a fast-moving player disappears beneath
  // it; reach full coverage just inside, without delaying the slower restore.
  const coverage = player.y + .9 < footprint.maxY
    ? 1 - smooth((distance - TREE_CANOPY_STYLE.fullFadeRadius)
      / (TREE_CANOPY_STYLE.outerFadeRadius - TREE_CANOPY_STYLE.fullFadeRadius)) : 0;
  canopy.underCanopy = coverage > .01;
  canopy.targetOpacity = TREE_CANOPY_STYLE.minimumOpacity + (1 - coverage) * (1 - TREE_CANOPY_STYLE.minimumOpacity);
  const duration = canopy.targetOpacity < canopy.opacity ? TREE_CANOPY_STYLE.enterSeconds : TREE_CANOPY_STYLE.leaveSeconds;
  canopy.opacity += (canopy.targetOpacity - canopy.opacity) * -Math.expm1(-Math.max(0, Math.min(.1, dt)) / duration);
  if (Math.abs(canopy.opacity - canopy.targetOpacity) < .0005) canopy.opacity = canopy.targetOpacity;
  return canopy.opacity;
}

/** Cutouts are tested before the fade. The normal pass keeps its original
 * depth behaviour; only the affected instances use real transparent blending. */
export function applyTreeCanopy(material, { transparentPass = false } = {}) {
  if (material.userData.treeCanopy) return material;
  const previous = material.onBeforeCompile, priorKey = material.customProgramCacheKey?.call(material) ?? '';
  material.onBeforeCompile = function(shader, renderer) {
    previous?.call(this, shader, renderer);
    // The old procedural crowns used screen-space stippling around the trunk.
    // Replace that private effect with the same measured, smooth fade as GLBs.
    shader.fragmentShader = shader.fragmentShader.replace(/float canopyDistance =[^;]+;\s*float canopyCoverage =[^;]+;\s*float screenPattern =[^;]+;\s*if\(screenPattern > canopyCoverage\) discard;/g, '');
    shader.vertexShader = `attribute float aTreeCanopyOpacity; varying float vTreeCanopyOpacity;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreeCanopyOpacity = aTreeCanopyOpacity;');
    shader.fragmentShader = `varying float vTreeCanopyOpacity;\n${shader.fragmentShader}`
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        ${transparentPass ? `if (vTreeCanopyOpacity >= .999) discard;
          diffuseColor.a *= vTreeCanopyOpacity;` : 'if (vTreeCanopyOpacity < .999) discard;'}`);
  };
  material.customProgramCacheKey = () => `${priorKey}|tree-canopy-v1:${transparentPass ? 'fade' : 'solid'}`;
  material.userData.treeCanopy = { transparentPass };
  if (transparentPass) {
    material.transparent = true; material.depthWrite = false;
    material.alphaToCoverage = false; material.forceSinglePass = true;
  }
  material.needsUpdate = true;
  return material;
}

/** Clone before installing the opaque-pass hook; Three's clone deliberately
 * drops compile hooks, so preserve the existing wind/biome callbacks explicitly. */
export function createTreeCanopyMaterial(source) {
  const material = source.clone();
  material.onBeforeCompile = source.onBeforeCompile;
  material.customProgramCacheKey = source.customProgramCacheKey;
  return applyTreeCanopy(material, { transparentPass: true });
}

export function writeTreeCanopyOpacity(part, canopies) {
  let changed = false;
  for (let lod = 0; lod < 2; lod++) {
    const geometry = lod === 0 ? part.geometry : part.lowGeometry;
    if (!geometry || lod === 1 && geometry === part.geometry) continue;
    const attribute = geometry.getAttribute('aTreeCanopyOpacity');
    if (!attribute) continue;
    let dirty = false;
    for (let index = 0; index < canopies.length; index++) {
      const value = canopies[index]?.opacity ?? 1;
      if (Math.abs(attribute.getX(index) - value) < .00001) continue;
      attribute.setX(index, value); dirty = true;
    }
    if (dirty) { attribute.needsUpdate = true; changed = true; }
  }
  return changed;
}
