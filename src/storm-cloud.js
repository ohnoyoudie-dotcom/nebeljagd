import * as THREE from 'three';

const clearance=`uniform vec3 uCutouts[8];uniform int uCutoutCount;
float actorClearance(){float a=1.;for(int i=0;i<8;i++){if(i>=uCutoutCount)break;
 a*=mix(.08,1.,smoothstep(uCutouts[i].z*.45,uCutouts[i].z,distance(gl_FragCoord.xy,uCutouts[i].xy)));}return a;}`;

/** Reference artwork on two camera-facing layers. Fine painted volume replaces
 * costly procedural surface meshing; slowly rolling billows keep its detail crisp.
 * The caller owns the shared texture; materials and geometry belong to this cast. */
export function createStormCloud(uniforms,texture=null) {
  const localUniforms={...uniforms,uCloud:{value:texture}};
  const vertexShader=`uniform float uAge,uLayer;varying vec2 vUv;
    void main(){vUv=uv;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
      float phase=uAge*1.4;
      vec2 p=position.xy*vec2(1.+.012*sin(phase),1.+.014*cos(phase*.83));
      p+=vec2(sin(uAge*.65),sin(uAge*.8))*.025;
      // Broad billows roll independently, without smearing the painted detail.
      // The lower edge stays steadier than the illuminated crown.
      float crown=smoothstep(.18,.72,uv.y);
      p+=vec2(.035*sin(uv.y*8.-uAge*.85),.045*cos(uv.x*10.+uAge*.9))*crown;
      p+=uLayer*vec2(.035*sin(uv.y*11.-uAge*1.1),.025*cos(uv.x*13.+uAge*.9));
      gl_Position=projectionMatrix*(center+vec4(p,0.,0.));}`;
  const bodyMaterial=new THREE.ShaderMaterial({uniforms:{...localUniforms,uLayer:{value:0}},transparent:true,depthWrite:false,toneMapped:false,
    vertexShader,fragmentShader:`uniform sampler2D uCloud;uniform float uAge,uOpacity,uFlash;varying vec2 vUv;${clearance}
      void main(){vec2 uv=vUv;
        uv+=vec2(sin(uv.y*9.+uAge*.65),cos(uv.x*8.-uAge*.55))*.0025;
        vec4 tex=texture2D(uCloud,clamp(uv,0.,1.));
        float luma=dot(tex.rgb,vec3(.2126,.7152,.0722));
        // Cool slate recesses and a lit crown read as volume from overhead.
        // Desaturation keeps the quiet cloud from looking electrically neon.
        vec3 body=mix(tex.rgb,vec3(luma),.22);
        float upper=smoothstep(.29,.67,uv.y);
        body*=mix(vec3(.66,.70,.77),vec3(1.08,1.07,1.04),upper);
        body*=.88+.18*smoothstep(.05,.48,luma);
        vec2 core=vec2(.5+.16*sin(uAge*1.2),.48+.09*cos(uAge*1.7));
        float internal=exp(-dot(uv-core,uv-core)*42.)*(.025+.018*sin(uAge*4.3));
        float creases=smoothstep(.025,.15,luma)*(1.-smoothstep(.28,.7,luma));
        vec3 light=vec3(.12,.28,.52)*creases*(uFlash*.65+internal);
        float a=tex.a*uOpacity*actorClearance();if(a<.005)discard;
        gl_FragColor=vec4(body*(1.+uFlash*.12)+light,a);
        #include <colorspace_fragment>
      }`});
  const veilMaterial=new THREE.ShaderMaterial({uniforms:{...localUniforms,uLayer:{value:1}},transparent:true,depthWrite:false,toneMapped:false,
    vertexShader,fragmentShader:`uniform sampler2D uCloud;uniform float uAge,uOpacity,uFlash;varying vec2 vUv;${clearance}
      void main(){vec2 uv=vUv+vec2(sin(uAge*.7+vUv.y*7.),cos(uAge*.6+vUv.x*8.))*.004;
        vec4 tex=texture2D(uCloud,clamp(uv,0.,1.));float wisps=tex.a*(1.-smoothstep(.10,.55,tex.a));
        float a=wisps*(.16+.035*sin(uAge*1.4+vUv.x*6.))*uOpacity*actorClearance();if(a<.003)discard;
        float luma=dot(tex.rgb,vec3(.2126,.7152,.0722));
        gl_FragColor=vec4(mix(tex.rgb,vec3(luma),.28)*(.72+uFlash*.18),a);
        #include <colorspace_fragment>
      }`});
  const veil=new THREE.Mesh(new THREE.PlaneGeometry(5.18,5.18,12,8),veilMaterial);
  veil.position.y=3.38;veil.name='Gewitter · wandernde Wolkenfetzen';
  const body=new THREE.Mesh(new THREE.PlaneGeometry(5.05,5.05,12,8),bodyMaterial);
  body.position.y=3.4;body.name='Gewitterauge · plastische Gewitterwolke';
  for(const mesh of [body,veil])mesh.frustumCulled=false;
  return {meshes:[body,veil],triangles:(body.geometry.index.count+veil.geometry.index.count)/3,horizontalRadius:2.85,artwork: texture?.userData.artwork??null,
    dispose(){for(const mesh of [body,veil]){mesh.geometry.dispose();mesh.material.dispose();}}};
}
