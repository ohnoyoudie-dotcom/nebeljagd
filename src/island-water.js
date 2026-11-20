import * as THREE from 'three';
import { outerLandRings, waterBoundaryRings } from './map/model.js';
import { SEA_LEVEL } from './generated-spatial.js';

/** Three shared meshes, no reflection pass, textures, particles or geometry updates. */
export function createIslandWater(root, { map, heightAt, timeUniform }) {
  const vertexShader = `varying vec2 vPosition; varying vec2 vUv;
    void main(){vPosition=position.xz;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const seaMaterial = new THREE.ShaderMaterial({
    uniforms:{uTime:timeUniform}, vertexShader,
    fragmentShader:`uniform float uTime; varying vec2 vPosition;
      void main(){
        vec2 p=vPosition;float t=uTime*.18;
        float broad=sin(p.x*.027+p.y*.019+t)*sin(p.y*.032-p.x*.012-t*.7);
        float phase=p.x*.42+p.y*.27+sin(p.y*.11-t)*1.2-t;
        float visibility=1.-smoothstep(.3,1.8,fwidth(phase));
        float ripple=pow(.5+.5*sin(phase),8.)*visibility;
        vec3 color=mix(vec3(.020,.095,.120),vec3(.030,.145,.160),.5+broad*.3);
        color+=vec3(.012,.025,.026)*ripple;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const {minX,maxX,minZ,maxZ}=map.bounds;
  const seaGeometry=new THREE.PlaneGeometry((maxX-minX)*3,(maxZ-minZ)*3);
  seaGeometry.rotateX(-Math.PI/2);seaGeometry.translate((minX+maxX)/2,SEA_LEVEL,(minZ+maxZ)/2);
  const sea=new THREE.Mesh(seaGeometry,seaMaterial);sea.name='Meer um die Nebelinsel';sea.userData.ignoreVision=true;root.add(sea);
  const bank=[],bankIndices=[],ribbon=[],uvs=[],ribbonIndices=[];
  const rings=[...outerLandRings(map).map(points=>({points,hole:false})),...waterBoundaryRings(map).map(points=>({points,hole:true}))];
  for(const {points,hole} of rings){
    const ring=points.slice();if(ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();
    const area=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
    const side=(area>=0?1:-1)*(hole?-1:1),start=bank.length/3,rs=ribbon.length/3;
    for(let i=0;i<=ring.length;i++){
      const [x,z]=ring[i%ring.length],before=ring[(i+ring.length-1)%ring.length],after=ring[(i+1)%ring.length];
      const dx=after[0]-before[0],dz=after[1]-before[1],length=Math.hypot(dx,dz)||1;
      const nx=side*dz/length,nz=-side*dx/length;
      bank.push(x,heightAt(x,z)-.025,z,x,SEA_LEVEL-.25,z);
      ribbon.push(x,SEA_LEVEL+.012,z,x+nx*2.4,SEA_LEVEL+.012,z+nz*2.4);uvs.push(0,0,1,0);
      if(i<ring.length){const a=start+i*2,b=rs+i*2;bankIndices.push(a,a+1,a+2,a+1,a+3,a+2);ribbonIndices.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
  }
  const geometry=(positions,indices)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;};
  const bankMesh=new THREE.Mesh(geometry(bank,bankIndices),new THREE.MeshStandardMaterial({color:'#8b8970',roughness:1,side:THREE.DoubleSide}));
  bankMesh.name='Ufer · natürliche niedrige Küstenkante';bankMesh.userData.ignoreVision=true;root.add(bankMesh);
  const shoreGeometry=geometry(ribbon,ribbonIndices);shoreGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  const shoreMaterial=new THREE.ShaderMaterial({uniforms:{uTime:timeUniform},vertexShader,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    fragmentShader:`uniform float uTime;varying vec2 vPosition;varying vec2 vUv;
      void main(){
        float along=vPosition.x*.7+vPosition.y*.49;
        float broken=.5+.5*sin(along+sin(vPosition.y*.87));
        float edge=.07+sin(along*.6-uTime*.4)*.025;
        float aa=max(fwidth(vUv.x),.018);
        float foam=(1.-smoothstep(edge,edge+aa,vUv.x))*smoothstep(.35,.8,broken);
        float fade=1.-smoothstep(0.,1.,vUv.x);
        vec3 color=mix(vec3(.065,.25,.23),vec3(.37,.51,.46),foam);
        gl_FragColor=vec4(color,fade*(.28+foam*.32));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const shore=new THREE.Mesh(shoreGeometry,shoreMaterial);shore.name='Ufer · türkisfarbener Saum und sanfter Schaum';shore.userData.ignoreVision=true;root.add(shore);
  return {mode:'water',style:'calm-stylized',meshes:3,seaTriangles:2,coastVertices:bank.length/3,
    reflectionPasses:0,particles:0,animated:true};
}
