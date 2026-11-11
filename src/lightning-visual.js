import * as THREE from 'three';

/** Two crossed ribbons keep the branching discharge readable from above.
 * Fixed buffers, no lights, textures, or per-frame geometry allocation. */
export function createLightningVisual({ impact = false, ownGeometry = x => x, ownMaterial = x => x } = {}) {
  const group = new THREE.Group();
  group.name = impact ? 'Blitz · verzweigter Trefferimpuls' : 'Blitz · verzweigtes Projektil';
  const material = ownMaterial(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: 0 }, uFade: { value: 1 }, uImpact: { value: impact ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uAge,uFade,uImpact;
      float hash(float n){return fract(sin(n*127.1+floor(uAge*24.)*19.7)*43758.5453);}
      float jag(float t,float seed){float n=t*9.;return mix(hash(floor(n)+seed),hash(floor(n)+1.+seed),fract(n))-.5;}
      void main(){vec2 p=vUv*2.-1.;float d,mask;
        if(uImpact>.5){
          float r=length(p),a=atan(p.y,p.x),sector=floor((a+3.14159)/.785398);
          float ray=abs(sin(a*4.+jag(r,sector)*.8));
          d=ray*r;mask=(1.-smoothstep(.65,1.,r))*smoothstep(0.,.09,r);
        }else{
          float t=(p.y+1.)*.5,center=jag(t,2.)*.23;
          d=abs(p.x-center);
          for(int i=0;i<3;i++){
            float k=float(i),start=.2+k*.2,branch=(t-start)*1.7;
            float side=mod(k,2.)*2.-1.;
            float fork=abs(p.x-(center+side*branch+jag(t,15.+k)*.10));
            if(t>start&&t<start+.28)d=min(d,fork+.012);
          }
          mask=smoothstep(-1.,-.75,p.y)*(1.-smoothstep(.7,1.,p.y));
        }
        float core=exp(-d*mix(180.,80.,uImpact)),glow=exp(-d*mix(27.,16.,uImpact));
        vec3 color=mix(vec3(.10,.40,.95),vec3(1.,.92,.66),core);
        gl_FragColor=vec4(color,(core+glow*.48)*mask*uFade);
        #include <colorspace_fragment>
      }`,
  }));
  const geometry = ownGeometry(new THREE.PlaneGeometry(impact ? 3.6 : 1.05, impact ? 3.6 : 2.05));
  const horizontal = new THREE.Mesh(geometry, material), vertical = new THREE.Mesh(geometry, material);
  horizontal.rotation.x = -Math.PI / 2;
  if (!impact) { vertical.rotation.x = -Math.PI / 2; vertical.rotation.z = Math.PI / 2; vertical.rotation.order = 'ZXY'; }
  group.add(horizontal, vertical);
  return { group, update(age, fade = 1) {
    material.uniforms.uAge.value = age; material.uniforms.uFade.value = fade;
    if (impact) group.scale.setScalar(.6 + Math.min(1, age / .38) * .7);
  } };
}
