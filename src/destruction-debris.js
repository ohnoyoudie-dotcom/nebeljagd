import * as THREE from 'three';

export const DEBRIS_RULES = Object.freeze({ maximum: 112, stay: 6, lifetime: 10 });

/** Split existing textured surfaces once, preserving UVs, normals and colours.
 * Barrel sectors form curved staves; top/bottom boards remain separate pieces. */
export function fractureGeometry(source, kind = 'barrel') {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox, size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const p = geometry.attributes.position, groups = new Map();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const h = (y - box.min.y) / Math.max(.001, size.y);
    const key = kind === 'barrel'
      ? h < .06 ? 12 : h > .94 ? 13 : Math.floor((Math.atan2(z - center.z, x - center.x) + Math.PI) / (2 * Math.PI) * 12) % 12
      : (x > center.x ? 1 : 0) + (z > center.z ? 2 : 0) + (y > center.y ? 4 : 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i, i + 1, i + 2);
  }
  const fragments = [];
  for (const [sector, indices] of groups) {
    const piece = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new Float32Array(indices.length * attribute.itemSize);
      for (let i = 0; i < indices.length; i++) for (let c = 0; c < attribute.itemSize; c++) {
        values[i * attribute.itemSize + c] = attribute.getComponent(indices[i], c);
      }
      piece.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
    }
    piece.computeBoundingBox();
    const pivot = piece.boundingBox.getCenter(new THREE.Vector3());
    piece.translate(-pivot.x, -pivot.y, -pivot.z);
    piece.computeBoundingBox(); piece.computeBoundingSphere();
    // The curved outer face of a stave should face upward when it settles.
    // Lids already lie in the horizontal plane and must not turn onto an edge.
    const restNormal = kind === 'barrel' && sector < 12
      ? new THREE.Vector3(pivot.x - center.x, 0, pivot.z - center.z).normalize()
      : new THREE.Vector3(0, 1, 0);
    fragments.push({ geometry: piece, pivot, restNormal });
  }
  geometry.dispose();
  return fragments;
}

