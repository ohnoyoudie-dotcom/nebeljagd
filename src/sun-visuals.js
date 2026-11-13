import * as THREE from 'three';

/** Warm warning light opens into a brief, strong column from above. */
export function createSunVisuals(scene, rules, ground, isVisible) {
  const root = new THREE.Group(); root.name = 'Sonnenstrahl'; root.visible = false;
  scene.add(root);
  const materials = [], geometries = [];
  function add(geometry, color, opacity = 0) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    materials.push(material); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); root.add(mesh); return mesh;
  }
  const disk = add(new THREE.CircleGeometry(rules.radius, 64), '#ffdc8d');
  disk.rotation.x = -Math.PI / 2; disk.position.y = .05;
  const ring = add(new THREE.RingGeometry(rules.radius - .05, rules.radius, 96), '#fff1ba');
  ring.rotation.x = -Math.PI / 2; ring.position.y = .06;
  const shaft = add(new THREE.CylinderGeometry(.7, rules.radius * .95, 18, 48, 1, true), '#ffe4a0');
  shaft.position.y = 9;
  const core = add(new THREE.CylinderGeometry(rules.radius * .28, rules.radius * .68, 18, 48, 1, true), '#fff4cf');
  core.position.y = 9;
  // Fade both ends and the cylinder silhouette so sunlight reads as a volume,
  // without the hard upper rim of a transparent cone.
  for (const beam of [shaft, core]) {
    beam.material.onBeforeCompile = shader => {
      const varyings = 'varying vec2 vSunUv; varying vec3 vSunNormal; varying vec3 vSunView;\n';
      shader.vertexShader = varyings + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSunUv = uv; vSunNormal = normalize(normalMatrix * normal); vSunView = -(modelViewMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = varyings + shader.fragmentShader.replace('#include <opaque_fragment>',
        'float beamEdge = pow(abs(dot(normalize(vSunNormal), normalize(vSunView))), 1.4);\n' +
        'diffuseColor.a *= beamEdge * smoothstep(0.0, .08, vSunUv.y) * (1.0 - smoothstep(.48, 1.0, vSunUv.y));\n#include <opaque_fragment>');
    };
    beam.material.customProgramCacheKey = () => 'soft-solar-column-v1';
  }
  const rays = [];
  for (let i = 0; i < 12; i++) {
    const ray = add(new THREE.CylinderGeometry(.012, .026, 1.2 + (i % 4) * .3, 5), '#fff4c4');
    rays.push(ray);
  }
  let phase = 'idle', intensity = 0;
  function show(center, age) {
    root.position.set(center.x, ground(center), center.z);
    root.visible = !isVisible || isVisible(center, { concealed: false });
    const active = age - rules.warning;
    const warning = Math.min(1, age / rules.warning);
    const exit = Math.max(0, Math.min(1, (rules.duration + rules.fade - active) / rules.fade));
    phase = active < 0 ? 'warning' : active < rules.duration ? 'beam' : 'fade';
    const onset = active < 0 ? 0 : Math.min(1, active / .09);
    const flash = active >= 0 ? Math.exp(-active * 12) : 0;
    intensity = onset * exit;
    disk.material.opacity = active < 0 ? .06 + warning * .13 : (.12 + flash * .16) * exit;
    ring.material.opacity = active < 0 ? .3 + warning * .4 : .38 * exit;
    shaft.material.opacity = active < 0 ? .025 + warning * .035 : (.26 + flash * .12) * exit;
    core.material.opacity = (.28 + flash * .15) * intensity;
    core.visible = active >= 0;
    const breadth = active < 0 ? .65 + warning * .35 : 1 + flash * .08;
    shaft.scale.set(breadth, 1, breadth);
    for (let i = 0; i < rays.length; i++) {
      const angle = i * Math.PI * 2 / rays.length + age * .12;
      const radius = rules.radius * (.35 + (i % 3) * .19);
      const cycle = ((age * .7 + i * .173) % 1 + 1) % 1;
      const ray = rays[i];
      ray.visible = active >= 0;
      ray.position.set(Math.cos(angle) * radius, 1 + (1 - cycle) * 8, Math.sin(angle) * radius);
      ray.material.opacity = Math.sin(cycle * Math.PI) * .45 * intensity;
    }
  }
  function hide() { root.visible = false; phase = 'idle'; intensity = 0; }
  return { start(center) { show(center, 0); }, show, hide,
    get telemetry() { return { visible: root.visible, phase, intensity, meshes: root.children.length }; },
    dispose() { scene.remove(root); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
