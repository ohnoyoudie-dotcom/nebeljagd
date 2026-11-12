import * as THREE from 'three';

const clearance=`uniform vec3 uCutouts[8];uniform int uCutoutCount;
float actorClearance(){float a=1.;for(int i=0;i<8;i++){if(i>=uCutoutCount)break;
 a*=mix(.08,1.,smoothstep(uCutouts[i].z*.45,uCutouts[i].z,distance(gl_FragCoord.xy,uCutouts[i].xy)));}return a;}`;

/** Reference artwork on two camera-facing layers. Fine painted volume replaces
 * costly procedural surface meshing; UV advection and light animate the cloud.
 * The caller owns the shared texture; materials and geometry belong to this cast. */
export function createStormCloud(uniforms,texture=null) {
  const localUniforms={...uniforms,uCloud:{value:texture}};
  const vertexShader=`uniform float uAge,uLayer;varying vec2 vUv;
    void main(){vUv=uv;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
      float phase=uAge*2.1+uLayer*1.8;
      vec2 p=position.xy*vec2(1.+.025*sin(phase),1.+.018*cos(phase*.83));
      p+=vec2(sin(uAge*.85+uLayer*2.),sin(uAge*1.35+uLayer))*(.035+uLayer*.035);
      // Only the tessellated outer veil curls locally; the painted body keeps
      // its form while wisps drift independently around its silhouette.
      p+=uLayer*vec2(.09*sin(uv.y*11.-uAge*1.4),.06*cos(uv.x*13.+uAge*1.1));
      gl_Position=projectionMatrix*(center+vec4(p,0.,0.));}`;
  const bodyMaterial=new THREE.ShaderMaterial({uniforms:{...localUniforms,uLayer:{value:0}},transparent:true,depthWrite:false,toneMapped:false,
    vertexShader,fragmentShader:`uniform sampler2D uCloud;uniform float uAge,uOpacity,uFlash;varying vec2 vUv;${clearance}
      void main(){vec2 uv=vUv;
        uv+=vec2(sin(uv.y*13.+uAge*1.5),cos(uv.x*11.-uAge*1.1))*.009;
        uv+=vec2(cos(uv.y*24.-uAge*.65),sin(uv.x*21.+uAge*.8))*.003;
        vec4 tex=texture2D(uCloud,clamp(uv,0.,1.));
        float blue=max(0.,tex.b-tex.r*.8);
        vec2 core=vec2(.5+.20*sin(uAge*1.7),.48+.12*cos(uAge*2.3));
        float internal=exp(-dot(uv-core,uv-core)*35.)*(.12+.08*sin(uAge*5.1));
        vec3 light=vec3(.10,.27,.55)*(uFlash*(.15+blue)+internal*blue);
        float a=tex.a*uOpacity*actorClearance();if(a<.005)discard;
        gl_FragColor=vec4(tex.rgb*(.86+uFlash*.14)+light,a);
        #include <colorspace_fragment>
      }`});
  const veilMaterial=new THREE.ShaderMaterial({uniforms:{...localUniforms,uLayer:{value:1}},transparent:true,depthWrite:false,toneMapped:false,
    vertexShader,fragmentShader:`uniform sampler2D uCloud;uniform float uAge,uOpacity,uFlash;varying vec2 vUv;${clearance}
      void main(){vec2 uv=vUv+vec2(sin(uAge*1.2+vUv.y*9.),cos(uAge*.9+vUv.x*10.))*.017;
        vec4 tex=texture2D(uCloud,clamp(uv,0.,1.));float wisps=tex.a*(1.-smoothstep(.15,.8,tex.a));
        float a=wisps*(.38+.10*sin(uAge*2.7+vUv.x*6.))*uOpacity*actorClearance();if(a<.003)discard;
        gl_FragColor=vec4(tex.rgb*(.72+uFlash*.25),a);
        #include <colorspace_fragment>
      }`});
  const veil=new THREE.Mesh(new THREE.PlaneGeometry(4.55,4.55,16,10),veilMaterial);
  veil.position.y=3.38;veil.name='Gewitter · wandernde Wolkenfetzen';
  const body=new THREE.Mesh(new THREE.PlaneGeometry(4.4,4.4),bodyMaterial);
  body.position.y=3.4;body.name='Gewitterauge · plastische Gewitterwolke';
  for(const mesh of [body,veil])mesh.frustumCulled=false;
  return {meshes:[body,veil],triangles:(body.geometry.index.count+veil.geometry.index.count)/3,horizontalRadius:2.5,artwork: texture?.userData.artwork??null,
    dispose(){for(const mesh of [body,veil]){mesh.geometry.dispose();mesh.material.dispose();}}};
}
