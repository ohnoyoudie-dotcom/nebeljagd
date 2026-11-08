import * as THREE from 'three';

/** Temporarily light the avatar's own materials without replacing its textures. */
export function createCharacterGlow(materials) {
  const entries = [...new Set(materials)].filter(material => material.emissive?.isColor).map(material => ({
    material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity ?? 1,
  }));
  const gold = new THREE.Color('#f8cd84');
  let strength = 0;
  function set(value = 0) {
    const next = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
    if (next === strength) return;
    strength = next;
    for (const entry of entries) {
      entry.material.emissive.copy(entry.emissive).lerp(gold, strength * .85);
      entry.material.emissiveIntensity = entry.intensity + strength * .9;
    }
  }
  return {
    set, reset: () => set(0),
    get strength() { return strength; },
    inspect: () => ({ strength, count: entries.length,
      maxEmissiveIntensity: entries.reduce((max, entry) => Math.max(max, entry.material.emissiveIntensity), 0),
      restored: entries.every(entry => entry.material.emissive.equals(entry.emissive)
        && Math.abs(entry.material.emissiveIntensity - entry.intensity) < 1e-8),
    }),
  };
}
