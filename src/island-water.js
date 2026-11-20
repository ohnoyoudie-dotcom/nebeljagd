import * as THREE from 'three';
import { outerLandRings, waterBoundaryRings, isLandPoint } from './map/model.js';
import { SEA_LEVEL } from './generated-spatial.js';

/** Three shared meshes, no reflection pass, textures, particles or geometry updates. */
export function createIslandWater(root, { map, heightAt, timeUniform, colorAt = null }) {
  const vertexShader = `varying vec2 vPosition; varying vec2 vUv;
    void main(){vPosition=(modelMatrix*vec4(position,1.)).xz;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const seaMaterial = new THREE.ShaderMaterial({
    uniforms:{uTime:timeUniform}, vertexShader,
    fragmentShader:`uniform float uTime; varying vec2 vPosition;
      void main(){
        vec2 p=vPosition;float t=uTime*.18;
        float broad=sin(p.x*.027+p.y*.019+t)*sin(p.y*.032-p.x*.012-t*.7);
        float phase=p.x*.42+p.y*.27+sin(p.y*.11-t)*1.2-t;
        float visibility=1.-smoothstep(.08,.35,fwidth(phase));
        float ripple=pow(.5+.5*sin(phase),8.)*visibility;
        vec3 color=mix(vec3(.020,.095,.120),vec3(.030,.145,.160),.5+broad*.3);
        color+=vec3(.008,.015,.016)*ripple;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const {minX,maxX,minZ,maxZ}=map.bounds;
  const seaGeometry=new THREE.PlaneGeometry((maxX-minX)*3,(maxZ-minZ)*3);
  seaGeometry.rotateX(-Math.PI/2);seaGeometry.translate((minX+maxX)/2,SEA_LEVEL,(minZ+maxZ)/2);
  const sea=new THREE.Mesh(seaGeometry,seaMaterial);sea.name='Meer um die Nebelinsel';sea.userData.ignoreVision=true;root.add(sea);
  const bank=[],bankIndices=[],bankColors=[],ribbon=[],uvs=[],ribbonIndices=[];
  const tint=new THREE.Color(),wetSand=new THREE.Color('#71867a');
  const rings=[...outerLandRings(map).map(points=>({points,hole:false})),...waterBoundaryRings(map).map(points=>({points,hole:true}))];
  for(const {points,hole} of rings){
    const outline=points.slice();if(outline.length>1&&outline[0][0]===outline.at(-1)[0]&&outline[0][1]===outline.at(-1)[1])outline.pop();
    const ring=[];
    for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));for(let j=0;j<steps;j++)ring.push([THREE.MathUtils.lerp(a[0],b[0],j/steps),THREE.MathUtils.lerp(a[1],b[1],j/steps)]);}
    const area=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
    const side=(area>=0?1:-1)*(hole?-1:1),start=bank.length/3,rs=ribbon.length/3;
    for(let i=0;i<=ring.length;i++){
      const [x,z]=ring[i%ring.length],before=ring[(i+ring.length-1)%ring.length],after=ring[(i+1)%ring.length];
      const dx=after[0]-before[0],dz=after[1]-before[1],length=Math.hypot(dx,dz)||1;
      const nx=side*dz/length,nz=-side*dx/length;
      // Trim shallow water at opposite banks instead of painting over narrow islands.
      let width=9+Math.sin(x*.09+z*.07)*1.3;
      for(let d=.3;d<width;d+=.4)if(isLandPoint(map,[x+nx*d,z+nz*d])){width=Math.max(.15,d-.4);break;}
      const beach=Math.min(2.8,width*.3);
      bank.push(x,heightAt(x,z)-.025,z,x+nx*beach,SEA_LEVEL-.22,z+nz*beach);
      colorAt?colorAt(x,z,tint):tint.set('#b4aa7f');bankColors.push(...tint.toArray(),...tint.lerp(wetSand,.65).multiplyScalar(.8).toArray());
      ribbon.push(x,SEA_LEVEL+.012,z,x+nx*width,SEA_LEVEL+.012,z+nz*width);uvs.push(0,beach/width,1,beach/width);
      if(i<ring.length){const a=start+i*2,b=rs+i*2;bankIndices.push(a,a+1,a+2,a+1,a+3,a+2);ribbonIndices.push(b,b+1,b+2,b+1,b+3,b+2);}
    }
  }
  const geometry=(positions,indices)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;};
  const bankMesh=new THREE.Mesh(geometry(bank,bankIndices),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));
  bankMesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(bankColors,3));
  bankMesh.name='Ufer · sanft abfallender Strand';bankMesh.userData.ignoreVision=true;root.add(bankMesh);
  const shoreGeometry=geometry(ribbon,ribbonIndices);shoreGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  const shoreMaterial=new THREE.ShaderMaterial({uniforms:{uTime:timeUniform},vertexShader,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    fragmentShader:`uniform float uTime;varying vec2 vPosition;varying vec2 vUv;
      void main(){
        float depth=smoothstep(vUv.y*.65,1.,vUv.x);
        float mottling=sin(vPosition.x*.32+sin(vPosition.y*.21))*sin(vPosition.y*.24-vPosition.x*.13);
        vec3 shallow=vec3(.12,.27,.23)+mottling*.008;
        vec3 turquoise=vec3(.035,.19,.19);
        vec3 color=mix(shallow,turquoise,smoothstep(0.,.55,depth));
        // A broad continuous depth gradient, no bright outline or repeated foam stripes.
        float fade=1.-smoothstep(.1,1.,depth);
        gl_FragColor=vec4(color,fade*.72);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const shore=new THREE.Mesh(shoreGeometry,shoreMaterial);shore.name='Ufer · türkisfarbener Saum und sanfter Schaum';shore.userData.ignoreVision=true;root.add(shore);
  return {mode:'water',style:'calm-stylized',meshes:3,seaTriangles:2,coastVertices:bank.length/3,shoreProfile:'sloped-shallow-gradient',
    reflectionPasses:0,particles:0,animated:true};
}
