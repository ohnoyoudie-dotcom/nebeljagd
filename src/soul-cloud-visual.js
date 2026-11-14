import * as THREE from 'three';

/** A rounded, roiling smoke volume. No hard model or blade silhouette at its head. */
export function createSoulCloudVisual(geometry, clock, ownMaterial) {
  const root = new THREE.Group(); root.name = 'Seelenrichter · dunkle Wolke';
  const lobes = [];
  for (let i=0;i<5;i++) {
    const material = ownMaterial(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { uTime: clock, uSeed: { value: i*2.17 },
        uDark: {value: new THREE.Color('#080c13')}, uRim: {value: new THREE.Color('#46535e')} },
      vertexShader: `varying vec2 vUv;
        void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(0.,0.,0.,1.);
          p.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec2 vUv; uniform float uTime,uSeed; uniform vec3 uDark,uRim;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
        float mist(vec2 p){return noise(p)*.55+noise(p*2.1+3.)*.30+noise(p*4.3+7.)*.15;}
        void main(){vec2 p=vUv*2.-1.;float t=uTime*.75+uSeed;
          float n=mist(p*3.2+vec2(sin(t)*.7,-t*.9));
          float r=length(p),edge=r+(n-.5)*.25;
          float a=(1.-smoothstep(.46,.98,edge))*.94;
          float rolls=mist(p*4.5+vec2(t*.5,t*.35));
          float lit=pow(max(0.,.65+dot(p,normalize(vec2(-.5,.8)))*.35),2.);
          vec3 col=mix(uDark,uRim,(.15+rolls*.65)*lit);
          col+=vec3(.035,.045,.055)*pow(n,5.)*(1.-smoothstep(.5,.9,r));
          if(a<.004)discard;gl_FragColor=vec4(col,a);
          #include <colorspace_fragment>
        }`,
    }));
    const cloud = new THREE.Mesh(geometry,material); cloud.frustumCulled=false; root.add(cloud); lobes.push(cloud);
  }
  function update(time) {
    lobes.forEach((p,i)=>{
      const a=i*2.39996+time*.6;
      p.position.set(Math.cos(a)*.20,Math.sin(a*1.3)*.14,.12-i*.12);
      const breadth=1.12+Math.sin(time*2.3+i)*.13;
      p.scale.set(breadth,breadth*(.87+Math.sin(time*1.7+i)*.06),1);
    });
  }
  update(0); return { root, update };
}
