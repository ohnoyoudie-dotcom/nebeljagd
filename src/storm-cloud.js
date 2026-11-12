import * as THREE from 'three';

// One continuous silhouette: the banks fuse into an asymmetric thunderhead,
// rather than exposing the intersecting shells of individual spheres.
const BANKS = [
  [-.48, -.20, .02, .91, .43, .72], [.40, -.19, -.01, .89, .44, .70],
  [-1.02, -.01, -.12, .61, .39, .52], [.99, .02, -.07, .56, .45, .51],
  [-.45, .27, -.28, .72, .59, .62], [.28, .42, -.19, .73, .59, .63],
  [.66, .15, .43, .60, .46, .51], [-.38, .12, .51, .67, .47, .52],
  [-.94, .04, .42, .43, .32, .39], [.10, -.20, .75, .50, .30, .36],
  [-.62, -.16, -.64, .57, .29, .37], [.54, -.13, -.62, .61, .31, .39],
  [-1.20, .12, .30, .39, .34, .36], [.98, -.08, .53, .40, .29, .35],
  [-.82, .31, -.55, .40, .36, .35], [.59, .62, -.12, .38, .35, .34],
];
const smoothMin = (a, b, k) => {
  const h = Math.max(0, Math.min(1, .5 + .5 * (b-a) / k));
  return b + (a-b)*h - k*h*(1-h);
};
function density(x,y,z) {
  let d=10;
  for(const [bx,by,bz,rx,ry,rz] of BANKS) {
    const dx=(x-bx)/rx,dy=(y-by)/ry,dz=(z-bz)/rz;
    d=smoothMin(d,(Math.sqrt(dx*dx+dy*dy+dz*dz)-1)*Math.min(rx,ry,rz),.13);
  }
  return d;
}
let cloudGeometryTemplate;
function buildCloudGeometry() {
  if(cloudGeometryTemplate)return cloudGeometryTemplate.clone();
  const min=[-1.85,-.76,-1.35], max=[1.85,1.10,1.35], steps=[29,16,22];
  const positions=[], normals=[], shading=[];
  const nx=steps[0]+1, ny=steps[1]+1, nz=steps[2]+1;
  const values=new Float32Array(nx*ny*nz), points=new Float32Array(nx*ny*nz*3);
  const id=(x,y,z)=>(x*ny+y)*nz+z;
  for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++) {
    const i=id(x,y,z),px=min[0]+(max[0]-min[0])*x/steps[0],py=min[1]+(max[1]-min[1])*y/steps[1],pz=min[2]+(max[2]-min[2])*z/steps[2];
    points[i*3]=px;points[i*3+1]=py;points[i*3+2]=pz;values[i]=density(px,py,pz);
  }
  const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const cube=new Array(8), inside=[], outside=[];
  function edge(a,b) {
    const t=values[a]/(values[a]-values[b]);
    return [points[a*3]+(points[b*3]-points[a*3])*t,points[a*3+1]+(points[b*3+1]-points[a*3+1])*t,points[a*3+2]+(points[b*3+2]-points[a*3+2])*t];
  }
  function vertex(p) {
    const [x,y,z]=p,e=.008;
    let dx=density(x+e,y,z)-density(x-e,y,z),dy=density(x,y+e,z)-density(x,y-e,z),dz=density(x,y,z+e)-density(x,y,z-e);
    const l=Math.hypot(dx,dy,dz)||1;dx/=l;dy/=l;dz/=l;
    positions.push(x,y,z);normals.push(dx,dy,dz);
    // Static self-shadowing makes adjacent bulges read as one deep volume.
    let shadow=1;
    for(const t of [.13,.30,.55,.90]) {
      const sample=density(x-.58*t+dx*.025,y+.76*t+dy*.025,z+.30*t+dz*.025);
      shadow=Math.min(shadow,Math.max(.16,Math.min(1,sample/t*7)));
    }
    const above=density(x+dx*.05,y+.20+dy*.05,z+dz*.05);
    shading.push(shadow,THREE.MathUtils.clamp(above/.15,.3,1));
  }
  function triangle(a,b,c) {
    const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const cx=(a[0]+b[0]+c[0])/3,cy=(a[1]+b[1]+c[1])/3,cz=(a[2]+b[2]+c[2])/3;
    const e=.005, orientation=cross[0]*(density(cx+e,cy,cz)-density(cx-e,cy,cz))
      +cross[1]*(density(cx,cy+e,cz)-density(cx,cy-e,cz))+cross[2]*(density(cx,cy,cz+e)-density(cx,cy,cz-e));
    vertex(a);if(orientation>=0){vertex(b);vertex(c);}else{vertex(c);vertex(b);}
  }
  for(let x=0;x<steps[0];x++)for(let y=0;y<steps[1];y++)for(let z=0;z<steps[2];z++) {
    cube[0]=id(x,y,z);cube[1]=id(x+1,y,z);cube[2]=id(x+1,y+1,z);cube[3]=id(x,y+1,z);
    cube[4]=id(x,y,z+1);cube[5]=id(x+1,y,z+1);cube[6]=id(x+1,y+1,z+1);cube[7]=id(x,y+1,z+1);
    for(const tetra of tetrahedra) {
      inside.length=outside.length=0;for(const corner of tetra)(values[cube[corner]]<0?inside:outside).push(cube[corner]);
      if(inside.length===0||inside.length===4)continue;
      if(inside.length===1)triangle(edge(inside[0],outside[0]),edge(inside[0],outside[1]),edge(inside[0],outside[2]));
      else if(inside.length===3)triangle(edge(outside[0],inside[0]),edge(outside[0],inside[1]),edge(outside[0],inside[2]));
      else {
        const a=edge(inside[0],outside[0]),b=edge(inside[0],outside[1]),c=edge(inside[1],outside[0]),d=edge(inside[1],outside[1]);
        triangle(a,b,c);triangle(b,d,c);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('aShade',new THREE.Float32BufferAttribute(shading,2));
  geometry.computeBoundingSphere();
  cloudGeometryTemplate=geometry;
  return geometry.clone();
}
const textureNoise=`
float hash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float billow(vec3 p){return noise3(p)*.7+noise3(p*2.07)*.3;}`;
const bodyCutouts=`uniform vec3 uCutouts[8];uniform int uCutoutCount;
float bodyClearance(){float alpha=1.;for(int i=0;i<8;i++){if(i>=uCutoutCount)break;
float clear=smoothstep(uCutouts[i].z*.45,uCutouts[i].z,distance(gl_FragCoord.xy,uCutouts[i].xy));alpha*=mix(.08,1.,clear);}return alpha;}`;

/** A fused, self-shadowed thunderhead. CPU meshing occurs only on creation;
 * runtime uses three bounded draws and shares the storm's body-clearance uniforms. */
export function createStormCloud(uniforms) {
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:true,toneMapped:false,
    vertexShader:`uniform float uAge;attribute vec2 aShade;varying vec2 vShade;varying vec3 vLocal,vNormal,vView;
      void main(){vec3 p=position;
        float roll=sin(p.x*3.1+p.z*2.8-uAge*1.8)*sin(p.y*4.3+p.z*2.1+uAge*.9);
        p+=normal*(roll*.025);p.x+=sin(p.z*2.4+uAge*.65)*.035;
        vLocal=p;vShade=aShade;vNormal=normalize(mat3(modelMatrix)*normal);
        vec4 world=modelMatrix*vec4(p,1.);vView=cameraPosition-world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform float uAge,uOpacity,uFlash;varying vec2 vShade;varying vec3 vLocal,vNormal,vView;${textureNoise}${bodyCutouts}
      void main(){vec3 n=normalize(vNormal),view=normalize(vView),sun=normalize(vec3(-.58,.76,.30));
        float f=billow(vLocal*4.3+vec3(uAge*.10,uAge*.08,-uAge*.12));
        float diffuse=max(0.,dot(n,sun));float shadow=vShade.x;
        float height=smoothstep(-.5,.8,vLocal.y),occlusion=vShade.y;
        vec3 ambient=mix(vec3(.008,.014,.030),vec3(.025,.041,.071),height)*occlusion;
        vec3 silver=vec3(.24,.29,.35)*pow(diffuse,1.3)*shadow*(.42+.58*height);
        vec3 shade=(ambient+silver)*(.86+f*.22);
        float rim=pow(1.-max(0.,dot(n,view)),3.);
        shade+=vec3(.23,.31,.42)*rim*pow(max(.0,dot(n,sun)+.4),2.)*shadow;
        vec3 core=vec3(.35*sin(uAge*2.5),.05,.28*cos(uAge*2.));
        float distanceToCore=length(vLocal-core);
        float lighting=exp(-distanceToCore*distanceToCore*1.7);
        float inner=.055*pow(.5+.5*sin(uAge*9.+vLocal.x*2.),6.)+uFlash;
        float fissure=pow(max(0.,1.-abs(f-.53)*16.),3.);
        shade+=vec3(.16,.42,.85)*lighting*inner*(.4+fissure*.65);
        // Grazing edges dissolve gently, while the opaque body keeps deep shadows.
        float edge=smoothstep(.03,.38,max(0.,dot(n,view)));
        float alpha=.97*edge*uOpacity*bodyClearance();
        if(alpha<.02)discard;
        gl_FragColor=vec4(shade,alpha);
        #include <colorspace_fragment>
      }`,
  });
  const body=new THREE.Mesh(buildCloudGeometry(),material);
  body.name='Gewitterauge · plastische Gewitterwolke';body.position.y=3.4;
  const skirtGeometry=new THREE.PlaneGeometry(3.8,3.05);skirtGeometry.rotateX(-Math.PI/2);
  const skirtMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uAge,uOpacity,uFlash;varying vec2 vUv;${textureNoise}${bodyCutouts}
      void main(){vec2 p=vUv*2.-1.;float r=length(p);float turbulence=billow(vec3(p*4.,uAge*.25));
        float edge=1.-smoothstep(.38+turbulence*.23,.77+turbulence*.20,r);
        float folds=.45+.55*billow(vec3(p*9.+vec2(uAge*.13,-uAge*.20),uAge*.11));
        gl_FragColor=vec4(mix(vec3(.018,.031,.052),vec3(.055,.12,.22),uFlash*.6),edge*folds*.44*uOpacity*bodyClearance());
        #include <colorspace_fragment>
      }`,
  });
  const skirt=new THREE.Mesh(skirtGeometry,skirtMaterial);skirt.position.y=3.03;skirt.name='Gewitter · wandernde Wolkenfetzen';
  const haloMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,toneMapped:false,
    vertexShader:`uniform float uAge;varying vec3 vLocal,vNormal,vView;
      void main(){vec3 p=position*1.065+normal*(.025+.016*sin(position.x*4.+position.z*3.-uAge*1.3));
        vLocal=p;vNormal=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(p,1.);vView=cameraPosition-w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float uAge,uOpacity,uFlash;varying vec3 vLocal,vNormal,vView;${textureNoise}${bodyCutouts}
      void main(){float grazing=1.-max(0.,dot(normalize(vNormal),normalize(vView)));
        float f=billow(vLocal*6.+vec3(uAge*.14,-uAge*.12,uAge*.1));
        float feather=pow(grazing,.8)*pow(max(0.,1.-grazing),.65);
        vec3 color=mix(vec3(.10,.17,.26),vec3(.23,.34,.48),f);
        gl_FragColor=vec4(color,feather*(.12+f*.16)*uOpacity*bodyClearance());
        #include <colorspace_fragment>
      }`,
  });
  const halo=new THREE.Mesh(body.geometry.clone(),haloMaterial);halo.position.y=3.4;halo.name='Gewitter · silbriger Wolkendunst';
  const p=body.geometry.attributes.position;let horizontalRadius=0;
  for(let i=0;i<p.count;i++)horizontalRadius=Math.max(horizontalRadius,Math.hypot(p.getX(i),p.getZ(i)));
  return {meshes:[body,skirt,halo],triangles:p.count/3*2+2,horizontalRadius:horizontalRadius*1.10,dispose(){for(const mesh of [body,skirt,halo]){mesh.geometry.dispose();mesh.material.dispose();}}};
}
