import * as THREE from 'three';

const clearance=`uniform vec3 uCutouts[8];uniform int uCutoutCount;
float actorClearance(){float a=1.;for(int i=0;i<8;i++){if(i>=uCutoutCount)break;
 a*=mix(.08,1.,smoothstep(uCutouts[i].z*.45,uCutouts[i].z,distance(gl_FragCoord.xy,uCutouts[i].xy)));}return a;}`;

/** Reference artwork on two camera-facing layers. Fine painted volume replaces
 * costly procedural surface meshing; UV advection and light animate the cloud.
 * The caller owns the shared texture; materials and geometry belong to this cast. */
export function createStormCloud(uniforms,texture=null) {
  const localUniforms={...uniforms,uCloud:{value:texture}};
  const vertexShader=`uniform float uAge;varying vec2 vUv;
    void main(){vUv=uv;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
      vec2 p=position.xy*(1.+.012*sin(uAge*2.2));
      gl_Position=projectionMatrix*(center+vec4(p,0.,0.));}`;
  const bodyMaterial=new THREE.ShaderMaterial({uniforms:localUniforms,transparent:true,depthWrite:false,toneMapped:false,
    vertexShader,fragmentShader:`uniform sampler2D uCloud;uniform float uAge,uOpacity,uFlash;varying vec2 vUv;${clearance}
      void main(){vec2 uv=vUv;
        uv+=vec2(sin(uv.y*14.+uAge*.8),cos(uv.x*12.-uAge*.65))*.0035;
        vec4 tex=texture2D(uCloud,clamp(uv,0.,1.));
        float blue=max(0.,tex.b-tex.r*.8);
        vec3 light=vec3(.10,.27,.55)*uFlash*(.15+blue);
        float a=tex.a*uOpacity*actorClearance();if(a<.005)discard;
        gl_FragColor=vec4(tex.rgb*(.86+uFlash*.14)+light,a);
        #include <colorspace_fragment>
      }`});
  const veilMaterial=new THREE.ShaderMaterial({uniforms:localUniforms,transparent:true,depthWrite:false,toneMapped:false,
    vertexShader,fragmentShader:`uniform sampler2D uCloud;uniform float uAge,uOpacity,uFlash;varying vec2 vUv;${clearance}
      void main(){vec2 uv=vUv+vec2(sin(uAge*.7+vUv.y*9.),cos(uAge*.5+vUv.x*10.))*.007;
        vec4 tex=texture2D(uCloud,clamp(uv,0.,1.));float wisps=tex.a*(1.-smoothstep(.15,.8,tex.a));
        float a=wisps*.22*uOpacity*actorClearance();if(a<.003)discard;
        gl_FragColor=vec4(tex.rgb*(.8+uFlash*.25),a);
        #include <colorspace_fragment>
      }`});
  const veil=new THREE.Mesh(new THREE.PlaneGeometry(3.8,3.8),veilMaterial);
  veil.position.y=3.38;veil.name='Gewitter · wandernde Wolkenfetzen';
  const body=new THREE.Mesh(new THREE.PlaneGeometry(3.65,3.65),bodyMaterial);
  body.position.y=3.4;body.name='Gewitterauge · plastische Gewitterwolke';
  for(const mesh of [body,veil])mesh.frustumCulled=false;
  return {meshes:[body,veil],triangles:4,horizontalRadius:1.9,artwork: texture?.userData.artwork??null,
    dispose(){for(const mesh of [body,veil]){mesh.geometry.dispose();mesh.material.dispose();}}};
}
