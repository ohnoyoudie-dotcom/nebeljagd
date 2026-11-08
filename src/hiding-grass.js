import * as THREE from 'three';

/** Fine curved meadow blades with a few taller ears; one shared tuft mesh. */
export const HIDING_GRASS_STYLE = Object.freeze({
  sourceVersion: 'nebeljagd-meadow-ears-v3', stalksPerInstance: 14, halfWidth: .055,
  height: Object.freeze([1.75, 2.6]), instanceDensity: 4 / (Math.PI * .72),
  nearDistance: 24, lowViewDistance: 34, highViewDistance: 48,
  rootColor: '#3d5731', tipColor: '#91a45f',
});

export function createHidingGrassGeometry({ low = false, rootColor = HIDING_GRASS_STYLE.rootColor, tipColor = HIDING_GRASS_STYLE.tipColor } = {}) {
  const positions=[], colors=[], indices=[], uvs=[], kinds=[], segments=low?4:8;
  const base=new THREE.Color(rootColor), tip=new THREE.Color(tipColor), tint=new THREE.Color();
  const vertex=(x,y,z,color,u,v,kind=0)=>{
    positions.push(x,y,z); colors.push(color.r,color.g,color.b); uvs.push(u,v); kinds.push(kind);
  };
  for(let leaf=0;leaf<HIDING_GRASS_STYLE.stalksPerInstance;leaf++) {
    const offset=positions.length/3,angle=leaf*2.399963,c=Math.cos(angle),s=Math.sin(angle);
    const height=[1,.72,.94,.65,.87,.78,.96][leaf%7], reach=.37+(leaf%5)*.105;
    for(let row=0;row<=segments;row++) {
      const t=row/segments, width=(.008+Math.sin(Math.PI*t)**.7*HIDING_GRASS_STYLE.halfWidth)*(1-t*t)*(.75+(leaf%4)*.13);
      const outward=.025+reach*t*t;
      const y=height*Math.sin(t*Math.PI*.65)/Math.sin(.75*Math.PI*.65);
      tint.copy(base).lerp(tip,Math.min(1,t*.88+.035*(leaf%3)));
      for(const side of [-1,1]) vertex(c*outward-s*width*side,y,s*outward+c*width*side,tint,(side+1)/2,t);
      if(row<segments){const a=offset+row*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
  }
  // The shader shows this ear on only a quarter of tufts, stable across LODs.
  const stem=new THREE.Color('#a1a16a'), grain=new THREE.Color('#c2b47c'), offset=positions.length/3;
  const stemX=t=>.07+.18*t*t, stemZ=t=>-.09+.07*t*t;
  for(let row=0;row<=segments;row++) {
    const t=row/segments;
    for(const side of [-1,1]) vertex(stemX(t)+side*.008,1.29*t,stemZ(t),stem,(side+1)/2,t,1);
    if(row<segments){const a=offset+row*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  for(let k=0;k<12;k++) {
    const t=.79+k*.016, side=k%2?1:-1, x=stemX(t)+side*.027,z=stemZ(t),y=1.29*t;
    for(let plane=0;plane<(low?1:2);plane++) {
      const a=positions.length/3,dx=plane?0:.031,dz=plane?.031:0;
      vertex(x,y-.024,z,grain,.5,0,2);vertex(x+dx,y+.006,z+dz,grain,1,.5,2);
      vertex(x+side*.018,y+.055,z,grain,.5,1,2);vertex(x-dx,y+.006,z-dz,grain,0,.5,2);
      indices.push(a,a+1,a+2,a,a+2,a+3);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('aBladeKind',new THREE.Float32BufferAttribute(kinds,1));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();
  geometry.userData={sourceVersion:HIDING_GRASS_STYLE.sourceVersion,leavesPerTuft:14,crossedStalks:14,seedHeads:true,low};
  return geometry;
}

/** Leaf veins stay crisp at close range without another texture or draw call. */
export function applyGrassSurface(material) {
  const previous=material.onBeforeCompile, key=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.vertexShader=`attribute float aBladeKind; varying vec2 vBladeUv; varying float vBladeKind; varying float vEarVisible;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vBladeUv=uv;vBladeKind=aBladeKind;
      vec2 tuftRoot=vec2(0.);
      #ifdef USE_INSTANCING
        tuftRoot=instanceMatrix[3].xz;
      #endif
      vEarVisible=step(.76,fract(sin(dot(tuftRoot,vec2(12.9898,78.233)))*43758.5453));
    `);
    shader.fragmentShader=`varying vec2 vBladeUv; varying float vBladeKind; varying float vEarVisible;\n${shader.fragmentShader}`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if(vBladeKind>.5 && vEarVisible<.5) discard;
      if(vBladeKind<.5) {
        float midrib=1.-smoothstep(.02,.09,abs(vBladeUv.x-.5));
        float fibres=sin(vBladeUv.x*53.+sin(vBladeUv.y*13.)*.55)*.035;
        float edge=smoothstep(.34,.5,abs(vBladeUv.x-.5));
        diffuseColor.rgb*=.92+midrib*.16+fibres-edge*.10;
      }
    `);
  };
  material.customProgramCacheKey=()=>`${key()}|meadow-veins-ears-v3`;
  return material;
}

/** Grass is local detail. Coarse geometry keeps the same stalks and height, so
 * performance mode does not turn a hiding place back into sparse short grass. */
export function hidingGrassDetail(player, bounds, quality = 'high') {
  const dx = Math.max(bounds.min.x - player.x, 0, player.x - bounds.max.x);
  const dz = Math.max(bounds.min.z - player.z, 0, player.z - bounds.max.z);
  const distance = Math.hypot(dx, dz);
  return {
    visible: distance < (quality === 'low' ? HIDING_GRASS_STYLE.lowViewDistance : HIDING_GRASS_STYLE.highViewDistance),
    low: quality === 'low' || distance > HIDING_GRASS_STYLE.nearDistance,
  };
}
