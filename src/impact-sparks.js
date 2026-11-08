import * as THREE from 'three';

const CAPACITY = 32;
const UP = new THREE.Vector3(0, 1, 0);

/** Short, depth-tested metal sparks; one bounded instanced draw, no lights. */
export function createImpactSparks(scene, isVisible = () => true) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.name = 'Mondsichel · Aufprallfunken'; mesh.count = 0; mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh);
  const particles = [], transform = new THREE.Object3D(), color = new THREE.Color(), direction = new THREE.Vector3();
  let bursts = 0, lastImpact = null, disposed = false;
  function render() {
    let count = 0;
    for (const p of particles) {
      if (!isVisible(p.position)) continue;
      const fade = Math.max(0, 1 - p.age / p.duration);
      transform.position.copy(p.position);
      direction.copy(p.velocity).normalize();
      transform.quaternion.setFromUnitVectors(UP, direction);
      transform.scale.set(p.width * Math.sqrt(fade), p.length * (.4 + fade * .6), p.width * Math.sqrt(fade));
      transform.updateMatrix(); mesh.setMatrixAt(count, transform.matrix);
      color.copy(p.color).multiplyScalar(fade * fade); mesh.setColorAt(count++, color);
    }
    mesh.count = count; mesh.visible = count > 0;
    if (count) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }
  function emit(point, normal, incomingDirection = 0) {
    if (disposed || ![point?.x, point?.y, point?.z].every(Number.isFinite)) return;
    const n = new THREE.Vector3(normal?.x ?? 0, normal?.y ?? 0, normal?.z ?? 0);
    if (!Number.isFinite(n.lengthSq()) || n.lengthSq() < .0001) n.set(-Math.sin(incomingDirection), 0, -Math.cos(incomingDirection));
    n.normalize();
    const tangent = new THREE.Vector3().crossVectors(n, UP);
    if (tangent.lengthSq() < .0001) tangent.set(1, 0, 0); else tangent.normalize();
    bursts++;
    lastImpact = { position: { x: point.x, y: point.y, z: point.z }, normal: { x: n.x, y: n.y, z: n.z } };
    for (let i = 0; i < 10; i++) {
      const angle = (i + bursts * 3) * 2.39996;
      const position = new THREE.Vector3(point.x, point.y, point.z).addScaledVector(n, .035);
      const velocity = n.clone().multiplyScalar(.85 + i % 4 * .38)
        .addScaledVector(tangent, Math.sin(angle) * 1.35);
      velocity.y += .45 + (i % 5) * .23;
      particles.push({ position, velocity, age: 0, duration: .26 + i % 4 * .055,
        width: .018 + i % 3 * .006, length: .08 + i % 4 * .025,
        color: new THREE.Color(i % 3 === 0 ? '#fff9df' : i % 3 === 1 ? '#ffd98d' : '#ffb955') });
    }
    if (particles.length > CAPACITY) particles.splice(0, particles.length - CAPACITY);
    render();
  }
  function update(dt) {
    if (disposed || !(dt > 0)) return;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.age += dt;
      if (p.age >= p.duration) { particles.splice(i, 1); continue; }
      p.position.addScaledVector(p.velocity, dt); p.position.y -= .5 * 5.5 * dt * dt;
      p.velocity.y -= 5.5 * dt;
    }
    render();
  }
  function reset() { particles.length = 0; bursts = 0; lastImpact = null; mesh.count = 0; mesh.visible = false; }
  return { emit, update, reset,
    get telemetry() { return { bursts, active: particles.length, visible: mesh.count, capacity: CAPACITY,
      lastImpact: lastImpact ? { position: { ...lastImpact.position }, normal: { ...lastImpact.normal } } : null }; },
    dispose() { if (disposed) return; reset(); mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); disposed = true; } };
}
