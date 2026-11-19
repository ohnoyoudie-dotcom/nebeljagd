/** The same small original painted atlas covers walkable grass and plateaus.
 * Two differently oriented scales soften repetition. Blade direction/size is
 * already irregular in the atlas; no rows, relief, or extra geometry. */
export function applyPaintedGrass(material,texture){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey?.call(material)??'';
 material.onBeforeCompile=function(shader,renderer){
  previous?.call(this,shader,renderer);
  shader.uniforms.uPaintedGrass={value:texture};
  shader.vertexShader='varying vec3 vPaintedGrassWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
    vPaintedGrassWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);
  shader.fragmentShader='uniform sampler2D uPaintedGrass;varying vec3 vPaintedGrassWorld;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    float greenGround=smoothstep(1.04,1.25,diffuseColor.g/(max(diffuseColor.r,diffuseColor.b)+.001));
    float grassySlope=smoothstep(.68,.94,abs(normalize(cross(dFdx(vPaintedGrassWorld),dFdy(vPaintedGrassWorld))).y));
    vec2 grassUV=vPaintedGrassWorld.xz/5.5;
    float grassPrimary=texture2D(uPaintedGrass,grassUV).r-.502;
    float grassSecondary=texture2D(uPaintedGrass,mat2(.731,-.682,.682,.731)*grassUV*.63+vec2(.217,.593)).r-.502;
    diffuseColor.rgb*=1.+(grassPrimary*1.5+grassSecondary*.7)*greenGround*grassySlope;
  `);
 };
 material.customProgramCacheKey=()=>key+'|painted-grass-fans-v2';material.needsUpdate=true;
}
