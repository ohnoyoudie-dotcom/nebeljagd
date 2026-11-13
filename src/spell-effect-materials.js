import * as THREE from 'three';

const COLORS = {
  sunStaff: ['#8c6325', '#eac171', '#fff6d4'],
  soulStaff: ['#16131c', '#32243f', '#776080'],
  hourglassStaff: ['#725023', '#d29d43', '#fff0bd'],
  fireStaff: ['#a61908', '#f15a0d', '#ffd16b'],
  iceStaff: ['#14578d', '#36b9e0', '#c2f4ff'],
  poisonStaff: ['#153c21', '#47ae45', '#c6ef83'],
  moonStaff: ['#44316c', '#aa8bdb', '#f1e8ff'],
  starStaff: ['#284b78', '#6bc7ed', '#fff3b8'],
  lightningStaff: ['#17335c', '#58adff', '#fff5cf'],
  gravityStaff: ['#281a35', '#60466f', '#a28eae'],
};
const MODES = { body: 0, trail: 1, shock: 2, cloud: 3, rays: 4, charge: 5 };

/** Unlit, normally blended color preserves saturated flames under ACES exposure. */
export function createElementMaterial(kind, clock, { type = 'fireStaff', opacity = 1, billboard = false } = {}) {
  const material = new THREE.ShaderMaterial({
    name: `Element ${kind}`, transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, blending: THREE.NormalBlending, toneMapped: false,
    defines: { ...(kind === 'trail' ? { ELEMENT_TRAIL: 1 } : {}), ...(billboard ? { ELEMENT_BILLBOARD: 1 } : {}) },
    uniforms: { uTime: clock, uOpacity: { value: opacity }, uIce: { value: 0 }, uCloudTint: { value: 0 },
      uMode: { value: MODES[kind] }, uDark: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() }, uLight: { value: new THREE.Color() } },
    vertexShader: `
      varying vec2 vUv;
      varying float vFade;
      #ifdef ELEMENT_TRAIL
        attribute float aFade;
      #endif
      void main() {
        vUv = uv;
        #ifdef ELEMENT_TRAIL
          vFade = aFade;
        #else
          vFade = 1.0;
        #endif
        #ifdef ELEMENT_BILLBOARD
          vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          center.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
          gl_Position = projectionMatrix * center;
        #else
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #endif
      }`,
    fragmentShader: `
      uniform float uTime, uOpacity, uIce, uCloudTint, uMode;
      uniform vec3 uDark, uMid, uLight;
      varying vec2 vUv;
      varying float vFade;
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
      }
      float turbulence(vec2 p) {
        return .55 * noise(p) + .28 * noise(p * 2.03 + 7.1) + .17 * noise(p * 4.11 + 17.3);
      }
      void main() {
        float alpha = 0.0, heat = 0.0;
        vec3 color = uMid;
        vec2 p = vUv * 2.0 - 1.0;
        float n = turbulence(vec2(vUv.x * 4.0, vUv.y * 7.0 + uTime * 3.5));
        if (uMode < 1.5) {
          float longitudinal = clamp(vUv.y, .001, .999);
          float warp = sin(longitudinal * 11.0 + uTime * 6.0) * .09 + (n - .5) * .19;
          float width = uMode < .5 ? pow(sin(longitudinal * 3.14159), .70) * (.46 + longitudinal * .32) : .88;
          float edge = abs(p.x + warp * (1.0 - longitudinal * .4)) / max(.02, width);
          float tongue = turbulence(vec2(vUv.x * 5.0 + n, vUv.y * 8.0 + uTime * 5.0));
          float body = 1.0 - smoothstep(.42 + tongue * .27, 1.0, edge);
          float filaments = smoothstep(.16, .66, tongue + longitudinal * .18);
          alpha = body * mix(filaments, .65 + tongue * .30, uIce);
          if (uMode < .5) alpha *= smoothstep(0.0, .11, longitudinal) * (1.0 - smoothstep(.88, 1.0, longitudinal));
          heat = clamp((1.0 - edge) * .62 + tongue * .38, 0.0, 1.0);
          color = mix(uDark, uMid, smoothstep(.02, .72, heat));
          color = mix(color, uLight, smoothstep(.76, 1.0, heat) * mix(.80, .40, uIce));
          alpha *= mix(.95, .48, uIce);
        } else {
          float radius = length(p), angle = radius > .00001 ? atan(p.y, p.x) : 0.0;
          float cloud = turbulence(p * 3.2 + vec2(uTime * .65, -uTime * .85));
          if (uMode < 2.5) {
            float front = .66 + (cloud - .5) * .13;
            alpha = (1.0 - smoothstep(.045, .18, abs(radius - front))) * (.55 + cloud * .45);
            color = mix(uMid, uLight, .30 + cloud * .25);
          } else if (uMode < 3.5) {
            alpha = exp(-radius * radius * 3.8) * (1.0 - smoothstep(.55, 1.0, radius)) * (.4 + cloud * .6);
            color = mix(vec3(.075, .050, .042), mix(uMid, uLight, cloud * .5), uCloudTint);
          } else if (uMode < 4.5) {
            float branch = pow(abs(sin(angle * 5.0 + cloud * .7)), 28.0);
            alpha = branch * smoothstep(.12, .32, radius) * (1.0 - smoothstep(.5, .96, radius));
            color = mix(uMid, uLight, .72);
          } else {
            float spiral = .5 + .5 * sin(angle * 3.0 - radius * 10.0 + uTime * 8.0);
            alpha = pow(spiral, 5.0) * smoothstep(.15, .28, radius) * (1.0 - smoothstep(.7, 1.0, radius));
            color = mix(uMid, uLight, spiral * .45);
          }
        }
        alpha *= uOpacity * vFade;
        if (alpha < .006) discard;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  setElementMaterial(material, type);
  return material;
}

export function setElementMaterial(material, type) {
  const colors = COLORS[type] ?? COLORS.fireStaff;
  material.uniforms.uIce.value = type === 'iceStaff' || type === 'moonStaff' || type === 'starStaff' ? 1 : 0;
  material.uniforms.uCloudTint.value = type === 'fireStaff' ? 0 : 1;
  material.uniforms.uDark.value.set(colors[0]); material.uniforms.uMid.value.set(colors[1]);
  material.uniforms.uLight.value.set(colors[2]);
}
