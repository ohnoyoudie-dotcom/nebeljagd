/** Keep glTF leaf masks and texture coordinates intact; move only leaf vertices
 * with the existing shared world-space wind shader, never tree trunks. */
export const USER_TREE_WIND_RESPONSE = 1.35;

/** Tree1's part named “Äste” is a set of closed crown support volumes,
 * not branches. Its brown shells show through fading leaves. The detailed
 * trunk AND real branches are in “Stamm”; retain those and the leaf cards. */
export function isTreeCrownSupportPart(kind, variant, mesh) {
  return kind === 'tree' && variant === 'kit-user-tree1' && mesh?.isMesh === true
    && /(?:^|[·_\s])Äste(?:$|[_\s])/i.test(mesh.name ?? '');
}

export function isTreeFoliagePart(kind, mesh) {
  if (kind !== 'tree' || !mesh?.isMesh) return false;
  if (/leaves|leaf|foliage|needles?|blatt|blätter/i.test(mesh.name ?? '')) return true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some(material => (material?.alphaTest ?? 0) > 0);
}
