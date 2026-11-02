import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('work publication cannot update main or deploy the public Pages site', () => {
  const workflow = readFileSync(new URL('../.github/workflows/work-build-check.yml', import.meta.url), 'utf8');
  const pushes = workflow.split('\n').filter(line => /^\s*git\b.*\bpush\b/.test(line));
  assert.ok(pushes.length > 0, 'the verified build must still be published');
  for (const command of pushes) assert.match(command, /^\s*git push origin HEAD:work\s*$/);
  assert.doesNotMatch(workflow, /ref:\s*main\b|pages:\s*write|request-pages-build\.js|actions\/(?:deploy-pages|upload-pages-artifact)@/);
  assert.match(workflow, /name: nebeljagd-work-browser/);
  assert.match(workflow, /welt\/nebeljagd-welt-und-editor\.zip/);
});
