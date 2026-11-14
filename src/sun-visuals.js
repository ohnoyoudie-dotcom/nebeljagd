import * as THREE from 'three';

/** A growing solar seed opens into a descending, continuously flowing lightfall. */
export function createSunVisuals(scene, rules, ground, isVisible) {
  const root = new THREE.Group(); root.name = 'Sonnenstrahl'; root.visible = false; scene.add(root);
  const materials = [], geometries = [], clock = { value: 0 }, front = { value: 18 }, fill = { value: 0 };
  function add(geometry, color) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    materials.push(material); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); root.add(mesh); return mesh;
  }
  const disk = add(new THREE.CircleGeometry(rules.radius, 64), '#ffe4a1');
  disk.material.blending = THREE.NormalBlending;
  disk.name = 'Wachsender Sonnenkern'; disk.rotation.x = -Math.PI / 2; disk.position.y = .05;
  disk.material.onBeforeCompile = shader => {
    shader.uniforms.uSolarFill = fill;
    shader.vertexShader = 'varying vec2 vSolarDisk;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSolarDisk = uv;');
    shader.fragmentShader = 'uniform float uSolarFill; varying vec2 vSolarDisk;\n' + shader.fragmentShader.replace('#include <opaque_fragment>',
      'float r = length(vSolarDisk * 2.0 - 1.0); float seed = (1.0 - smoothstep(.45, 1.0, r)) * (.42 + .58 * exp(-r*r*8.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, .95, .78), uSolarFill); diffuseColor.a *= mix(seed, 1.0 - smoothstep(.91, 1.0, r), uSolarFill);\n#include <opaque_fragment>');
  };
  disk.material.customProgramCacheKey = () => 'solar-filled-seed-v3';
  const ring = add(new THREE.RingGeometry(rules.radius - .04, rules.radius, 96), '#fff1ba');
  ring.rotation.x = -Math.PI / 2; ring.position.y = .06;
  const shaft = add(new THREE.CylinderGeometry(rules.radius * .92, rules.radius * .98, 18, 64, 1, true), '#fff5df');
  shaft.position.y = 9;
  const core = add(new THREE.CylinderGeometry(rules.radius * .78, rules.radius * .85, 18, 48, 1, true), '#fffef5');
  core.position.y = 9;
  const aura = add(new THREE.CylinderGeometry(rules.radius, rules.radius * 1.10, 18, 64, 1, true), '#ffe8b0');
  aura.position.y = 9;
  // Traveling filaments run downward; their leading edge reaches the ground
  // before the first damage pulse. Both rims and cylinder silhouettes stay soft.
  for (const beam of [shaft, core, aura]) {
    beam.material.blending = beam === aura ? THREE.AdditiveBlending : THREE.NormalBlending;
    beam.material.onBeforeCompile = shader => {
      shader.uniforms.uSolarTime = clock; shader.uniforms.uSolarFront = front;
      const varyings = 'varying vec2 vSunUv; varying vec3 vSunNormal; varying vec3 vSunView;\n';
      shader.vertexShader = varyings + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSunUv = uv; vSunNormal = normalize(normalMatrix * normal); vSunView = -(modelViewMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = 'uniform float uSolarTime, uSolarFront;\n' + varyings + shader.fragmentShader.replace('#include <opaque_fragment>',
        `float beamEdge = pow(abs(dot(normalize(vSunNormal), normalize(vSunView))), ${beam === aura ? 1.6 : .30});
         float strands = pow(.5 + .5 * sin(vSunUv.x * 314.159 + sin(vSunUv.x * 81.681) * 2.0), 6.0);
         float flow = .5 + .5 * sin(vSunUv.y * 22.0 + uSolarTime * 27.0 + vSunUv.x * 75.398);
         float fall = smoothstep(uSolarFront - .7, uSolarFront + .25, vSunUv.y * 18.0);
         diffuseColor.a *= beamEdge * fall * smoothstep(0.0, .008, vSunUv.y)
           * (1.0 - smoothstep(.82, 1.0, vSunUv.y)) * (.97 + strands * .03);
         diffuseColor.rgb *= .97 + flow * .03;
         #include <opaque_fragment>`);
    };
    beam.material.customProgramCacheKey = () => beam === aura ? 'solar-aura-v3' : 'dense-solar-column-v3';
  }
  const rays = [];
  for (let i = 0; i < 22; i++) {
    const ray = add(new THREE.CylinderGeometry(.007, .024, 2.0 + (i % 5) * .6, 5, 1, true), '#fff5d5');
    ray.material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float vRayY;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRayY = uv.y;');
      shader.fragmentShader = 'varying float vRayY;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= pow(sin(vRayY * 3.14159), 2.0);\n#include <opaque_fragment>');
    };
    ray.material.customProgramCacheKey = () => 'solar-flow-strand-v2'; rays.push(ray);
  }
  let phase = 'idle', intensity = 0, seedRadius = 0, descent = 0;
  function show(center, age) {
    root.position.set(center.x, ground(center), center.z);
    root.visible = !isVisible || isVisible(center, { concealed: false }); clock.value = age;
    const active = age - rules.warning;
    const warning = THREE.MathUtils.clamp(age / rules.warning, 0, 1);
    const bloom = warning * warning * (3 - 2 * warning);
    const exit = THREE.MathUtils.clamp((rules.duration + rules.fade - active) / rules.fade, 0, 1);
    phase = active < 0 ? 'warning' : active < rules.duration ? 'beam' : 'fade';
    descent = THREE.MathUtils.clamp(active / .13, 0, 1); front.value = 18 * (1 - descent);
    const flash = active >= .13 ? Math.exp(-(active - .13) * 10) : 0;
    intensity = Math.min(1, Math.max(0, active) / .055) * exit;
    fill.value = THREE.MathUtils.smoothstep(descent, .85, 1);
    seedRadius = rules.radius * (active < 0 ? .025 + bloom * .975 : 1);
    disk.scale.setScalar(seedRadius / rules.radius);
    disk.material.opacity = active < 0 ? .48 + bloom * .42 : (.90 + fill.value * .10) * exit;
    ring.scale.setScalar(active < 0 ? .025 + bloom * .975 : 1 + flash * .025);
    ring.material.opacity = active < 0 ? .10 + bloom * .40 : (.22 + flash * .34) * exit;
    shaft.visible = core.visible = aura.visible = active >= 0;
    aura.material.opacity = .20 * intensity;
    shaft.material.opacity = .98 * intensity;
    core.material.opacity = intensity;
    for (let i = 0; i < rays.length; i++) {
      const angle = i * 2.399963, radius = rules.radius * (.20 + (i % 7) * .105);
      const cycle = ((active * 1.45 + i * .173) % 1 + 1) % 1;
      const y = 1.9 + (1 - cycle) * 10;
      const ray = rays[i]; ray.visible = active >= .13;
      ray.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      ray.material.opacity = Math.sin(cycle * Math.PI) * .18 * intensity;
    }
  }
  function hide() { root.visible = false; phase = 'idle'; intensity = seedRadius = descent = fill.value = 0; }
  return { start(center) { show(center, 0); }, show, hide,
    get telemetry() { return { visible: root.visible, phase, intensity, seedRadius, descent, density: .98 * intensity, groundFill: fill.value, meshes: root.children.length }; },
    dispose() { scene.remove(root); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
