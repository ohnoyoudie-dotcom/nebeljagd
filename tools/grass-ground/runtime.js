/* Renderer integration for the shipped Three.js bundle. */
async function reiCreateGround({root,map,heightAt,colorAt,isLand,isWater,regionAt,quality}) {
  const settings=reiGroundSettings(map);
  const empty={update(){},setQuality(){},dispose(){},inspect(){return {enabled:false,settings}}};
  if(settings.type!=='rei-grass') return empty;
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Die eingebettete Rei-Grasmaske konnte nicht gelesen werden.'));image.src=REI_GRASS_MASK_DATA;});
  const texture=new wi(image); texture.colorSpace=''; texture.anisotropy=2;
  const group=new Nt(); group.name='Rei-Wiese · animierter Untergrund'; root.add(group);
  const maskExcluded=reiGrassExclusions(map), chunkSize=10;
  const uniforms={reiTime:{value:0},reiWind:{value:settings.windEnabled?settings.windStrength:0},reiSpeed:{value:settings.windSpeed},reiDirection:{value:new G(Math.cos(settings.windDirection*Math.PI/180),Math.sin(settings.windDirection*Math.PI/180))},reiMask:{value:texture},reiViewer:{value:new G()},reiDistance:{value:48}};
  const material=new go({color:'#ffffff',roughness:1,side:2,alphaTest:.22,alphaToCoverage:true,forceSinglePass:true});
  material.name='Rei grass · alpha mask, rooted wind';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=`uniform float reiTime,reiWind,reiSpeed; uniform vec2 reiDirection;
      varying vec2 vReiUv; varying float vReiHeight; varying vec2 vReiTile; varying vec2 vReiRoot;
      ${shader.vertexShader}`.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec2 reiRoot=instanceMatrix[3].xz;
        float reiPhase=dot(reiRoot,vec2(.197,.231));
        float reiGust=.55+.45*sin(dot(reiRoot,reiDirection)*.28-reiTime*reiSpeed*1.15);
        float reiWave=.45+sin(dot(reiRoot,reiDirection)*.47-reiTime*reiSpeed*1.5)*.65+.22*sin(reiPhase*2.3+reiTime*reiSpeed*2.4);
        float reiBend=pow(uv.y,1.7)*reiWind*(.22+reiGust*.35)*reiWave;
        vec2 reiLocalWind=vec2(dot(normalize(instanceMatrix[0].xz),reiDirection),dot(normalize(instanceMatrix[2].xz),reiDirection));
        transformed.xz+=reiLocalWind*reiBend;
        vReiUv=uv; vReiHeight=uv.y; vReiRoot=reiRoot;
        float reiId=floor(fract(sin(dot(reiRoot,vec2(127.1,311.7)))*43758.5453)*4.);
        vReiTile=vec2(mod(reiId,2.),floor(reiId/2.));
      `);
    shader.fragmentShader=`uniform sampler2D reiMask; uniform vec2 reiViewer; uniform float reiDistance;
      varying vec2 vReiUv; varying float vReiHeight; varying vec2 vReiTile; varying vec2 vReiRoot;
      ${shader.fragmentShader}`.replace('#include <alphatest_fragment>',`
        vec2 reiUV=(clamp(vReiUv,vec2(.004),vec2(.996))+vReiTile)*.5;
        float reiAlpha=texture2D(reiMask,reiUV).g;
        float reiFade=1.-smoothstep(reiDistance-12.,reiDistance,distance(vReiRoot,reiViewer));
        diffuseColor.a*=reiAlpha*reiFade;
        diffuseColor.rgb*=mix(vec3(.43,.54,.32),vec3(1.12,1.14,.83),smoothstep(0.,1.,vReiHeight));
        #include <alphatest_fragment>
      `);
    // These cards use an upward terrain normal on both sides. Cancelling the
    // automatic back-face flip prevents black undersides in top-down views.
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`
      #include <normal_fragment_begin>
      normal=normalize(vNormal);
      nonPerturbedNormal=normal;
    `);
  };
  material.customProgramCacheKey=()=> 'rei-ground-dense-wind-v3';
  const geo=new In(),positions=[],normals=[],uv=[],indices=[];
  for(let card=0;card<3;card++) {
    const angle=card*2.39996,c=Math.cos(angle),s=Math.sin(angle),base=positions.length/3;
    for(let row=0;row<=4;row++) for(let side=0;side<2;side++) {
      const h=row/4,edge=side-.5;
      const lean=.12+Math.pow(h,1.6)*.48;
      positions.push(edge*c+lean*s,h,edge*s-lean*c);
      normals.push(0,1,0); uv.push(side,h);
    }
    for(let row=0;row<4;row++){const i=base+row*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);}
  }
  geo.setAttribute('position',new Y(positions,3));geo.setAttribute('normal',new Y(normals,3));geo.setAttribute('uv',new Y(uv,2));geo.setIndex(indices);
  // Register the shared material with the world's cloud/fog pass before streaming.
  const materialAnchor=new Tr(geo,material);materialAnchor.visible=false;
  materialAnchor.name='Rei terrain material registration';group.add(materialAnchor);
  const chunks=new Map(),dummy=new Mt(),baseColor=new J(settings.color),groundColor=new J(),color=new J();
  const hash=(x,z,salt=0)=>{let v=Math.imul(x^salt,374761393)^Math.imul(z+salt,668265263);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967296;};
  let currentQuality=quality==='low'?'low':'high',frame=0,created=0,visible=0,instances=0,lastPos={x:NaN,z:NaN},queue=[];
  function allowed(x,z) {
    return isLand(x,z)&&!isWater(x,z)&&!maskExcluded(x,z)&&reiRegionHasGrass(map,regionAt(x,z),settings);
  }
  function makeChunk(cx,cz) {
    const spacing=1/Math.sqrt(settings.density*(currentQuality==='low'?.60:1));
    const cells=Math.max(3,Math.round(chunkSize/spacing)),step=chunkSize/cells,data=[];
    for(let ix=0;ix<cells;ix++)for(let iz=0;iz<cells;iz++) {
      const gx=cx*cells+ix,gz=cz*cells+iz;
      const x=cx*chunkSize+(ix+.15+.7*hash(gx,gz,17))*step;
      const z=cz*chunkSize+(iz+.15+.7*hash(gx,gz,31))*step;
      if(allowed(x,z))data.push({x,z,gx,gz});
    }
    const key=cx+','+cz;
    if(!data.length){chunks.set(key,{mesh:null,cx,cz,touched:frame,count:0});return;}
    const mesh=new Zr(geo,material,data.length);mesh.name='Rei-Bodengras '+key;mesh.castShadow=false;mesh.receiveShadow=true;
    for(let i=0;i<data.length;i++) {
      const {x,z,gx,gz}=data[i];
      dummy.position.set(x,heightAt(x,z)-.025,z);
      dummy.rotation.set(0,hash(gx,gz,49)*Math.PI*2,0);
      const h=settings.height*(.72+.54*hash(gx,gz,63)),w=.66+.30*hash(gx,gz,73);
      dummy.scale.set(w,h,w);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      colorAt(x,z,groundColor);
      const patch=.91+.11*Math.sin(x*.12+Math.sin(z*.09))+.07*Math.cos(z*.18-x*.05);
      color.copy(baseColor).lerp(groundColor,settings.groundBlend*.55).multiplyScalar(patch*(.86+hash(gx,gz,97)*.24));
      mesh.setColorAt(i,color);
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.boundingSphere.radius+=settings.height*.7+.5;
    group.add(mesh);chunks.set(key,{mesh,cx,cz,touched:frame,count:data.length});created++;
  }
  function clearChunks(){for(const c of chunks.values())if(c.mesh){group.remove(c.mesh);c.mesh.dispose();}chunks.clear();queue=[];lastPos={x:NaN,z:NaN};}
  function update(time,position) {
    frame++;uniforms.reiTime.value=time;uniforms.reiViewer.value.set(position.x,position.z);
    const radius=currentQuality==='low'?28:38;uniforms.reiDistance.value=radius;
    const cx=Math.floor(position.x/chunkSize),cz=Math.floor(position.z/chunkSize);
    if(cx!==lastPos.x||cz!==lastPos.z) {
      queue=[];const range=Math.ceil(radius/chunkSize)+1;
      for(let x=cx-range;x<=cx+range;x++)for(let z=cz-range;z<=cz+range;z++) {
        const d=Math.hypot((x+.5)*chunkSize-position.x,(z+.5)*chunkSize-position.z);
        if(d<radius+chunkSize*.72 && !chunks.has(x+','+z))queue.push({x,z,d});
      }
      queue.sort((a,b)=>a.d-b.d);lastPos={x:cx,z:cz};
    }
    for(let i=0,n=frame===1?9:3;i<n&&queue.length;i++){const p=queue.shift();makeChunk(p.x,p.z);}
    visible=0;instances=0;
    for(const [key,c] of chunks) {
      const d=Math.hypot((c.cx+.5)*chunkSize-position.x,(c.cz+.5)*chunkSize-position.z),near=d<radius+chunkSize*.72;
      if(c.mesh)c.mesh.visible=near;
      if(near){c.touched=frame;if(c.mesh){visible++;instances+=c.count;}}
      if(d>radius+chunkSize*3){if(c.mesh){group.remove(c.mesh);c.mesh.dispose();}chunks.delete(key);}
    }
  }
  const api={update,setQuality(q){q=q==='low'?'low':'high';if(q!==currentQuality){currentQuality=q;clearChunks();}},dispose(){clearChunks();root.remove(group);geo.dispose();material.dispose();texture.dispose();},inspect(){return {enabled:true,settings,windTime:uniforms.reiTime.value,windStrength:uniforms.reiWind.value,quality:currentQuality,visibleChunks:visible,visibleInstances:instances,cachedChunks:chunks.size,pendingChunks:queue.length,createdChunks:created,source:'Blender/Gras/textures/grass4_mask_02.png',cardsPerTuft:3,layoutVersion:2,mode:'terrain-layer',excludedAreas:'paths, rivers, sea, rotated buildings, chests, crates, rocks and shrines'};}};
  window.nebeljagdGrassGroundState=()=>api.inspect();
  return api;
}
