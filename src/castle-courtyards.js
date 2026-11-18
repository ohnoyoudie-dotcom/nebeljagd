import { Group } from 'three';

/** Courtyard centres are openings: the actual terrain, paint, grass and snow
 * remain visible. Only the separate stone borders belong to the building. */
export function createCastleCourtyards({definition}={}) {
  const group=new Group();group.name='Schlossanlage · offene Innenhöfe';
  const stats={openAreas:definition?.courtyardGroundAreas?.length??0,drawCalls:0,triangles:0};
  group.userData.castleCourtyards=stats;
  return {group,stats,dispose(){group.removeFromParent();}};
}
