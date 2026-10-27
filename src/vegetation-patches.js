import * as THREE from 'three';
import { vegetationSettings } from './map/landscape.js';

export const MAX_GRASS_INSTANCES = 500000;
export const MAX_KIT_GRASS_INSTANCES = 12000;
export const VEGETATION_BASE_HEIGHTS = Object.freeze({ short: .32, meadow: .85, tall: 2.425,
  dry: 1.05, forest: .6, swamp: 1.65, flowers: .6 });
export function vegetationSeed(text) { let seed = 2166136261; for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619); return seed >>> 0; }
function randomSource(seed) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }
const clamp = THREE.MathUtils.clamp;

/** Returns a stable detail field, never new world objects. An old patch keeps
 * its exact seeds, height and density until the user changes its settings. */
export function buildVegetationPatch(object, { budget = MAX_GRASS_INSTANCES } = {}) {
  const [x, z] = object.position, radius = object.radius ?? 3.5, scale = object.scale ?? 1;
  const configured = Boolean(object.vegetation), settings = vegetationSettings(object);
  const tall = object.variant === 'tall', aspect = .72;
  const renderVariant = configured && ['meadow', 'tall', 'dry', 'swamp'].includes(settings.type) ? 'tall' : configured ? 'short' : object.variant;
  const baseCount = configured ? Math.round(radius * radius * (renderVariant === 'tall' ? 20 : 13) * settings.density)
    : Math.max(30, Math.round(radius * radius * (tall ? 20 : 13)));
  const count = Math.max(0, Math.min(1800, baseCount, budget));
  const seed = vegetationSeed(object.id) ^ (configured ? settings.seed >>> 0 : 0), r = randomSource(seed);
  const meanHeight = configured ? VEGETATION_BASE_HEIGHTS[settings.type] * settings.height : tall ? 2.425 : .32;
  const patch = { id: object.id, x, z, radius: radius * scale, aspect, yaw: object.rotation ?? 0,
    height: meanHeight * scale, minBladeHeight: Infinity, maxBladeHeight: 0,
    crossedStalksPerInstance: renderVariant === 'tall' ? 4 : 1, variant: object.variant,
    type: configured ? settings.type : tall ? 'tall' : 'short', settings: configured ? settings : null,
    instanceCount: 0, crossedStalkCount: 0, requestedInstances: Math.min(1800, baseCount),
    budgetLimited: count < Math.min(1800, baseCount), renderVariant,
    rootAnchored: true, colorSamples: [], rootHeightRange: [Infinity, -Infinity] };
  const instances = [], phase = (seed >>> 0) / 4294967296 * Math.PI * 2;
  const c = Math.cos(object.rotation ?? 0), s = Math.sin(object.rotation ?? 0);
  let attempts = 0;
  while (instances.length < count && attempts++ < Math.max(1, count * 8)) {
    const angle = r() * Math.PI * 2, normalizedRadius = Math.sqrt(r());
    if (configured && settings.edgeSoftness > 0) {
      const edge = 1 - settings.edgeSoftness * (.1 + .06 * Math.sin(angle * 3 + phase) + .04 * Math.cos(angle * 7 - phase));
      if (normalizedRadius > edge) continue;
      const feather = Math.min(1, (edge - normalizedRadius) / Math.max(.001, settings.edgeSoftness * .28));
      if (r() > feather) continue;
    }
    const reach = normalizedRadius * radius * scale;
    const px = Math.cos(angle) * reach, pz = Math.sin(angle) * reach * aspect;
    const position = [x + c * px + s * pz, z - s * px + c * pz];
    const bladeHeight = configured ? meanHeight * (1 + (r() * 2 - 1) * settings.heightVariation)
      : tall ? 2.25 + r() * .35 : .22 + r() * .2;
    const bladeWidth = configured
      ? (settings.type === 'dry' ? .5 : settings.type === 'swamp' ? .75 : renderVariant === 'tall' ? 1 : .75) + r() * .65
      : (tall ? 1 : .75) + r() * .65;
    const rotation = r() * Math.PI * 2;
    patch.minBladeHeight = Math.min(patch.minBladeHeight, bladeHeight * scale);
    patch.maxBladeHeight = Math.max(patch.maxBladeHeight, bladeHeight * scale);
    instances.push({ position, scale: [bladeWidth, bladeHeight, bladeWidth], rotation });
  }
  patch.instanceCount = instances.length; patch.crossedStalkCount = instances.length * patch.crossedStalksPerInstance;
  if (!instances.length) { patch.minBladeHeight = patch.maxBladeHeight = 0; patch.rootHeightRange = [0, 0]; }
  return { patch, instances, settings, configured, renderVariant };
}

