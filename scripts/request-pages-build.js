import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Request the repository's existing branch-based Pages build and verify it. */
export async function requestPagesBuild({repository, commit, token, fetchImpl = fetch,
  attempts = 90, pollMilliseconds = 5000, pollTimeoutMilliseconds = 450000,
  requestAttempts = 3, requestRetryMilliseconds = 1000, requestTimeoutMilliseconds = 20000,
  wait = sleep, now = Date.now, onStatus = () => {}}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('A valid owner/repository is required.');
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('The exact main commit is required.');
  if (!token) throw new Error('The workflow GitHub token is required.');
  const base = `https://api.github.com/repos/${repository}`;
  const headers = {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28'};
  class TransientRequestError extends Error {}
  class AmbiguousBuildRequestError extends Error {}
  class PollingDeadlineError extends Error {}
  async function pause(milliseconds, deadline = Infinity) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new PollingDeadlineError();
    await wait(Math.max(0, Math.min(milliseconds, remaining)));
  }
  async function request(path, method = 'GET', missingAllowed = false, deadline = Infinity) {
    // GET retries are safe. A timed-out POST may already have queued a build;
    // never blindly submit it again. Only explicit 429/503 rejections get one
    // retry. Other ambiguous POST failures are resolved by read-only polling.
    const maxAttempts = method === 'POST' ? 2 : requestAttempts;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const remaining = deadline - now();
      if (remaining <= 0) throw new PollingDeadlineError();
      let response;
      try {
        response = await fetchImpl(base + path, {method, headers,
          signal: AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(requestTimeoutMilliseconds, remaining))))});
        if (response.ok) return await response.json();
      } catch {
        // Do not echo transport errors: implementations may include headers.
        if (method === 'POST') throw new AmbiguousBuildRequestError('The Pages build request was not confirmed; checking the exact commit without resubmitting it.');
        if (attempt + 1 === maxAttempts) throw new TransientRequestError('The GitHub Pages read request remained unavailable after bounded retries.');
        await pause(requestRetryMilliseconds * (attempt + 1), deadline);
        continue;
      }
      if (missingAllowed && response.status === 404) return null;
      await response.body?.cancel();
      const transient = response.status === 429 || response.status >= 500;
      if (!transient) throw new Error(`GitHub Pages ${method} ${path} failed (HTTP ${response.status}).`);
      if (method === 'POST' && ![429, 503].includes(response.status)) {
        throw new AmbiguousBuildRequestError('The Pages build request returned a server error; checking the exact commit without resubmitting it.');
      }
      if (attempt + 1 === maxAttempts) {
        if (method === 'POST') throw new AmbiguousBuildRequestError('The Pages build request remained unavailable; checking for an existing build without further submissions.');
        throw new TransientRequestError(`GitHub Pages ${method} ${path} remained unavailable (HTTP ${response.status}) after bounded retries.`);
      }
      await pause(requestRetryMilliseconds * (attempt + 1), deadline);
    }
  }

  const site = await request('/pages');
  if (site.build_type !== 'legacy') {
    throw new Error('Automatic preview publication expects the existing branch-based Pages site. Pages currently uses a workflow or an unknown mode; use its deployment workflow instead. Hosting settings were not changed.');
  }
  if (site.source?.branch !== 'main' || site.source?.path !== '/') {
    throw new Error('Pages must publish main from the repository root for this delivery workflow. Check Settings → Pages; no hosting settings were changed.');
  }
  try { await request('/pages/builds', 'POST'); }
  catch (error) {
    if (!(error instanceof AmbiguousBuildRequestError)) throw error;
    onStatus({attempt: 0, commit: null, status: 'request-unconfirmed'});
  }
  const deadline = now() + pollTimeoutMilliseconds;
  let lastMatchingStatus = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (now() >= deadline) break;
    let build, temporarilyUnavailable = false;
    try { build = await request('/pages/builds/latest', 'GET', true, deadline); }
    catch (error) {
      if (error instanceof PollingDeadlineError) break;
      if (!(error instanceof TransientRequestError)) throw error;
      temporarilyUnavailable = true;
    }
    onStatus({attempt: attempt + 1, commit: build?.commit ?? null,
      status: temporarilyUnavailable ? 'temporarily-unavailable' : build?.status ?? 'pending'});
    if (build?.commit === commit) {
      lastMatchingStatus = build.status;
      if (build.status === 'built') return build;
      // A duplicate request can cancel an attempt while its successor for the
      // same commit is still building. Only the deadline makes this final.
    }
    if (attempt + 1 < attempts) {
      try { await pause(pollMilliseconds, deadline); }
      catch (error) { if (error instanceof PollingDeadlineError) break; throw error; }
    }
  }
  const observed = lastMatchingStatus
    ? ` Last observed matching build status: ${lastMatchingStatus}.`
    : ' No matching build was observed.';
  throw new Error(`Pages did not confirm deployment of ${commit} within the bounded polling window.${observed} Deployment remains unconfirmed; check the Pages build log. A different or older successful build does not verify this release.`);
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
