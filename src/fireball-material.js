import * as THREE from 'three';

/** Preserve the uploaded flame's PBR maps while adding a moving, warm emission. */
export function createFireballMaterial(source, clock) {
  const material = source.clone();
  material.name = 'Feuerball · animierte Glut';
  material.emissive ??= new THREE.Color();
  material.emissive.set('#ff6412');
  material.emissiveIntensity = 1.1;
  material.roughness = Math.min(material.roughness ?? .5, .65);
  material.onBeforeCompile = shader => {
    shader.uniforms.uFireballTime = clock;
    shader.vertexShader = 'varying vec3 vFireballLocal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vFireballLocal = position;');
    shader.fragmentShader = 'uniform float uFireballTime;\nvarying vec3 vFireballLocal;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float firePulse = .72 + .18 * sin(uFireballTime * 15.0 + vFireballLocal.z * 19.0)
        + .10 * sin(uFireballTime * 23.0 + vFireballLocal.x * 27.0);
      totalEmissiveRadiance *= firePulse;
      totalEmissiveRadiance += vec3(1.0, .24, .015) * firePulse * .22;
    `);
  };
  material.customProgramCacheKey = () => 'nebeljagd-fireball-pbr-v1';
  material.userData.fireballShader = true;
  return material;
}