/** The imported kit is a whole authored cluster, not one procedural stalk.
 * Tile a few real GLB clusters inside the editable patch to retain its colours
 * and silhouette without multiplying its 1,248 triangles by blade counts. */
export function buildKitGrassPatch(object, definition, { budget = MAX_GRASS_INSTANCES } = {}) {
  const settings = vegetationSettings(object), configured = Boolean(object.vegetation);
  const [x, z] = object.position, radius = object.radius ?? 3.5, scale = object.scale ?? 1;
  const count = Math.max(0, Math.min(80, Math.round(Math.max(1, radius * radius * .9) * settings.density), Math.floor(budget / 10)));
  const r = randomSource(vegetationSeed(object.id) ^ settings.seed), instances = [];
  const width = Math.min(1, radius / Math.max(definition.footprint.halfWidth, definition.footprint.halfDepth));
  const reachLimit = Math.max(0, radius - Math.max(definition.footprint.halfWidth, definition.footprint.halfDepth) * width * .65);
  const c = Math.cos(object.rotation), s = Math.sin(object.rotation);
  const patch = { id: object.id, x, z, radius: radius * scale, aspect: .72, yaw: object.rotation,
    variant: 'tall', assetVariant: 'kit-tall', type: 'tall', renderVariant: 'kit-tall',
    height: definition.targetHeight * settings.height * scale,
    minBladeHeight: Infinity, maxBladeHeight: 0, settings: configured ? settings : null,
    instanceCount: count, crossedStalksPerInstance: 0, crossedStalkCount: 0,
    modelTrianglesPerInstance: 1248, requestedInstances: Math.min(80, Math.round(Math.max(1, radius * radius * .9) * settings.density)),
    budgetLimited: false, rootAnchored: true, colorSamples: [], rootHeightRange: [Infinity, -Infinity] };
  patch.budgetLimited = count < patch.requestedInstances;
  for (let i = 0; i < count; i++) {
    const angle = r() * Math.PI * 2, reach = Math.sqrt(r()) * reachLimit * scale;
    const dx = Math.cos(angle) * reach, dz = Math.sin(angle) * reach * .72;
    const position = [x + c * dx + s * dz, z - s * dx + c * dz];
    const height = settings.height * (configured ? 1 + (r() * 2 - 1) * settings.heightVariation : 1);
    patch.minBladeHeight = Math.min(patch.minBladeHeight, definition.targetHeight * height * scale);
    patch.maxBladeHeight = Math.max(patch.maxBladeHeight, definition.targetHeight * height * scale);
    instances.push({ position, scale: [width, height, width], rotation: r() * Math.PI * 2 });
  }
  if (!count) { patch.minBladeHeight = patch.maxBladeHeight = 0; patch.rootHeightRange = [0, 0]; }
  return { patch, instances, settings, configured, renderVariant: 'kit-tall', budgetCost: count * 10 };
}

/** Material tint is independent of alpha. Ground colour is capped at 70% so
 * sand/snow/mud cannot completely replace the vegetation's selected green. */
export function vegetationTint(settings, x, z, groundColor, target = new THREE.Color()) {
  target.set(settings.color);
  if (settings.groundColor && groundColor?.isColor) {
    const blend = clamp(settings.groundBlend, 0, 1) * .7;
    target.lerp(groundColor, blend).lerp(new THREE.Color('#668445'), blend * .12);
  }
  const hsl = target.getHSL({}, THREE.SRGBColorSpace);
  const phase = (Math.sin(x * 12.9898 + z * 78.233 + settings.seed * .17) * 43758.5453) % 1;
  target.setHSL(hsl.h + phase * .025 * settings.colorVariation,
    clamp(hsl.s * settings.saturation, 0, 1),
    clamp(hsl.l * settings.brightness * (1 + phase * .3 * settings.colorVariation), .015, .98), THREE.SRGBColorSpace);
  return target;
}

/** Existing blade materials carry their own root/tip colours. Multiplicative
 * per-instance tints are relative to the neutral preset, retaining that detail. */
export function vegetationInstanceTint(settings, x, z, groundColor, renderVariant, target = new THREE.Color()) {
  vegetationTint(settings, x, z, groundColor, target);
  const reference = new THREE.Color(renderVariant === 'tall' ? '#799754' : '#759552');
  target.setRGB(clamp(target.r / reference.r, 0, 4), clamp(target.g / reference.g, 0, 4), clamp(target.b / reference.b, 0, 4));
  return target;
}