export function createDestructionDebris(root, heightAt) {
  const group = new THREE.Group(); group.name = 'Holztrümmer · zerbrochene Gegenstände'; root.add(group);
  const cache = new Map(), pieces = [];
  let serial = 0, disposed = false;
  const random = (seed, salt) => { const n = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453; return n - Math.floor(n); };
  const scratch = new THREE.Vector3(), spinRotation = new THREE.Quaternion();
  function remove(piece) {
    piece.mesh.removeFromParent();
    for (const material of Array.isArray(piece.mesh.material) ? piece.mesh.material : [piece.mesh.material]) material.dispose();
  }
  function burst(item) {
    if (disposed || !['barrel', 'crate'].includes(item.kind)) return;
    // Enough impulse to read as shattering from the overhead camera. Scaling
    // by sqrt(size) keeps small props lively without launching large ones away.
    const impulseScale = Math.sqrt(THREE.MathUtils.clamp(item.scale ?? 1, .25, 4));
    for (const instance of item.instances ?? []) {
      const source = instance.mesh.geometry, key = `${source.uuid}:${item.kind}`;
      if (!cache.has(key)) cache.set(key, fractureGeometry(source, item.kind));
      const scale = new THREE.Vector3(), orientation = new THREE.Quaternion();
      instance.originalMatrix.decompose(scratch, orientation, scale);
      for (const fragment of cache.get(key)) {
        const prepare = original => {
          const material = original.clone(); material.side = THREE.DoubleSide;
          material.transparent = true; material.depthWrite = true; material.opacity = 1;
          return material;
        };
        const material = Array.isArray(instance.mesh.material) ? instance.mesh.material.map(prepare) : prepare(instance.mesh.material);
        const mesh = new THREE.Mesh(fragment.geometry, material);
        mesh.name = `${item.kind} · Bruchstück`;
        mesh.position.copy(fragment.pivot).applyMatrix4(instance.originalMatrix);
        mesh.quaternion.copy(orientation); mesh.scale.copy(scale);
        mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
        const seed = ++serial, dx = mesh.position.x - item.x, dz = mesh.position.z - item.z;
        // Centre pieces (lids and bottom boards) have no radial direction.
        // Give each its own heading instead of sending all of them along +X.
        const angle = (Math.hypot(dx, dz) < .08 * impulseScale ? random(seed, 3) * Math.PI * 2 : Math.atan2(dz, dx))
          + (random(seed, 1) - .5) * .65;
        const speed = (3.2 + random(seed, 2) * 2.6) * impulseScale;
        const up = new THREE.Vector3(0, 1, 0);
        const targetRotation = new THREE.Quaternion().setFromUnitVectors(fragment.restNormal.clone().applyQuaternion(orientation), up)
          .multiply(orientation).premultiply(new THREE.Quaternion().setFromAxisAngle(up, random(seed, 4) * Math.PI * 2));
        pieces.push({ mesh, origin: mesh.position.clone(), age: 0, settled: false, bounces: 0,
          spinAxis: new THREE.Vector3(random(seed, 7) - .5, .2 + random(seed, 8), random(seed, 9) - .5).normalize(),
          spinSpeed: 5 + random(seed, 10) * 6,
          velocity: new THREE.Vector3(Math.cos(angle) * speed, (3.2 + random(seed, 6) * 1.8) * impulseScale, Math.sin(angle) * speed),
          targetRotation });
      }
    }
    while (pieces.length > DEBRIS_RULES.maximum) remove(pieces.shift());
  }
  function bottomHeight(piece) {
    const b = piece.mesh.geometry.boundingBox;
    let bottom = Infinity;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      scratch.set(x, y, z).multiply(piece.mesh.scale).applyQuaternion(piece.mesh.quaternion);
      bottom = Math.min(bottom, scratch.y);
    }
    return -bottom;
  }
  function update(dt, visible = null) {
    if (!(dt > 0) || disposed) return;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i]; piece.age += dt;
      if (piece.age >= DEBRIS_RULES.lifetime) { remove(piece); pieces.splice(i, 1); continue; }
      if (!piece.settled) {
        let left = dt;
        while (left > 1e-8) {
          const step = Math.min(left, 1 / 60); left -= step;
          piece.velocity.y -= 9.8 * step;
          const drag = Math.exp(-step * .35);
          piece.velocity.x *= drag; piece.velocity.z *= drag;
          piece.mesh.position.addScaledVector(piece.velocity, step);
          if (!piece.bounces) {
            // Tumble freely in the air; only flatten out after hitting ground.
            spinRotation.setFromAxisAngle(piece.spinAxis, piece.spinSpeed * step);
            piece.mesh.quaternion.premultiply(spinRotation);
          } else piece.mesh.quaternion.slerp(piece.targetRotation, 1 - Math.exp(-step * 14));
          const floor = heightAt(piece.mesh.position.x, piece.mesh.position.z) + .015 + bottomHeight(piece);
          if (piece.mesh.position.y <= floor) {
            piece.mesh.position.y = floor;
            // A low board can rotate into the floor while still lifting off.
            // Correct the overlap without killing its upward launch impulse.
            if (piece.velocity.y > 0) continue;
            piece.velocity.y = Math.abs(piece.velocity.y) * .28;
            piece.velocity.x *= .66; piece.velocity.z *= .66; piece.bounces++;
            if (piece.bounces >= 3 || piece.velocity.length() < .25 || piece.age > 2) {
              piece.mesh.quaternion.copy(piece.targetRotation);
              piece.mesh.position.y = heightAt(piece.mesh.position.x, piece.mesh.position.z) + .015 + bottomHeight(piece);
              piece.velocity.set(0, 0, 0); piece.settled = true; break;
            }
          }
        }
      }
      const fade = 1 - THREE.MathUtils.smoothstep(piece.age, DEBRIS_RULES.stay, DEBRIS_RULES.lifetime);
      for (const material of Array.isArray(piece.mesh.material) ? piece.mesh.material : [piece.mesh.material]) {
        material.opacity = fade; material.depthWrite = fade > .95;
      }
      piece.mesh.castShadow = fade > .6;
      piece.mesh.visible = !visible || visible(piece.mesh.position);
    }
  }
  function reset() { pieces.forEach(remove); pieces.length = 0; }
  return { burst, update, reset,
    get stats() { return { active: pieces.length, settled: pieces.filter(p => p.settled).length,
      airborne: pieces.filter(p => !p.settled && !p.bounces).length,
      farthestTravel: pieces.reduce((max, p) => Math.max(max, Math.hypot(p.mesh.position.x - p.origin.x, p.mesh.position.z - p.origin.z)), 0),
      maximum: DEBRIS_RULES.maximum, fadeAfter: DEBRIS_RULES.stay, lifetime: DEBRIS_RULES.lifetime,
      averageOpacity: pieces.length ? pieces.reduce((s, p) => s + (Array.isArray(p.mesh.material) ? p.mesh.material[0] : p.mesh.material).opacity, 0) / pieces.length : 0,
      texturedOriginalFragments: true }; },
    dispose() { if (disposed) return; reset(); for (const batch of cache.values()) for (const part of batch) part.geometry.dispose(); cache.clear(); group.removeFromParent(); disposed = true; } };
}
