import * as THREE from 'three';

export function createArrivalEffects(parent, { reducedMotion = false } = {}) {
  const root = new THREE.Group(); root.name = 'Anflug · Luftspuren und Landung'; parent.add(root);
  const material = new THREE.MeshBasicMaterial({ color: '#b8ece2', transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const marker = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.29, 64), material);
  marker.rotation.x = -Math.PI / 2; root.add(marker);
  const inner = new THREE.Mesh(new THREE.RingGeometry(.24, .29, 32), material); inner.rotation.x = -Math.PI / 2; root.add(inner);
  const streaks = Array.from({length: reducedMotion ? 0 : 12}, (_,i) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.07, 1), material.clone());
    mesh.userData.phase = i * .618; root.add(mesh); return mesh;
  });
  const dustMaterial = material.clone(); dustMaterial.color.set('#d2d4b0');
  const burst = new THREE.Mesh(new THREE.RingGeometry(.88, 1, 64), dustMaterial); burst.rotation.x = -Math.PI/2; root.add(burst);
  let clock = 0;
  return { update(dt, position, arrival) {
    clock += dt; root.position.copy(position); root.position.y += .09;
    root.visible = arrival.active || arrival.impact < 1;
    marker.visible = inner.visible = arrival.active;
    material.opacity = arrival.active ? .5 + .15 * Math.sin(clock * 3) : 0;
    marker.scale.setScalar(.85 + .15 * (1 - arrival.progress));
    for (let i=0;i<streaks.length;i++) {
      const mesh=streaks[i], p=(clock * 1.7 + mesh.userData.phase) % 1;
      const angle=i*2.399, r=.5+(i%3)*.4;
      mesh.visible=arrival.active;
      mesh.position.set(Math.cos(angle)*r, arrival.height+1+p*5, Math.sin(angle)*r);
      mesh.rotation.y=angle; mesh.scale.y=1+p*1.8;
      mesh.material.opacity=Math.sin(p*Math.PI)*.6*Math.min(1,arrival.height/3);
    }
    burst.visible=!arrival.active && arrival.impact<1;
    burst.scale.setScalar(1+arrival.impact*3.5);
    dustMaterial.opacity=(1-arrival.impact)**2*.45;
  }};
}
