import * as THREE from 'three';
const noise=`float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise21(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);}`;
/** A terrain-following local arc. Work stays bounded even for kilometre circles. */
export function createZone(scene,{center=[0,0],initialRadius=32,heightAt=()=>0}={}){
 const group=new THREE.Group();group.name='Nebelgrenze · aufsteigende türkisfarbene Schlieren';scene.add(group);
 const uniforms={uTime:{value:0},uFull:{value:0}};
 const vertex=`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
 const wallMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,vertexShader:vertex,
 fragmentShader:`varying vec2 vUv;varying vec3 vWorld;uniform float uTime,uFull;${noise}
 void main(){float h=vUv.y;float column=noise21(vWorld.xz*.7+vec2(sin(h*6.+uTime*.5)*.3));
 float flow=noise21(vec2(column*8.+vWorld.x*.13+vWorld.z*.17,h*3.5-uTime*.85));
 float thread=pow(smoothstep(.25,.70,column*.65+flow*.35),1.25);
 float fade=pow(1.-h,1.35)*(1.-smoothstep(.65,1.,h));
 float ends=mix(smoothstep(0.,.04,vUv.x)*smoothstep(0.,.04,1.-vUv.x),1.,uFull);
 float a=(.045+thread*.90)*fade*ends;
 gl_FragColor=vec4(mix(vec3(.025,.42,.39),vec3(.08,1.,.70),thread),a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const seamMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,vertexShader:vertex,
 fragmentShader:`varying vec2 vUv;varying vec3 vWorld;uniform float uTime,uFull;
 void main(){float across=abs(vUv.y-.5)*2.;float core=exp(-across*across*24.);float halo=exp(-across*across*3.);
 float ends=mix(smoothstep(0.,.04,vUv.x)*smoothstep(0.,.04,1.-vUv.x),1.,uFull);
 gl_FragColor=vec4(mix(vec3(.025,.45,.4),vec3(.33,1.,.84),core),(.22*halo+.65*core)*ends);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const segments=128;
 function mesh(material,name){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array((segments+1)*6),3));g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array((segments+1)*4),2));const ids=[];for(let i=0;i<segments;i++){const a=i*2;ids.push(a,a+2,a+1,a+1,a+2,a+3);}g.setIndex(ids);const m=new THREE.Mesh(g,material);m.name=name;m.frustumCulled=false;m.userData.ignoreVision=true;material.userData.ignoreVision=true;group.add(m);return m;}
 const wall=mesh(wallMaterial,'Schlieren · vom Boden nach oben'),seam=mesh(seamMaterial,'Klare sichere Kreisgrenze');wall.renderOrder=4;seam.renderOrder=5;
 let lastRadius=-1,lastX=Infinity,lastZ=Infinity,lastBuild=-Infinity,builds=0;
 function update(time,radius,inDanger,player={x:center[0],z:center[1]}){
  uniforms.uTime.value=time;radius=Math.max(.25,radius);
  if(Math.abs(radius-lastRadius)<.15&&Math.hypot(player.x-lastX,player.z-lastZ)<1&&time-lastBuild<.25)return;
  const full=radius<35,half=full?Math.PI:Math.min(Math.PI,95/radius),angle=Math.atan2(player.z-center[1],player.x-center[0]);uniforms.uFull.value=full?1:0;
  for(let i=0;i<=segments;i++){
   const a=angle-half+2*half*i/segments,c=Math.cos(a),s=Math.sin(a),x=center[0]+c*radius,z=center[1]+s*radius,y=heightAt(x,z);
   for(let j=0;j<2;j++){wall.geometry.attributes.position.setXYZ(i*2+j,x,y+.04+j*7,z);wall.geometry.attributes.uv.setXY(i*2+j,i/segments,j);
    const r=radius+(j?1:-1)*.55,px=center[0]+c*r,pz=center[1]+s*r;seam.geometry.attributes.position.setXYZ(i*2+j,px,heightAt(px,pz)+.09,pz);seam.geometry.attributes.uv.setXY(i*2+j,i/segments,j);}
  }
  for(const m of [wall,seam]){m.geometry.attributes.position.needsUpdate=true;m.geometry.attributes.uv.needsUpdate=true;}
  lastRadius=radius;lastX=player.x;lastZ=player.z;lastBuild=time;builds++;
 }
 update(0,initialRadius,false);
 return {update,inspect:()=>({radius:lastRadius,segments,builds,terrainFollowing:true,color:'turquoise'}),dispose(){for(const m of [wall,seam]){m.geometry.dispose();m.material.dispose();}group.removeFromParent();}};
}
