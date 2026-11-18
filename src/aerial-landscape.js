import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Distant scenery shares the real island meshes/textures, never a magnified minimap.
 * Separate materials keep tactical ground visibility out of the aerial view. */
export function createAerialLandscape(world) {
  const group = new THREE.Group(); group.name = 'Insel · geometrische Fernansicht';
  const materials = new Map(), ownedGeometries = []; let meshes = 0, triangles = 0;
  function aerialMaterial(source) {
    if (materials.has(source)) return materials.get(source).material;
    const material = source.clone();
    // Preserve terrain paint and the original art shaders, before vision registers.
    material.onBeforeCompile = shader => {
      source.onBeforeCompile?.(shader);
      // Ground-scale cloud/zone shading aliases into large blotches from altitude.
      shader.fragmentShader = shader.fragmentShader
        .replace('gl_FragColor.rgb *= generatedCloudLight(vGeneratedWorld.xz);', '')
        .replace(/float generatedMist = smoothstep\([^;]+; gl_FragColor.rgb \*= mix\([^;]+;/, '');
    };
    material.bumpMap = null; material.normalMap = null;
    const key = source.customProgramCacheKey?.call(source) ?? '';
    material.customProgramCacheKey = () => `${key}|aerial-scenery`;
    material.userData = {...material.userData, ignoreVision:true};
    material.transparent = true; material.depthWrite = source.depthWrite;
    material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1;
    materials.set(source,{material,opacity:source.opacity});return material;
  }
  const terrain = world.root.children.filter(node=>node.isMesh && node.name.startsWith('Geländeabschnitt '));
  if (terrain.length) {
    const geometry = mergeGeometries(terrain.map(node=>node.geometry),false);
    // Sample authored painted colours too, without allocating hundreds of close-up tiles.
    if (world.map?.terrainPaint?.length && world.colorAt) {
      const positions=geometry.attributes.position,colors=geometry.attributes.color,color=new THREE.Color();
      for(let i=0;i<positions.count;i++){world.colorAt(positions.getX(i),positions.getZ(i),color);colors.setXYZ(i,color.r,color.g,color.b);}
    }
    ownedGeometries.push(geometry);
    const source = new THREE.MeshStandardMaterial({vertexColors:true,color:'#ffffff',roughness:1,side:THREE.DoubleSide});
    const material=aerialMaterial(source);material.forceSinglePass=true;
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Fernansicht · echtes zusammengefasstes Gelände';mesh.layers.set(1);mesh.userData.ignoreVision=true;group.add(mesh);
    meshes++;triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;source.dispose();
  }
  // Called before characters, loot, spells and tactical overlays are added.
  for (const source of [...world.root.children]) {
    // Individual grass blades and local snow microdetail have no aerial silhouette.
    if (/^Geländeabschnitt |dichte animierte Wiese|natürliche volumige Schneedecke/.test(source.name)) continue;
    const node = source.clone(true); node.visible = true;
    node.traverse(child=>{
      child.layers.set(1); child.userData.ignoreVision = true;
      child.castShadow = child.receiveShadow = false;
      if (/^Objekte · Sektor/.test(child.name)) child.visible = true;
      if (/^grass:|durchsichtige Baumkrone/.test(child.name)) child.visible = false;
      if (child.material) {
        child.material = Array.isArray(child.material) ? child.material.map(aerialMaterial) : aerialMaterial(child.material);
        meshes++;triangles += ((child.geometry?.index?.count ?? child.geometry?.attributes.position?.count ?? 0)/3)*(child.count??1);
      }
    });
    group.add(node);
  }
  group.visible = false; world.root.add(group);
  return {
    update(height) {
      const opacity = THREE.MathUtils.smoothstep(height,65,180);
      group.visible = opacity>0;
      for (const {material,opacity:original} of materials.values()) material.opacity=original*opacity;
    },
    inspect:()=>({mode:'scene-geometry',visible:group.visible,meshes,triangles,bitmapAtlas:false}),
    dispose(){group.removeFromParent();for(const {material} of materials.values())material.dispose();materials.clear();for(const geometry of ownedGeometries)geometry.dispose();}
  };
}
