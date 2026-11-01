import * as THREE from 'three';

const DURATION = 1.6;
const PARTICLES = 36;

/** One reusable celebration for the local player; it never changes combat state. */
export function createLevelUpEffect(scene) {
  const root = new THREE.Group();
  root.name = 'Levelaufstieg'; root.visible = false;
  root.userData.ignoreVision = true;
  scene.add(root);
  const material = (color, opacity) => {
    const value = new THREE.MeshBasicMaterial({ color, opacity, transparent: true,
      depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending });
    value.userData.ignoreVision = true;
    value.userData.ignoreFogOfWar = true;
    return value;
  };
  const ringMaterial = material('#ffd477', .9);
  const echoMaterial = material('#ffeaa0', .7);
  const sparkMaterial = material('#fff1b0', .9);
  const ringGeometry = new THREE.RingGeometry(.86, 1, 64);
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  const echo = new THREE.Mesh(ringGeometry, echoMaterial);
  for (const [index, part] of [ring, echo].entries()) {
    part.rotation.x = -Math.PI / 2; part.position.y = .12 + index * .04;
    part.renderOrder = 2000 + index; root.add(part);
  }
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { opacity: { value: 0 }, color: { value: new THREE.Color('#ffdc80') } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float opacity; uniform vec3 color; varying vec2 vUv;
      void main() {
        float fade = smoothstep(0.0, .08, vUv.y) * pow(1.0 - vUv.y, 1.8);
        gl_FragColor = vec4(color, opacity * fade);
        #include <colorspace_fragment>
      }`,
  });
  beamMaterial.userData.ignoreVision = beamMaterial.userData.ignoreFogOfWar = true;
  const beamGeometry = new THREE.CylinderGeometry(1, .68, 1, 32, 1, true);
  beamGeometry.translate(0, .5, 0);
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.renderOrder = 2002; root.add(beam);
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), sparkMaterial, PARTICLES);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false; sparks.renderOrder = 2003;
  root.add(sparks);
  const transform = new THREE.Object3D();
  let age = 0, active = false, reducedMotion = false, level = 1, emitted = 0, disposed = false;

  function reset() {
    active = false; age = 0; root.visible = false; sparks.count = 0;
    beamMaterial.uniforms.opacity.value = 0;
  }

  function update(dt, position) {
    if (!active || disposed) return;
    age += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const duration = reducedMotion ? .9 : DURATION;
    if (age >= duration) { reset(); return; }
    if (position) root.position.copy(position);
    const progress = age / duration;
    const fade = Math.min(1, (1 - progress) * 2.4);
    root.visible = true;
    ring.scale.setScalar(reducedMotion ? 1.35 : .9 + 2.15 * (1 - (1 - progress) ** 2));
    ringMaterial.opacity = (reducedMotion ? .55 : .9) * fade;
    echo.visible = !reducedMotion && progress >= .12;
    const echoProgress = Math.max(0, (progress - .12) / .88);
    echo.scale.setScalar(.7 + 1.8 * (1 - (1 - echoProgress) ** 2));
    echoMaterial.opacity = .72 * fade;
    beam.scale.set(reducedMotion ? 1 : 1 + progress * .35, reducedMotion ? 2.6 : 2.8 + progress, reducedMotion ? 1 : 1 + progress * .35);
    beamMaterial.uniforms.opacity.value = (reducedMotion ? .16 : .38) * fade;
    sparks.count = reducedMotion ? 0 : PARTICLES;
    sparkMaterial.opacity = .9 * fade;
    for (let index = 0; index < sparks.count; index++) {
      const angle = index * Math.PI * 2 / PARTICLES + progress * .65;
      const radius = .6 + (index % 3) * .19 + progress * (index % 2 ? .75 : 1.35);
      transform.position.set(Math.cos(angle) * radius,
        .3 + (index % 4) * .18 + progress * (1.8 + (index % 3) * .55), Math.sin(angle) * radius);
      transform.rotation.set(progress * 2 + index, angle, progress + index);
      const size = (.065 + (index % 3) * .02) * (1 - progress * .6);
      transform.scale.set(size, size * 2.4, size);
      transform.updateMatrix(); sparks.setMatrixAt(index, transform.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
  }

  return {
    trigger({ position, level: nextLevel, reducedMotion: reduce = false }) {
      if (disposed || !position) return;
      age = 0; active = true; reducedMotion = Boolean(reduce);
      level = nextLevel; emitted++;
      update(0, position);
    },
    update,
    reset() { reset(); emitted = 0; level = 1; },
    inspect: () => ({ active, level, emitted, particleCount: active ? sparks.count : 0,
      ringCount: active ? (echo.visible ? 2 : 1) : 0, beamVisible: active && beamMaterial.uniforms.opacity.value > 0,
      reducedMotion, remaining: active ? (reducedMotion ? .9 : DURATION) - age : 0 }),
    dispose() {
      reset(); disposed = true; scene.remove(root);
      ringGeometry.dispose(); beamGeometry.dispose(); sparks.geometry.dispose();
      ringMaterial.dispose(); echoMaterial.dispose(); beamMaterial.dispose(); sparkMaterial.dispose();
    },
  };
}
