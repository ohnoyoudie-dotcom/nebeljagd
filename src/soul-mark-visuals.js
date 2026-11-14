import * as THREE from 'three';
import { createSoulApparitionTextures } from './soul-apparition-textures.js';
import { SOUL_JUDGMENT_RULES } from './soul-judgment.js';

/** Three hits assemble a skull; the existing judgment clock conducts the scythe. */
export function createSoulMarkVisuals(scene, combat, isVisible, world) {
  const entries = new Map(), textures = createSoulApparitionTextures();
  function sprite(map, order) {
    const part = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true,
      depthWrite: false, depthTest: false, toneMapped: false }));
    part.renderOrder = order; return part;
  }
  function remove(id, entry) {
    scene.remove(entry.root); entry.root.traverse(p => p.material?.dispose()); entries.delete(id);
  }
  function visible(target) {
    const p = target.position;
    const concealed = !(target.revealRemaining > 0) && (target.concealed || world?.concealmentAt?.(p.x, p.z) > .01);
    return !concealed && (!isVisible || isVisible(p, { concealed: false }));
  }
  function apparition(entry, progress, fade = 1) {
    const arrival = THREE.MathUtils.smoothstep(progress, 0, .22);
    const stroke = THREE.MathUtils.smoothstep(progress, .77, 1);
    entry.reaper.visible = entry.scythe.visible = true;
    entry.reaper.position.y = 1.6 + arrival * .4 - stroke * .3;
    entry.reaper.scale.set(2.6 * arrival, 3.8 * arrival, 1);
    entry.reaper.material.opacity = arrival * fade * .88;
    entry.reaper.material.rotation = Math.sin(progress * 7) * .025;
    entry.scythe.position.set(.85, 1.1 + arrival * .6 - stroke * 1.5, .02);
    entry.scythe.scale.setScalar(3.5 * arrival);
    entry.scythe.material.rotation = -.55 - progress * .35 + stroke * 2.15;
    entry.scythe.material.opacity = arrival * fade;
    entry.scythe.renderOrder = stroke > .1 ? 13 : 11;
    entry.phase = progress < .22 ? 'appearing' : progress < .77 ? 'raised' : 'strike';
  }
  function executed(result) {
    const entry = entries.get(result.targetId);
    // A death caused by another weapon cannot produce a successful execution.
    if (!entry || !result.killed || result.type !== 'soul-judgment') return;
    entry.aftermath = .55; entry.pieces.forEach(p => { p.visible = false; });
    apparition(entry, 1); entry.phase = 'executed';
  }
  function update(marks, dt = 0) {
    const delta = Number.isFinite(dt) && dt > 0 ? dt : 0, strongest = new Map();
    for (const mark of marks) {
      const previous = strongest.get(mark.targetId);
      if (!previous || mark.count > previous.count || mark.count === previous.count && mark.remaining < previous.remaining)
        strongest.set(mark.targetId, mark);
    }
    for (const [id, entry] of entries) {
      if (entry.aftermath > 0) {
        entry.aftermath = Math.max(0, entry.aftermath - delta);
        const target = combat.targets.get(id); entry.root.visible = !!target && visible(target);
        apparition(entry, 1, entry.aftermath / .55); entry.phase = 'executed';
        if (!entry.aftermath) remove(id, entry);
      } else if (!strongest.has(id) || !combat.targets.get(id)?.alive) remove(id, entry);
    }
    for (const [id, mark] of strongest) {
      const target = combat.targets.get(id); if (!target?.alive) continue;
      let entry = entries.get(id);
      if (!entry) {
        const root = new THREE.Group(); root.name = 'Seelenrichter · Dreiteiliger Totenkopf';
        const pieces = textures.pieces.map(map => { const p = sprite(map, 14); root.add(p); return p; });
        const reaper = sprite(textures.reaper, 12), scythe = sprite(textures.scythe, 13);
        reaper.name = 'Sensenmann'; scythe.name = 'Sense'; root.add(reaper, scythe); scene.add(root);
        entry = { root, pieces, reaper, scythe, aftermath: 0, phase: 'marks' }; entries.set(id, entry);
      }
      const p = target.position;
      entry.root.position.set(p.x, (p.y ?? 0) + (target.height ?? 2.3) + 1.45, p.z);
      entry.root.visible = visible(target);
      entry.reaper.visible = entry.scythe.visible = false; entry.phase = 'marks';
      const sealed = mark.count === 3;
      const progress = 1 - mark.remaining / SOUL_JUDGMENT_RULES.delay;
      if (sealed) apparition(entry, THREE.MathUtils.clamp(progress, 0, 1));
      entry.pieces.forEach((piece, i) => {
        piece.visible = i < mark.count;
        piece.scale.setScalar(sealed ? 1.30 : 1.15);
        piece.position.y = 0;
        piece.material.opacity = sealed ? .90 : Math.min(1, mark.remaining / .4);
      });
    }
  }
  function reset() { for (const [id, entry] of entries) remove(id, entry); }
  return { update, executed, reset,
    get count() { return [...entries.values()].filter(e => !e.aftermath).length; },
    get telemetry() { return [...entries].map(([targetId, e]) => ({ targetId, phase: e.phase, visible: e.root.visible })); },
    dispose() { reset(); textures.dispose(); } };
}
