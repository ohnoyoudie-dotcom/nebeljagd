import * as THREE from 'three';

/** Shared sandy target warning, tinted per spell, and a thin expanding reach
 * circle. The bright rim marks the gameplay area; sparks only soften its edge. */
export function createStaffAimRing(radius, { range = false, color = '#e4ffa1' } = {}) {
  if (!range) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.16, radius * 2.16), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float uTime,uOpacity;uniform vec3 uColor;
        void main(){vec2 p=(vUv*2.-1.)*1.08;float r=length(p),a=atan(p.y,p.x+.00001);
          float ring=exp(-pow((r-.985)/.009,2.));float haze=exp(-pow((r-.98)/.038,2.))*.21;
          float motes=pow(max(0.,sin(a*47.+sin(a*13.)*2.+uTime*.7)),28.);
          float drift=.96+.055*sin(a*19.-uTime*1.6);
          float sparks=motes*exp(-pow((r-drift)/.018,2.));
          float alpha=(ring*.85+haze+sparks*.8)*uOpacity;
          gl_FragColor=vec4(uColor*(1.+sparks*.5),alpha);
          #include <colorspace_fragment>
        }`,
    }));
    mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 30; mesh.visible = false;
    mesh.userData.areaRadius = radius;
    mesh.userData.update = (age, opacity = 1) => { mesh.material.uniforms.uTime.value = age; mesh.material.uniforms.uOpacity.value = opacity; };
    return mesh;
  }
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius - (range ? .055 : .07), radius, range ? 96 : 48),
    new THREE.MeshBasicMaterial({ color: '#e4ffa1', side: THREE.DoubleSide,
      transparent: true, opacity: range ? .3 : .85, depthWrite: false, depthTest: false,
      forceSinglePass: true }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = range ? 29 : 30;
  mesh.visible = false;
  return mesh;
}
