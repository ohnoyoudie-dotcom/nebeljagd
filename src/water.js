import * as THREE from 'three';

/** Original flowing-water shader; one reusable ribbon, no per-frame mesh uploads. */
export function createRiverWater(root, {
  riverPoints, halfWidth = 2.3, timeUniform = { value: 0 }, quality = 'high', zoneCenter = [0, 0],
} = {}) {
  if (!riverPoints || riverPoints.length < 2) throw new Error('A river needs at least two centre-line points.');
  const crossSegments = quality === 'low' ? 6 : 10;
  const positions = [], uvs = [], tangents = [], indices = [];
  let travelled = 0;
  for (let row = 0; row < riverPoints.length; row++) {
    const point = riverPoints[row];
    const before = riverPoints[Math.max(0, row - 1)];
    const after = riverPoints[Math.min(riverPoints.length - 1, row + 1)];
    if (row) travelled += Math.hypot(point.x - before.x, point.z - before.z);
    const dx = after.x - before.x, dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1;
    const tx = dx / length, tz = dz / length;
    for (let col = 0; col <= crossSegments; col++) {
      const u = col / crossSegments;
      const offset = (u * 2 - 1) * halfWidth;
      positions.push(point.x + tz * offset, .055, point.z - tx * offset);
      uvs.push(u, travelled);
      tangents.push(tx, tz);
      if (row < riverPoints.length - 1 && col < crossSegments) {
        const a = row * (crossSegments + 1) + col;
        const b = a + crossSegments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aFlowDirection', new THREE.Float32BufferAttribute(tangents, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const sceneryScale = root.scale.x || 1;
  const uniforms = {
    uTime: timeUniform,
    uZoneRadius: { value: 32 * sceneryScale },
    uZoneCenter: { value: new THREE.Vector2(zoneCenter[0] * sceneryScale, zoneCenter[1] * sceneryScale) },
    uScale: { value: sceneryScale },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec2 aFlowDirection;
      uniform float uTime;
      varying vec2 vRiverUv;
      varying vec2 vFlowDirection;
      varying vec3 vWorld;
      void main() {
        vRiverUv = uv;
        vFlowDirection = aFlowDirection;
        vec3 p = position;
        float across = uv.x * 2. - 1.;
        float bankFade = 1. - smoothstep(.65, 1., abs(across));
        float swell = sin(uv.y * 2.2 - uTime * 2.6 + across * 2.5);
        float ripple = sin(uv.y * 5.9 - uTime * 4.3 + sin(across * 4.) * .8);
        p.y += (swell * .017 + ripple * .007) * bankFade;
        vWorld = (modelMatrix * vec4(p, 1.)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uZoneRadius;
      uniform vec2 uZoneCenter;
      uniform float uScale;
      varying vec2 vRiverUv;
      varying vec2 vFlowDirection;
      varying vec3 vWorld;
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
      void main() {
        float across = vRiverUv.x * 2. - 1.;
        float along = vRiverUv.y;
        float bank = abs(across);
        // Stream coordinates make all ripples and fragments follow the bend.
        float flow = along - uTime * 1.05;
        float eddy = sin(along * .49 + across * 1.8 - uTime * .36);
        vec2 p = vec2(across * 2.4 + eddy * .38, flow * .38);
        float broad = noise21(p);
        float detail = noise21(vec2(across * 6. + broad * 1.2, flow * 1.25));
        float ripple = sin(flow * 6.1 + sin(across * 5. + along * .21) * 1.5 + broad * 2.2);
        float crossRipple = sin(across * 13. + flow * 2.4 + detail * 3.2);
        float rippleHeight = ripple * .65 + crossRipple * .35;
        vec3 tangent = normalize(vec3(vFlowDirection.x, 0., vFlowDirection.y));
        vec3 acrossDirection = vec3(tangent.z, 0., -tangent.x);
        vec3 normal = normalize(vec3(0., 1., 0.) + tangent * ripple * .065
          + acrossDirection * crossRipple * .045);
        vec3 light = normalize(vec3(-.48, .82, .31));
        vec3 eye = normalize(cameraPosition - vWorld);
        float sunlight = max(dot(normal, light), 0.);
        float reflection = pow(max(dot(reflect(-light, normal), eye), 0.), 38.);
        float brokenReflection = reflection * smoothstep(.32, .76, detail);
        vec3 deep = vec3(.023, .105, .127);
        vec3 shallow = vec3(.080, .245, .226);
        vec3 color = mix(deep, shallow, smoothstep(.12, 1., bank) * .75 + broad * .12);
        color *= .79 + sunlight * .27;
        color += vec3(.010, .018, .016) * rippleHeight;
        // Fine moving caustic seams are sparse, irregular, and stretched downstream.
        float seam = pow(1. - abs(sin(flow * 2.2 + across * 3.4 + broad * 5.)), 14.);
        seam *= smoothstep(.43, .77, detail) * (1. - bank * .48);
        color += vec3(.080, .135, .112) * seam;
        color += vec3(.45, .52, .44) * brokenReflection * .25;
        // Shear foam curls off both banks, with drifting broken filaments inside.
        float foamEdge = .84 + sin(flow * 1.6 + eddy * 2.7) * .037 + (detail - .5) * .075;
        float shoreFoam = smoothstep(foamEdge, foamEdge + .10, bank);
        shoreFoam *= smoothstep(.20, .73, detail + sin(flow * .63 + across) * .12);
        float strand = pow(max(0., sin(flow * 3.2 + across * 4.4 + broad * 6.)), 16.);
        strand *= smoothstep(.58, .86, broad) * smoothstep(.42, .90, bank);
        float foam = clamp(shoreFoam * .77 + strand * .38, 0., .82);
        color = mix(color, vec3(.46, .57, .49), foam);
        float exterior = smoothstep(uZoneRadius + .5 * uScale,
          uZoneRadius + 11. * uScale, length(vWorld.xz - uZoneCenter));
        color *= mix(vec3(1.), vec3(.34, .31, .48), exterior);
        gl_FragColor = vec4(max(color, vec3(.005)), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Bach · gerichtete Strömung, Rippel und Uferschaum';
  mesh.renderOrder = 1;
  root.add(mesh);
  return {
    mesh,
    material,
    update(_dt, time) { uniforms.uTime.value = time; },
    setZoneRadius(radius) { uniforms.uZoneRadius.value = radius * sceneryScale; },
  };
}
