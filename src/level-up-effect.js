import * as THREE from 'three';

const DURATION = 1.45;
const PARTICLES = 18;

/** One reusable celebration for the local player; it never changes combat state. */
export function createLevelUpEffect(scene) {
  const root = new THREE.Group();
  root.name = 'Levelaufstieg'; root.visible = false;
  root.userData.ignoreVision = true;
  scene.add(root);
  const material = (color, opacity) => {
    const value = new THREE.MeshBasicMaterial({ color, opacity, transparent: true,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    value.userData.ignoreVision = true;
    value.userData.ignoreFogOfWar = true;
    return value;
  };
  const ringMaterial = material('#ffd477', .75);
  const sparkMaterial = material('#fff1b0', .9);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.91, 1, 64), ringMaterial);
  ring.rotation.x = -Math.PI / 2; ring.position.y = .08;
  root.add(ring);
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), sparkMaterial, PARTICLES);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  root.add(sparks);
  const transform = new THREE.Object3D();
  let age = 0, active = false, reducedMotion = false, level = 1, emitted = 0, disposed = false;

  function reset() {
    active = false; age = 0; root.visible = false; sparks.count = 0;
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
    ring.scale.setScalar(reducedMotion ? 1.15 : 1.05 + 1.15 * (1 - (1 - progress) ** 2));
    ringMaterial.opacity = (reducedMotion ? .42 : .72) * fade;
    sparks.count = reducedMotion ? 0 : PARTICLES;
    sparkMaterial.opacity = .9 * fade;
    for (let index = 0; index < sparks.count; index++) {
      const angle = index * Math.PI * 2 / PARTICLES + progress * .4;
      const radius = .72 + (index % 3) * .13 + progress * .32;
      transform.position.set(Math.cos(angle) * radius,
        .25 + (index % 4) * .15 + progress * (1.2 + (index % 3) * .35), Math.sin(angle) * radius);
      transform.rotation.set(progress * 2 + index, angle, progress + index);
      const size = (.035 + (index % 3) * .012) * (1 - progress * .7);
      transform.scale.set(size, size * 2, size);
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
      reducedMotion, remaining: active ? (reducedMotion ? .9 : DURATION) - age : 0 }),
    dispose() {
      reset(); disposed = true; scene.remove(root);
      ring.geometry.dispose(); sparks.geometry.dispose();
      ringMaterial.dispose(); sparkMaterial.dispose();
    },
  };
}
