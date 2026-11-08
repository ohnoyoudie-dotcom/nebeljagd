import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedEditorStart, planEditorStart, editorVersionLabel } from '../src/map/editor-start.js';

const project = { name: 'Aktuelle Projektkarte', objects: [{ id: 'new-model' }] };
const draft = { name: 'Meine Karte', objects: [{ id: 'my-house' }] };
const snapshot = { name: 'Mitgenommene Karte', objects: [{ id: 'exported-house' }] };

test('opening the current project keeps a different saved draft intact', () => {
  const before = JSON.stringify({ project, draft, snapshot });
  const plan = planEditorStart({ project, draft, snapshot, requested: 'project' });
  assert.equal(plan.map, project);
  assert.equal(plan.pendingDraft, draft);
  assert.equal(plan.offerChoice, false);
  assert.equal(JSON.stringify({ project, draft, snapshot }), before);
});

test('an explicit draft choice resumes that map instead of the project or snapshot', () => {
  const plan = planEditorStart({ project, draft, snapshot, requested: 'draft' });
  assert.equal(plan.map, draft);
  assert.equal(plan.source, 'draft');
  assert.equal(plan.pendingDraft, null);
});

test('a direct online visit automatically resumes the last valid browser draft', () => {
  const before = JSON.stringify({ project, draft });
  const plan = planEditorStart({ project, draft });
  assert.equal(plan.map, draft);
  assert.equal(plan.source, 'draft');
  assert.equal(plan.pendingDraft, null);
  assert.equal(plan.offerChoice, false);
  assert.equal(JSON.stringify({ project, draft }), before);
});

test('a first visit without a browser draft opens the project map', () => {
  const plan = planEditorStart({ project });
  assert.equal(plan.map, project);
  assert.equal(plan.source, 'project');
  assert.equal(plan.offerChoice, false);
});

test('an exported editor opens its embedded map without asking to replace it', () => {
  const plan = planEditorStart({ project, snapshot, draft });
  assert.equal(plan.map, snapshot);
  assert.equal(plan.source, 'snapshot');
  assert.equal(plan.offerChoice, false);
  assert.equal(plan.pendingDraft, draft);
});

test('missing draft falls back to project with an explicit missing-draft result', () => {
  const plan = planEditorStart({ project, snapshot, requested: 'draft' });
  assert.equal(plan.map, project);
  assert.equal(plan.missingDraft, true);
});

test('the same project document in browser storage does not block normal editing', () => {
  const plan = planEditorStart({ project, draft: structuredClone(project) });
  assert.equal(plan.pendingDraft, null);
  assert.equal(plan.offerChoice, false);
});

test('only the explicit supported start parameters request a different map', () => {
  assert.equal(requestedEditorStart('?v=abc&start=draft'), 'draft');
  assert.equal(requestedEditorStart('?start=project'), 'project');
  assert.equal(requestedEditorStart('?v=9332ab4'), null);
  assert.equal(requestedEditorStart('?start=https://example.invalid/map.json'), null);
});

test('a released editor shows its build identity and development stays distinguishable', () => {
  assert.equal(editorVersionLabel({ buildId: 'a1b2c3d4e5f6' }), 'Editor a1b2c3d4e5f6');
  assert.equal(editorVersionLabel(null), 'Editor · Entwicklung');
});
