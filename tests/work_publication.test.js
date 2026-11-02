import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('publication keeps development on work and limits public-site changes to the preview', () => {
  const workflow = readFileSync(new URL('../.github/workflows/work-build-check.yml', import.meta.url), 'utf8');
  const pushes = workflow.split('\n').filter(line => /^\s*git\b.*\bpush\b/.test(line));
  assert.equal(pushes.length, 2);
  assert.match(pushes[0], /^\s*git push origin HEAD:work\s*$/);
  assert.match(pushes[1], /^\s*git -C \.pages-site push origin HEAD:main\s*$/);
  assert.match(workflow, /node scripts\/prepare-preview\.js welt \.pages-site\/preview/);
  assert.match(workflow, /git -C \.pages-site add -- preview/);
  assert.doesNotMatch(workflow, /--force|git -C \.pages-site add (?:\.|--all)/);
  assert.match(workflow, /name: nebeljagd-work-browser/);
  assert.match(workflow, /welt\/nebeljagd-welt-und-editor\.zip/);
});
