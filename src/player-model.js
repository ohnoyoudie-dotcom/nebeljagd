// The uploaded Tripo mesh has one finger seam point duplicated four times for
// UV/normal seams. Those four copies are bound to its static neutral_bone while
// all connected vertices follow the fingers. Reweight only that known defect;
// keep the user's GLB bytes, topology, UVs, normals and textures unchanged.
export const PLAYER_SKIN_REPAIR_VERSION = 'tripo-neutral-finger-v1';
const SOURCE_MESH = 'tripo_node_fbfd8831-df28-426c-b48d-eb2bbb7cecb2';
const SEAM_POSITION = [-.24392704665660858, .4419552683830261, .033481575548648834];
const prepared = new WeakMap();

export function preparePlayerGeometry(model) {
  if (prepared.has(model)) return prepared.get(model);
  const result = { version: PLAYER_SKIN_REPAIR_VERSION, repairedVertices: 0, repairs: [] };
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh || mesh.name !== SOURCE_MESH) return;
    const original = mesh.geometry;
    const { position, skinIndex, skinWeight } = original.attributes;
    const neutral = mesh.skeleton.bones.findIndex(bone => bone.name === 'neutral_bone');
    if (!original.index || neutral < 0 || !position || !skinIndex || !skinWeight) return;
    const seam = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      let neutralWeight = 0;
      for (let slot = 0; slot < 4; slot++) {
        if (skinIndex.getComponent(vertex, slot) === neutral) neutralWeight += skinWeight.getComponent(vertex, slot);
      }
      if (neutralWeight > .999) seam.push(vertex);
      else if (neutralWeight > .00001) return; // A different export: do not guess.
    }
    if (seam.length !== 4 || seam.some(vertex => SEAM_POSITION.some((value, axis) =>
      Math.abs(position.getComponent(vertex, axis) - value) > 1e-6))) return;
    const seamSet = new Set(seam), neighbors = new Set();
    for (let offset = 0; offset < original.index.count; offset += 3) {
      const triangle = [0, 1, 2].map(slot => original.index.getX(offset + slot));
      if (triangle.some(vertex => seamSet.has(vertex))) {
        for (const vertex of triangle) if (!seamSet.has(vertex)) neighbors.add(vertex);
      }
    }
    if (!neighbors.size) return;
    const totals = new Map();
    for (const vertex of neighbors) {
      for (let slot = 0; slot < 4; slot++) {
        const weight = skinWeight.getComponent(vertex, slot);
        if (weight <= .00001) continue;
        const joint = skinIndex.getComponent(vertex, slot);
        const name = mesh.skeleton.bones[joint]?.name;
        if (!/^mixamorig:?RightHand/i.test(name || '')) return;
        totals.set(joint, (totals.get(joint) || 0) + weight);
      }
    }
    const influences = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = influences.reduce((sum, [, weight]) => sum + weight, 0);
    if (!(total > 0)) return;
    // Pool neighbors across UV duplicates so their positions remain coincident
    // in every pose, instead of opening a seam between separate material faces.
    const geometry = original.clone();
    for (const vertex of seam) {
      for (let slot = 0; slot < 4; slot++) {
        geometry.attributes.skinIndex.setComponent(vertex, slot, influences[slot]?.[0] || 0);
        geometry.attributes.skinWeight.setComponent(vertex, slot, (influences[slot]?.[1] || 0) / total);
      }
    }
    geometry.attributes.skinIndex.needsUpdate = true;
    geometry.attributes.skinWeight.needsUpdate = true;
    mesh.geometry = geometry;
    result.repairedVertices += seam.length;
    result.repairs.push({ mesh: mesh.name, vertices: seam, replacedBone: 'neutral_bone',
      influences: influences.map(([joint, weight]) => ({ bone: mesh.skeleton.bones[joint].name, weight: weight / total })) });
  });
  prepared.set(model, result);
  return result;
}
