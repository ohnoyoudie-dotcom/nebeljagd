import * as THREE from 'three';

/** Section the upper architecture in castle-local metres. Both the colour and
 * shadow passes use the same plane, without changing the size of any stone. */
export function installCastleSection(material, uniform) {
  const previous=material.onBeforeCompile, previousKey=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=function(shader,renderer) {
    previous.call(this,shader,renderer);
    shader.uniforms.uCastleSectionHeight=uniform;
    shader.vertexShader='varying float vCastleSectionHeight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      vec4 castleSectionPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        castleSectionPosition = instanceMatrix * castleSectionPosition;
      #endif
      vCastleSectionHeight = castleSectionPosition.y;
      #include <project_vertex>
    `);
    shader.fragmentShader='uniform float uCastleSectionHeight;\nvarying float vCastleSectionHeight;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
      #include <clipping_planes_fragment>
      if ( vCastleSectionHeight > uCastleSectionHeight ) discard;
    `);
  };
  material.customProgramCacheKey=()=>previousKey()+'|castle-section-v1';
  material.userData.castleSection=true;
  return material;
}

/** A quick section cut on entry, slower restoration on exit. The courtyards
 * deliberately count as inside the castle even though they remain outdoors. */
export function createCastleCutaway({definition,group}) {
  const floor=definition.floorHeight??.18,base=floor+(definition.cutawayHeight??3);
  const wallHeight=definition.exteriorWallHeight??7.5,towerHeight=definition.towerHeight??12.2;
  const top=floor+Math.max(wallHeight,towerHeight,definition.mainGate?.height??0)+.15;
  const bounds=definition.cutawayBounds??definition.floorBounds;
  const uniform={value:top};
  const stats={amount:0,target:0,inside:false,clipHeight:top,exteriorWallHeight:wallHeight,towerHeight,
    visibleWallHeight:wallHeight,visibleTowerHeight:towerHeight,upperVisible:true};
  let advanced=false;
  const within=(point,margin)=>point.x>=bounds.minX-margin&&point.x<=bounds.maxX+margin&&point.z>=bounds.minZ-margin&&point.z<=bounds.maxZ+margin;
  function approachingGate(point) {
    return definition.entrances.filter(entry=>entry.exterior).some(entry=>{
      const alongX=entry.side==='north'||entry.side==='south',sign=entry.side==='north'||entry.side==='west'?-1:1;
      const along=alongX?point.x:point.z,distance=((alongX?point.z:point.x)-entry.boundary)*sign;
      return Math.abs(along-entry.center)<(entry.max-entry.min)/2-.2&&distance>=-.1&&distance<=1.2;
    });
  }
  function apply() {
    const reveal=1-stats.amount;
    uniform.value=base+(top-base)*reveal;
    stats.clipHeight=uniform.value;
    stats.visibleWallHeight=Math.min(wallHeight,uniform.value-floor);
    stats.visibleTowerHeight=Math.min(towerHeight,uniform.value-floor);
    stats.upperVisible=stats.amount<1;
    group.visible=stats.upperVisible;
  }
  return {uniform,stats,update(dt,point) {
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z)) {
      stats.amount=stats.target=0;stats.inside=false;advanced=false;apply();return;
    }
    if(advanced&&!(dt>0))return;
    stats.inside=within(point,stats.inside?.35:-.05)||approachingGate(point);
    stats.target=stats.inside?1:0;
    // Construction briefly uses a provisional observer. All zero-dt startup
    // samples may snap until the first real tick establishes the spawn point.
    if(!advanced)stats.amount=stats.target;
    else stats.amount=THREE.MathUtils.lerp(stats.amount,stats.target,1-Math.exp(-Math.min(dt,.25)*(stats.inside?24:10)));
    if(Math.abs(stats.amount-stats.target)<.005)stats.amount=stats.target;
    if(dt>0)advanced=true;
    apply();
  }};
}
