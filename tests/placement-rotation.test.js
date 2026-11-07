import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlacementRotationState, createPlacementRotationControl } from '../src/map/placement-rotation.js';

test('trees default to random yaw; other object types retain zero rotation', () => {
  const state = createPlacementRotationState(() => .25);
  assert.equal(state.isEnabled('tree'), true);
  assert.equal(state.nextRotation('tree'), Math.PI / 2);
  for (const kind of ['house', 'rock', 'wall', 'fence', 'sword']) {
    assert.equal(state.isEnabled(kind), false);
    assert.equal(state.nextRotation(kind), 0);
  }
});

test('preferences are independent by kind and survive repeated queries', () => {
  const state = createPlacementRotationState(() => .5);
  state.setEnabled('tree', false);
  state.setEnabled('rock', true);
  assert.equal(state.nextRotation('tree'), 0);
  assert.equal(state.nextRotation('rock'), Math.PI);
  assert.equal(state.nextRotation('house'), 0);
  assert.equal(state.isEnabled('tree'), false);
});

test('disabled placement and querying preferences never consume randomness', () => {
  let calls = 0;
  const state = createPlacementRotationState(() => { calls++; return .75; });
  state.isEnabled('tree');
  state.setEnabled('tree', false);
  assert.equal(state.nextRotation('tree'), 0);
  state.nextRotation('house');
  assert.equal(calls, 0);
  state.setEnabled('tree', true);
  assert.equal(state.nextRotation('tree'), Math.PI * 1.5);
  assert.equal(calls, 1);
});

test('each new enabled placement samples once and keeps angles in radians', () => {
  const values = [0, .125, .5, 1 - Number.EPSILON];
  let calls = 0;
  const state = createPlacementRotationState(() => values[calls++]);
  const angles = values.map(() => state.nextRotation('tree'));
  assert.equal(calls, values.length);
  assert.equal(new Set(angles).size, values.length);
  assert.equal(angles[1], Math.PI / 4);
  assert(angles.every(angle => angle >= 0 && angle < Math.PI * 2));
});

test('rotation remains ordinary stored map data, never a live random expression', () => {
  let calls = 0;
  const state = createPlacementRotationState(() => { calls++; return .3; });
  const object = { kind: 'tree', rotation: state.nextRotation('tree') };
  const restored = JSON.parse(JSON.stringify({ objects: [object] }));
  state.setEnabled('tree', false);
  assert.equal(restored.objects[0].rotation, object.rotation);
  assert.equal(calls, 1);
});

test('rejects malformed random sources instead of saving invalid angles', () => {
  assert.throws(() => createPlacementRotationState(null), TypeError);
  for (const value of [NaN, Infinity, -1, 1, '0.5']) {
    assert.throws(() => createPlacementRotationState(() => value).nextRotation('tree'), RangeError);
  }
});

// Tiny DOM double: exercise the controller without adding a browser dependency
// to npm test. The generated editor is also exercised by the browser smoke test.
function fixture(kind = 'house') {
  const nodes = new Map();
  const create = tag => ({
    tag, children: [], listeners: {}, attributes: {}, checked: false,
    append(...children) { this.children.push(...children); for (const c of children) if (c.id) nodes.set(c.id, c); },
    before(node) { nodes.set(node.id, node); },
    remove() { nodes.delete(this.id); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); },
    dispatch(name) { for (const handler of this.listeners[name] ?? []) handler(); },
  });
  const select = create('select'); select.value = kind; nodes.set('palette-kind', select);
  const actions = create('div');
  const doc = {
    getElementById: id => nodes.get(id) ?? null,
    querySelector: selector => selector === '.object-palette .palette-actions' ? actions : null,
    createElement: create, createTextNode: text => ({ text }),
  };
  return { doc, nodes, select };
}

test('control mounts accessibly, defaults trees on and stores per-kind choices', () => {
  const { doc, nodes, select } = fixture('tree');
  const state = createPlacementRotationControl(doc, () => .5);
  const checkbox = nodes.get('palette-random-rotation');
  assert.equal(checkbox.checked, true);
  assert.equal(checkbox.attributes['aria-describedby'], 'palette-random-rotation-help');
  checkbox.checked = false; checkbox.dispatch('change');
  assert.equal(state.nextRotation('tree'), 0);
  select.value = 'rock'; select.dispatch('change');
  assert.equal(checkbox.checked, false);
  checkbox.checked = true; checkbox.dispatch('change');
  assert.equal(state.nextRotation('rock'), Math.PI);
  select.value = 'tree'; select.dispatch('change');
  assert.equal(checkbox.checked, false);
});

test('reopened exported HTML replaces its old control instead of duplicating it', () => {
  const { doc, nodes } = fixture();
  let removed = false;
  nodes.set('palette-placement-rotation', { remove() { removed = true; } });
  createPlacementRotationControl(doc);
  assert.equal(removed, true);
  assert.equal(nodes.get('palette-placement-rotation').children.length, 2);
});

test('missing palette fails with a useful error', () => {
  assert.throws(() => createPlacementRotationControl({ getElementById: () => null, querySelector: () => null }), /palette is missing/);
});
