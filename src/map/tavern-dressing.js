/** Selective runtime cut of the imported tavern's busiest repeated props.
 * The authored GLB remains untouched; groups are identified by their Blender
 * parent names so every child mesh of a bottle, barrel or stool is removed. */
export const TAVERN_DRESSING = Object.freeze({
  omittedRoots: Object.freeze([
    'Round stool_002', 'Round stool_004', 'Round stool_026', 'Round stool_027', 'Round stool_028',
    'Oak ale barrel_002', 'Oak ale barrel_004', 'Oak ale barrel_005', 'Oak ale barrel_004.001', 'Oak ale barrel_031',
    'Vintage bottle_013', 'Vintage bottle_014', 'Vintage bottle_016', 'Vintage bottle_017.001',
    'Vintage bottle_020', 'Vintage bottle_021', 'Vintage bottle_023', 'Vintage bottle_024',
    'Ale tankard_006.001', 'Ale tankard_007.001', 'Ale tankard_027', 'Ale tankard_028',
  ]),
  omittedMeshes: Object.freeze([
    /^Spieltisch_/i, /^Spielbrett(?:_|$)/i, /^(?:Dunkle|Goldene)_Spielfigur/i,
  ]),
});

const omittedRoots = new Set(TAVERN_DRESSING.omittedRoots);

export function shouldOmitTavernDetail(meshName, ancestorNames = []) {
  return omittedRoots.has(meshName)
    || ancestorNames.some(name => omittedRoots.has(name))
    || TAVERN_DRESSING.omittedMeshes.some(pattern => pattern.test(meshName));
}
