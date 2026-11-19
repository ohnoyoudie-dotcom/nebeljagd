import * as THREE from 'three';

/** Small camera-ray aperture through scenery in front of the local avatar.
 * Stochastic edge coverage keeps opaque depth/shadows and avoids transparent
 * chunk sorting. No collision or tactical visibility state is changed. */
export function createLocalPlayerCutaway(root){
 const playerUniform={value:new THREE.Vector3()},cameraUniform={value:new THREE.Vector3()},enabledUniform={value:0};
 const applied=new WeakSet();
 function apply(material){
  if(!material||applied.has(material))return;applied.add(material);
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey?.call(material)??'';
  material.onBeforeCompile=function(shader,renderer){
   previous?.call(this,shader,renderer);
   shader.uniforms.uLocalCutawayPlayer=playerUniform;shader.uniforms.uLocalCutawayCamera=cameraUniform;shader.uniforms.uLocalCutawayEnabled=enabledUniform;
   shader.vertexShader='varying vec3 vLocalCutawayWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
    vec4 cutawayPosition=vec4(transformed,1.);
    #ifdef USE_INSTANCING
     cutawayPosition=instanceMatrix*cutawayPosition;
    #endif
    vLocalCutawayWorld=(modelMatrix*cutawayPosition).xyz;`);
   shader.fragmentShader='varying vec3 vLocalCutawayWorld;uniform vec3 uLocalCutawayPlayer;uniform vec3 uLocalCutawayCamera;uniform float uLocalCutawayEnabled;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
    vec3 cutawayRay=uLocalCutawayCamera-uLocalCutawayPlayer;float cutawayLength=length(cutawayRay);
    vec3 cutawayDirection=cutawayRay/max(cutawayLength,.001);vec3 cutawayDelta=vLocalCutawayWorld-uLocalCutawayPlayer;
    float cutawayAlong=dot(cutawayDelta,cutawayDirection);
    float cutawayDistance=length(cutawayDelta-cutawayDirection*cutawayAlong);
    float cutawayCoverage=(1.-smoothstep(1.,1.65,cutawayDistance))*uLocalCutawayEnabled;
    cutawayCoverage*=step(.25,cutawayAlong)*step(cutawayAlong,cutawayLength)*smoothstep(.05,.45,vLocalCutawayWorld.y-uLocalCutawayPlayer.y+.9);
    float cutawayNoise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
    if(cutawayCoverage>cutawayNoise)discard;`);
  };
  material.customProgramCacheKey=()=>key+'|local-player-cutaway-v1';material.needsUpdate=true;
 }
 return {apply,reset(){enabledUniform.value=0;},update(player,camera,enabled=true){
  playerUniform.value.set(player.x,player.y+.9,player.z);root.localToWorld(playerUniform.value);
  camera.getWorldPosition(cameraUniform.value);enabledUniform.value=enabled?1:0;
 }};
}
