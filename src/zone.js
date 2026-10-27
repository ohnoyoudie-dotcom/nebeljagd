import * as THREE from 'three';

// Coherent value noise avoids texture downloads and per-frame cloud geometry work.
const mistNoise = `
  float hash21(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise21(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash21(cell), hash21(cell + vec2(1., 0.)), f.x),
      mix(hash21(cell + vec2(0., 1.)), hash21(cell + vec2(1.)), f.x), f.y);
  }
  float mist(vec2 p) {
    return noise21(p) * .58 + noise21(p * 2.03 + 13.7) * .29
      + noise21(p * 4.11 - 8.2) * .13;
  }
`;
const worldVertex = `
  varying vec3 vWorld; varying vec2 vUv;
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
  }
`;

/** Three GPU veils progressively darken and obscure the exterior of the refuge. */
export function createZone(scene, { bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }, center = [0, 0], initialRadius = 32 } = {}) {
  const group = new THREE.Group();
  group.name = 'Violet veil · layered boundary mist';
  scene.add(group);
  const sceneryScale = scene.scale.x || 1;
  const uniforms = {
    uTime: { value: 0 }, uDanger: { value: 0 },
    uRadius: { value: initialRadius * sceneryScale }, uCenter: { value: new THREE.Vector2(center[0] * sceneryScale, center[1] * sceneryScale) }, uScale: { value: sceneryScale },
    uPlayer: { value: new THREE.Vector2() }, uHasPlayer: { value: 0 },
  };
  const wallMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: worldVertex,
    fragmentShader: `
      varying vec3 vWorld; varying vec2 vUv;
      uniform float uTime;
      ${mistNoise}
      void main() {
        vec2 p = vec2(vWorld.x * .19 + vWorld.z * .13, vWorld.y * .37);
        vec2 flow = vec2(uTime * .025, -uTime * .065);
        float curl = mist(p * .67 + flow);
        float cloud = mist(p + vec2(curl * 1.5, -curl) + flow);
        float height = pow(1. - vUv.y, 2.0);
        float softTop = 1. - smoothstep(.30, .98, vUv.y);
        float threads = smoothstep(.54, .81, cloud) * height;
        vec3 color = mix(vec3(.18, .12, .29), vec3(.39, .25, .54), cloud);
        color = mix(color, vec3(.28, .58, .54), threads * .27);
        color += vec3(.19, .11, .25) * threads;
        float alpha = (.13 + cloud * .28 + threads * .14) * height * softTop;
        alpha *= .92 + .08 * sin(uTime * .8 + cloud * 5.);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 65, 128, 1, true), wallMaterial);
  wall.name = 'Moving mist frontier';
  wall.position.set(center[0], 32.5, center[1]);
  wall.renderOrder = 4;
  group.add(wall);
  const borderMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, vertexShader: worldVertex,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uTime; uniform float uRadius; uniform float uScale; uniform float uDanger; uniform vec2 uCenter;
      void main() {
        float edge = abs(length(vWorld.xz - uCenter) - uRadius) / uScale;
        if(edge > 1.15) discard;
        float angle = atan(vWorld.z, vWorld.x);
        float pulse = .78 + .22 * sin(angle * 23. - uTime * 1.3);
        float glow = exp(-edge * 9.) * .44 + exp(-edge * 35.) * .29;
        vec3 color = mix(vec3(.53, .32, .77), vec3(.76, .28, .51), uDanger * .55);
        color = mix(color, vec3(.26, .69, .61), .16 + .08 * sin(angle * 7. + uTime * .4));
        gl_FragColor = vec4(color, glow * pulse);
      }
    `,
  });
  const border = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), borderMaterial);
  border.name = 'Subtle luminous safe-circle seam';
  border.rotation.x = -Math.PI / 2;
  border.position.set(center[0], .07, center[1]);
  border.renderOrder = 5;
  group.add(border);

  // The ground-darkening plane and four elevation sheets share one draw call. They
  // replace the former 104 polygon clouds and their per-frame matrix uploads.
  const positions = [], layer = [], uv = [], indices = [];
  for (const [index, height] of [0.13, 2.5, 8, 18, 30].entries()) {
    const offset = positions.length / 3;
    const x1 = bounds.minX - 120, x2 = bounds.maxX + 120, z1 = bounds.minZ - 120, z2 = bounds.maxZ + 120;
    positions.push(x1, height, z1, x2, height, z1,
      x2, height, z2, x1, height, z2);
    layer.push(index, index, index, index);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
  }
  const hazeGeometry = new THREE.BufferGeometry();
  hazeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hazeGeometry.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
  hazeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hazeGeometry.setIndex(indices);
  const hazeMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute float aLayer; varying float vLayer; varying vec3 vWorld;
      void main() {
        vLayer = aLayer;
        vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }
    `,
    fragmentShader: `
      varying vec3 vWorld; varying float vLayer;
      uniform float uTime; uniform float uRadius; uniform float uScale; uniform vec2 uCenter;
      uniform vec2 uPlayer; uniform float uHasPlayer;
      ${mistNoise}
      void main() {
        float depth = (length(vWorld.xz - uCenter) - uRadius) / uScale;
        if(depth < -.08) discard;
        float entry = smoothstep(-.08, 3.4, depth);
        float farVeil = smoothstep(2.0, 17.0, depth);
        vec2 p = vWorld.xz * .15 + vec2(vLayer * 6.1, vLayer * -3.7);
        vec2 drift = vec2(uTime * .026, -uTime * .018);
        float curl = mist(p * .67 + drift * 1.3);
        float cloud = mist(p + vec2(curl * 1.8, -curl * 1.2) + drift);
        float wisps = smoothstep(.34, .73, cloud);
        vec3 nearColor = mix(vec3(.12, .09, .19), vec3(.28, .19, .39), cloud);
        vec3 farColor = mix(vec3(.10, .075, .16), vec3(.24, .17, .34), wisps);
        vec3 color = mix(nearColor, farColor, farVeil * .72);
        if(vLayer > .5) {
          color = mix(vec3(.24, .17, .34), vec3(.43, .32, .55), wisps);
          color = mix(color, vec3(.22, .40, .40), smoothstep(.65, .85, cloud) * .23);
        }
        float alpha;
        if(vLayer < .5) alpha = entry * (.45 + farVeil * .34 + wisps * .08);
        else alpha = entry * (.055 + wisps * .21 + farVeil * .13);
        // Keep the controlled traveller readable, even in deep fog.
        float playerDistance = length(vWorld.xz - uPlayer) / uScale;
        float pocket = mix(.60, 1., smoothstep(1.5, 5., playerDistance));
        if(vLayer > .5) alpha *= mix(1., pocket, uHasPlayer);
        gl_FragColor = vec4(color, min(.88, alpha));
      }
    `,
  });
  const haze = new THREE.Mesh(hazeGeometry, hazeMaterial);
  haze.name = 'Ground darkness and layered moving aerial mist';
  haze.renderOrder = 3;
  haze.frustumCulled = false;
  group.add(haze);
  return {
    // Optional playerPosition uses unscaled world-local coordinates.
    update(time, radius, inDanger, playerPosition = null) {
      uniforms.uTime.value = time;
      uniforms.uDanger.value = THREE.MathUtils.lerp(uniforms.uDanger.value, inDanger ? 1 : 0, .06);
      uniforms.uRadius.value = radius * sceneryScale;
      uniforms.uHasPlayer.value = playerPosition ? 1 : 0;
      if (playerPosition) uniforms.uPlayer.value.set(playerPosition.x * sceneryScale, playerPosition.z * sceneryScale);
      wall.scale.set(radius, 1, radius);
      border.scale.set(radius, radius, 1);
    },
  };
}
