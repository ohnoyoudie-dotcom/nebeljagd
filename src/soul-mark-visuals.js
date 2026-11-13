import * as THREE from 'three';

/** Three separate rune fragments above the victim, never a text window. */
export function createSoulMarkVisuals(scene, combat, isVisible, world) {
  const entries = new Map(), textures = [];
  const size = 64;
  for (let segment = 0; segment < 3; segment++) {
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = (x + .5) / size * 2 - 1, py = (y + .5) / size * 2 - 1;
      const radius = Math.hypot(px, py), angle = (Math.atan2(py, px) + Math.PI * 2) % (Math.PI * 2);
      const local = angle - segment * Math.PI * 2 / 3;
      const arc = local > .07 && local < Math.PI * 2 / 3 - .07 && radius > .68 && radius < .86;
      const prong = Math.abs(local - Math.PI / 3) < .11 && radius > .32 && radius < .86;
      const offset = (y * size + x) * 4;
      pixels[offset] = 236; pixels[offset + 1] = 219; pixels[offset + 2] = 255;
      pixels[offset + 3] = arc || prong ? 255 : 0;
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.needsUpdate = true; texture.magFilter = texture.minFilter = THREE.LinearFilter;
    textures.push(texture);
  }
  function remove(id, entry) {
    scene.remove(entry.root); entry.pieces.forEach(piece => piece.material.dispose()); entries.delete(id);
  }
  function update(marks) {
    const strongest = new Map();
    for (const mark of marks) {
      const previous = strongest.get(mark.targetId);
      if (!previous || mark.count > previous.count || mark.count === previous.count && mark.remaining < previous.remaining)
        strongest.set(mark.targetId, mark);
    }
    for (const [id, entry] of entries) if (!strongest.has(id)) remove(id, entry);
    for (const [id, mark] of strongest) {
      const target = combat.targets.get(id); if (!target?.alive) continue;
      let entry = entries.get(id);
      if (!entry) {
        const root = new THREE.Group(); root.name = 'Seelenrichter · Dreiteilige Rune';
        const pieces = textures.map(map => {
          const piece = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false,
            depthTest: false, toneMapped: false }));
          piece.renderOrder = 12; root.add(piece); return piece;
        });
        scene.add(root); entry = { root, pieces }; entries.set(id, entry);
      }
      const p = target.position;
      entry.root.position.set(p.x, (p.y ?? 0) + (target.height ?? 2.3) + .55, p.z);
      const concealed = !(target.revealRemaining > 0) && (target.concealed || world?.concealmentAt?.(p.x, p.z) > .01);
      entry.root.visible = !concealed && (!isVisible || isVisible(p, { concealed: false }));
      const pulse = mark.count === 3 ? .88 + Math.sin(mark.remaining * 15) * .08 : .8;
      entry.root.scale.setScalar(pulse);
      entry.pieces.forEach((piece, i) => {
        piece.visible = i < mark.count;
        piece.material.color.set(mark.count === 3 ? '#ffffff' : '#b98be1');
        piece.material.opacity = mark.count === 3 ? 1 : Math.min(1, mark.remaining / .4);
      });
    }
  }
  function reset() { for (const [id, entry] of entries) remove(id, entry); }
  return { update, reset, get count() { return entries.size; }, dispose() { reset(); textures.forEach(t => t.dispose()); } };
}
