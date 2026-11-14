import * as THREE from 'three';
import { createSoulApparitionModels } from './soul-apparition-models.js';
import { SOUL_JUDGMENT_RULES } from './soul-judgment.js';

/** Three hits assemble a skull; the existing judgment clock conducts the scythe. */
export function createSoulMarkVisuals(scene, combat, isVisible, world) {
  const entries = new Map(), models = createSoulApparitionModels();
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
    // Keep the existing strike aligned with the victim below the raised skull.
    // Apparition axes face the angled game camera, so .40 offsets .75 world Y.
    entry.reaper.position.y = .60 + arrival * .10 - stroke * .15;
    entry.reaper.scale.setScalar(.96 * arrival);
    entry.reaper.rotation.z = Math.sin(progress * 7) * .035;
    models.fade(entry.reaper, arrival * fade * .94);
    entry.scythe.position.set(.48, .35 - stroke * .82, .18);
    entry.scythe.scale.set(-.92 * arrival, .92 * arrival, .92 * arrival);
    entry.scythe.rotation.z = .10 - progress * .10 - stroke * 2.30;
    entry.scythe.traverse(p => { if (p.isMesh) p.renderOrder = stroke > .1 ? 13 : 11; });
    models.fade(entry.scythe, arrival * fade);
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
        const { pieces, reaper, scythe } = models.create(root); scene.add(root);
        entry = { root, pieces, reaper, scythe, aftermath: 0, shownCount: 0, revealAge: 0, markReveal: 0, phase: 'marks' }; entries.set(id, entry);
      }
      if (entry.shownCount !== mark.count) { entry.shownCount = mark.count; entry.revealAge = 0; }
      else entry.revealAge += delta;
      entry.markReveal = THREE.MathUtils.smoothstep(entry.revealAge, .10, .26);
      const p = target.position;
      entry.root.position.set(p.x, (p.y ?? 0) + (target.height ?? 2.3) + 2.20, p.z);
      entry.root.visible = visible(target);
      entry.reaper.visible = entry.scythe.visible = false; entry.phase = 'marks';
      const sealed = mark.count === 3;
      const progress = 1 - mark.remaining / SOUL_JUDGMENT_RULES.delay;
      if (sealed) apparition(entry, THREE.MathUtils.clamp(progress, 0, 1));
      entry.pieces.forEach((piece, i) => {
        piece.visible = i < mark.count;
        const reveal = i === mark.count - 1 ? entry.markReveal : 1;
        piece.scale.setScalar((sealed ? .82 : .76) * (.8 + reveal * .2));
        piece.position.y = 0;
        models.fade(piece, reveal * (sealed ? .95 - THREE.MathUtils.smoothstep(progress, .1, .5) * .25 : Math.min(1, mark.remaining / .4)));
      });
    }
  }
  function reset() { for (const [id, entry] of entries) remove(id, entry); }
  return { update, executed, reset,
    get count() { return [...entries.values()].filter(e => !e.aftermath).length; },
    get telemetry() { return [...entries].map(([targetId, e]) => ({ targetId, phase: e.phase, visible: e.root.visible, markReveal: e.markReveal, height: e.root.position.y })); },
    dispose() { reset(); models.dispose(); } };
}
