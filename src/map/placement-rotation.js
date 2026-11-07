/** Placement-only preferences. Never randomize while loading or rendering maps. */
export function createPlacementRotationState(random = Math.random) {
  if (typeof random !== 'function') throw new TypeError('A random number function is required.');
  const preferences = new Map();
  const isEnabled = kind => preferences.get(kind) ?? (kind === 'tree');
  return Object.freeze({
    isEnabled,
    setEnabled(kind, enabled) { preferences.set(kind, Boolean(enabled)); },
    nextRotation(kind) {
      if (!isEnabled(kind)) return 0;
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError('Placement randomness must be in [0, 1).');
      }
      return value * Math.PI * 2;
    },
  });
}

/** Mount inside the existing palette, including an exported/reopened editor.
 * The returned angle is stored on the new world object, using the same radians
 * as manual editing, JSON export, undo/redo and the game renderer. */
export function createPlacementRotationControl(doc, random = Math.random) {
  const kindSelect = doc.getElementById('palette-kind');
  const actions = doc.querySelector('.object-palette .palette-actions');
  if (!kindSelect || !actions) throw new Error('Object placement palette is missing.');
  const state = createPlacementRotationState(random);
  // An exported standalone HTML file already contains the assembled controls.
  doc.getElementById('palette-placement-rotation')?.remove();
  const wrapper = doc.createElement('div');
  wrapper.id = 'palette-placement-rotation';
  const label = doc.createElement('label');
  label.className = 'landscape-check';
  label.htmlFor = 'palette-random-rotation';
  const checkbox = doc.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'palette-random-rotation';
  checkbox.setAttribute('aria-describedby', 'palette-random-rotation-help');
  label.append(checkbox, doc.createTextNode('Zufällige Drehung (0–360°)'));
  const help = doc.createElement('p');
  help.id = 'palette-random-rotation-help';
  help.className = 'small-note';
  help.textContent = 'Dreht jedes neu gesetzte Objekt einmalig um die Hochachse. Die Drehung wird mit der Karte gespeichert und bleibt von Hand änderbar.';
  wrapper.append(label, help);
  actions.before(wrapper);
  const sync = () => { checkbox.checked = state.isEnabled(kindSelect.value); };
  checkbox.addEventListener('change', () => state.setEnabled(kindSelect.value, checkbox.checked));
  kindSelect.addEventListener('change', sync);
  sync();
  return state;
}
