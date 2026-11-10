import * as THREE from 'three';

/** Cosmetic only. Rings follow the existing Tripo mesh; original geometry/PBR is untouched. */
export function attachGravityStaffAccent(model, topY) {
  const ornament = new THREE.Group();
  ornament.name = 'Gravitationsstab · schwebende Energiebahnen';
  ornament.userData.gravityStaffAccent = true;
  // Placed just below the highest finial to frame the orb rather than the grip.
  ornament.position.set(0, topY - .28, 0);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const radius = .16 + i * .035;
    const points = [];
    for (let j = 0; j < 48; j++) {
      const t = j * Math.PI * 2 / 48;
      points.push(new THREE.Vector3(Math.cos(t) * radius, Math.sin(t) * radius, 0));
    }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: i === 1 ? '#eedaff' : '#9656ed',
        transparent: true, opacity: .4 + i * .08,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    line.rotation.set(Math.PI / 2 + i * .56, i * .72, i * .36);
    ornament.add(line); rings.push(line);
  }
  const specksGeometry = new THREE.BufferGeometry();
  specksGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    .19, 0, 0, -.16, .09, .04, .04, -.11, .2, -.08, .16, -.12,
    .05, .2, .08, .09, -.17, -.13,
  ], 3));
  const specks = new THREE.Points(specksGeometry, new THREE.PointsMaterial({
    color: '#cda2ff', size: .038, transparent: true, opacity: .6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  ornament.add(specks);
  model.add(ornament);
  return ornament;
}

export function animateGravityStaffAccent(ornament, time, charging = false) {
  if (!ornament) return;
  const speed = charging ? 3.8 : .8;
  ornament.rotation.y = time * .46 * speed;
  ornament.children.slice(0, 3).forEach((ring, index) => {
    ring.rotation.z = time * (index % 2 ? -1 : 1) * (.45 + index * .16) * speed;
    ring.material.opacity = (.36 + index * .07) * (charging ? 1.5 : 1)
      * (1 + .17 * Math.sin(time * 2.3 + index));
  });
  const specks = ornament.children[3];
  if (specks) { specks.rotation.y = time * 1.8 * speed; specks.material.opacity = charging ? .92 : .6; }
}
