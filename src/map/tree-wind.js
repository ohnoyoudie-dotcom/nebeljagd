/** Keep glTF leaf masks and texture coordinates intact; move only leaf vertices
 * with the existing shared world-space wind shader, never tree trunks. */
export const USER_TREE_WIND_RESPONSE = 1.35;

export function isTreeFoliagePart(kind, mesh) {
  if (kind !== 'tree' || !mesh?.isMesh) return false;
  if (/leaves|leaf|foliage|needles?|blatt|blätter/i.test(mesh.name ?? '')) return true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some(material => (material?.alphaTest ?? 0) > 0);
}
