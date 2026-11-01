import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Request the repository's existing branch-based Pages build and verify it. */
export async function requestPagesBuild({repository, commit, token, fetchImpl = fetch,
  attempts = 90, pollMilliseconds = 5000, wait = sleep, onStatus = () => {}}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('A valid owner/repository is required.');
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('The exact main commit is required.');
  if (!token) throw new Error('The workflow GitHub token is required.');
  const base = `https://api.github.com/repos/${repository}`;
  const headers = {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28'};
  async function request(path, method = 'GET', missingAllowed = false) {
    const response = await fetchImpl(base + path, {method, headers, signal: AbortSignal.timeout(20000)});
    if (missingAllowed && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub Pages ${method} ${path} failed (HTTP ${response.status}).`);
    return response.json();
  }

  const site = await request('/pages');
  if (site.build_type !== 'legacy') {
    throw new Error('Automatic preview publication expects the existing branch-based Pages site. Pages currently uses a workflow or an unknown mode; use its deployment workflow instead. Hosting settings were not changed.');
  }
  if (site.source?.branch !== 'main' || site.source?.path !== '/') {
    throw new Error('Pages must publish main from the repository root for this delivery workflow. Check Settings → Pages; no hosting settings were changed.');
  }
  await request('/pages/builds', 'POST');
  for (let attempt = 0; attempt < attempts; attempt++) {
    const build = await request('/pages/builds/latest', 'GET', true);
    onStatus({attempt: attempt + 1, commit: build?.commit ?? null, status: build?.status ?? 'pending'});
    if (build?.commit === commit) {
      if (build.status === 'built') return build;
      if (build.status === 'errored') throw new Error(`GitHub Pages failed to build the expected commit ${commit}. Check the repository Pages build log.`);
    }
    if (attempt + 1 < attempts) await wait(pollMilliseconds);
  }
  throw new Error(`Pages did not confirm deployment of ${commit} within the polling window. A different or older successful build does not verify this release.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const build = await requestPagesBuild({
    repository: process.env.GITHUB_REPOSITORY,
    commit: process.env.PAGES_COMMIT,
    token: process.env.GH_TOKEN,
    onStatus: ({attempt, commit, status}) => console.log(`Pages check ${attempt}: ${status}, commit ${commit ?? 'pending'}`),
  });
  console.log(`GitHub Pages built the matched preview at ${build.commit}.`);
}
