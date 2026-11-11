import inspection from '../../assets/imported/tripo-woodland/inspection.json' with { type: 'json' };

// Measured browser geometry is shared by selection, map symbols and gameplay.
// Stumps use a trunk proxy inside the root spread; logs and crates use boxes.
export const TRIPO_WOODLAND_DEFINITIONS = inspection.assets.map(record => {
  const kind = record.id.split('-')[0];
  const variant = `kit-tripo-${record.id}`;
  const [min, max] = record.normalization.gltfBounds;
  const halfWidth = Math.max(Math.abs(min[0]), Math.abs(max[0]));
  const halfDepth = Math.max(Math.abs(min[2]), Math.abs(max[2]));
  const height = max[1];
  const radius = Math.min(halfWidth, halfDepth) * .78;
  const box = { minX: -halfWidth * .9, maxX: halfWidth * .9,
    minZ: -halfDepth * .9, maxZ: halfDepth * .9, minY: 0, maxY: height, type: kind };
  return {
    id: `${kind}:${variant}`, kind, variant, asset: `tripo-${record.id}`, file: `${record.id}.glb`,
    label: `${record.label} · Tripo`, source: record.source.path,
    nativeBounds: { min, max }, height, targetHeight: height,
    normalization: { scale: 1, offset: [0, 0, 0] },
    footprint: { halfWidth, halfDepth }, solid: true, textured: true,
    walls: kind === 'stump' ? [] : [box],
    circles: kind === 'stump' ? [{ x: 0, z: 0, radius, minY: 0, maxY: height }] : [],
    ...(kind === 'crate' ? { destructible: { health: 55, radius: Math.hypot(halfWidth, halfDepth) * .9 } } : {}),
  };
});
