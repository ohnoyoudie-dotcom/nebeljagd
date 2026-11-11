import * as THREE from 'three';

// Cartesian noise keeps the billowing rim seamless, including at the polar seam.
// No angle-multiplied rays, scrolling spiral arms, textures or postprocessing.
const noise = `
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
      mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}`;

/** A single terrain-conforming, raised rolling front. Geometry is borrowed. */
export function createGravityWave(geometry) {
  const material = new THREE.ShaderMaterial({
    name: 'Gravitation · rollende Druckwelle', transparent: true,
    blending: THREE.NormalBlending, side: THREE.DoubleSide, forceSinglePass: true,
    depthWrite: false, toneMapped: false,
    uniforms: { uOpacity: { value: 0 }, uFront: { value: 0 }, uProgress: { value: 0 } },
    vertexShader: `varying vec2 vUv;uniform float uFront,uProgress;
      void main(){vUv=uv;vec3 p=position;float r=length(uv*2.-1.);
        float ridge=exp(-pow((r-uFront)/.10,2.));
        p.y+=ridge*.48*(1.-uProgress*.45);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uOpacity,uFront,uProgress;
      ${noise}
      void main(){vec2 p=vUv*2.-1.;float r=length(p);
        float billow=noise(p*13.+vec2(uProgress*1.8,-uProgress*2.));
        float fine=noise(p*31.-uProgress*3.);
        float d=r-uFront+(billow-.5)*.075;
        float body=exp(-pow((d+.025)/.10,2.));
        float crest=exp(-pow((d-.012)/.028,2.));
        float mist=exp(-pow((d+.085)/.16,2.))*(.45+.55*fine);
        // Remove the interior completely once the rolling front has passed.
        float wake=smoothstep(uFront-.29,uFront-.17,r);
        float edge=1.-smoothstep(.95,1.,r);
        float alpha=(body*(.70+.15*fine)+crest*.25+mist*.35)*wake*edge*uOpacity;
        vec3 color=mix(vec3(.14,.012,.29),vec3(.46,.055,.88),body);
        color=mix(color,vec3(.87,.48,1.),crest*(.30+.70*fine));
        color+=vec3(.065,.025,.075)*billow*body;
        gl_FragColor=vec4(color,min(.96,alpha));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Gravitation · letzter Flächenimpuls'; mesh.position.y = .018;
  // The borrowed geometry's bounds do not include the animated raised ridge.
  mesh.frustumCulled = false;
  return mesh;
}

/** Round, camera-facing central flash; no starburst art or rectangular sprite. */
export function createGravityFlash() {
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    toneMapped: false, uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(0.,0.,0.,1.);
        p.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));
        gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;uniform float uOpacity;
      void main(){float r=length(vUv*2.-1.);
        float core=1.-smoothstep(.05,.42,r);
        float halo=exp(-r*r*6.)*(1.-smoothstep(.7,1.,r));
        gl_FragColor=vec4(mix(vec3(.52,.12,.95),vec3(1.,.88,1.),core),
          min(1.,core+halo*.8)*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = 'Gravitation · Aufblitzen beim Kollaps'; mesh.frustumCulled = false;
  return mesh;
}
