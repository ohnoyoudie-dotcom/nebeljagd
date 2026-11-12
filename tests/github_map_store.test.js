import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documentHash, mapDocument, planMapSync, readGitHubMap, writeGitHubMap } from '../src/map/github-map-store.js';
import { githubSyncAvailable } from '../src/map/github-map-sync.js';

const project = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const oldSha = 'a'.repeat(40), newSha = 'b'.repeat(40), commit = 'c'.repeat(40);
const token = 'test-only-placeholder-credential';
const fixture = (name = 'Bäume, Sümpfe und 🌙') => ({...structuredClone(project), name});
const blob = (map, sha = oldSha) => ({type: 'file', size: Buffer.byteLength(mapDocument(map)), sha, encoding: 'base64', content: Buffer.from(mapDocument(map)).toString('base64')});
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type':'application/json'}});

test('GitHub map read uses the fixed work source and preserves the complete Unicode document', async () => {
  const map = fixture();
  const remote = await readGitHubMap({token, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/ohnoyoudie-dotcom/nebeljagd/contents/worldmap.json?ref=work');
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    return json(blob(map));
  }});
  assert.deepEqual(remote.map, map);
  assert.equal(remote.hash, await documentHash(mapDocument(map)));
});

test('large GitHub contents responses use the same verified blob SHA', async () => {
  const map = fixture(), calls = [];
  const remote = await readGitHubMap({token, fetchImpl: async url => {
    calls.push(url);
    return calls.length === 1 ? json({...blob(map), encoding:'none', content:''}) : json(blob(map));
  }});
  assert.deepEqual(remote.map, map);
  assert.equal(calls[1], `https://api.github.com/repos/ohnoyoudie-dotcom/nebeljagd/git/blobs/${oldSha}`);
});

test('saving commits only root worldmap.json on work with an optimistic-lock SHA', async () => {
  const map = fixture();
  const result = await writeGitHubMap({token, map, expectedSha: oldSha, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/ohnoyoudie-dotcom/nebeljagd/contents/worldmap.json');
    assert.equal(init.method, 'PUT');
    const body = JSON.parse(init.body);
    assert.equal(body.branch, 'work'); assert.equal(body.sha, oldSha);
    assert.deepEqual(JSON.parse(Buffer.from(body.content,'base64').toString('utf8')), map);
    assert.equal(init.body.includes(token), false);
    return json({content: {sha: newSha}, commit: {sha: commit}}, 201);
  }});
  assert.equal(result.sha, newSha); assert.equal(result.commit, commit);
  assert.equal(result.text, mapDocument(map));
});

for (const status of [409,422]) test(`concurrent write rejection ${status} never retries or force-overwrites`, async () => {
  let calls = 0;
  await assert.rejects(writeGitHubMap({token, map: fixture(), expectedSha: oldSha, fetchImpl: async () => {
    calls++; return json({message:'conflict'},status);
  }}), error => error.code === 'conflict');
  assert.equal(calls, 1);
});

test('lost write response is reconciled by a read without issuing a second write', async () => {
  const map = fixture(), methods = [];
  const result = await writeGitHubMap({token, map, expectedSha: oldSha, fetchImpl: async (_, init) => {
    methods.push(init.method);
    if (init.method === 'PUT') throw new Error('transport error with private headers');
    return json(blob(map,newSha));
  }});
  assert.deepEqual(methods,['PUT','GET']); assert.equal(result.sha,newSha); assert.equal(result.commit,null);
});

test('an ambiguous write with a different remote map remains a failure', async () => {
  const methods = [];
  await assert.rejects(writeGitHubMap({token, map: fixture(), expectedSha: oldSha, fetchImpl: async (_, init) => {
    methods.push(init.method);
    if (init.method === 'PUT') throw new Error(token);
    return json(blob(fixture('Other author'),newSha));
  }}), error => error.code === 'network' && !error.message.includes(token));
  assert.deepEqual(methods,['PUT','GET']);
});

test('missing credentials, invalid maps and missing base revisions cannot send a write', async () => {
  const fetchImpl = async () => { assert.fail('must not contact GitHub'); };
  await assert.rejects(writeGitHubMap({token, map: fixture(), expectedSha: null, fetchImpl}), error => error.code === 'conflict');
  await assert.rejects(writeGitHubMap({token, map: {}, expectedSha: oldSha, fetchImpl}), error => error.code === 'invalid');
  await assert.rejects(readGitHubMap({token:'',fetchImpl}), error => error.code === 'auth');
});

for (const status of [401,403,404]) test(`credential error ${status} is sanitized and never changes the map`, async () => {
  await assert.rejects(readGitHubMap({token, fetchImpl: async () => json({message:token},status)}), error => error.code === 'auth' && !error.message.includes(token));
});

test('invalid or oversize remote maps are rejected before adoption', async () => {
  for (const value of [ {...blob(fixture()),size:5_000_001}, {...blob(fixture()),sha:'../unsafe'}, {...blob(fixture()),content:btoa('{}')} ]) {
    await assert.rejects(readGitHubMap({token,fetchImpl:async()=>json(value)}), error => error.code === 'invalid');
  }
});

test('remote changes are adopted only when local content was not independently edited', () => {
  const local = fixture('Local'), remote = {map: fixture('Remote'),sha:newSha};
  assert.equal(planMapSync({local,project,remote,baseSha:oldSha}), 'conflict');
  assert.equal(planMapSync({local,project,remote,baseSha:oldSha,unchangedSinceSave:true}), 'remote');
  assert.equal(planMapSync({local:project,project,remote}), 'remote');
  assert.equal(planMapSync({local,project,remote,baseSha:newSha}), 'local');
  assert.equal(planMapSync({local,project,remote:{map:project,sha:oldSha}}), 'local');
  assert.equal(planMapSync({local,project,remote:{map:local,sha:newSha}}), 'synced');
  assert.equal(planMapSync({local,project:remote.map,remote,unchangedSinceSave:true}), 'remote', 'a newer published project replaces the unchanged previously synced draft');
  assert.equal(planMapSync({local,project:remote.map,remote,baseSha:oldSha}), 'conflict', 'a newly built editor cannot make an old unsaved draft overwrite someone else’s newer map');
});

test('publication connection is limited to the owner preview and explicit loopback tests', () => {
  assert.equal(githubSyncAvailable(new URL('https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/map-editor.html')), true);
  assert.equal(githubSyncAvailable(new URL('http://127.0.0.1:4174/map-editor.html?sync=github')), true);
  for (const url of ['file:///tmp/map-editor.html','https://example.com/map-editor.html?sync=github','http://127.0.0.1:4174/map-editor.html','https://ohnoyoudie-dotcom.github.io/other/map-editor.html']) assert.equal(githubSyncAvailable(new URL(url)), false);
});

test('opening a connected editor selects the latest online save even with an older unsaved draft', () => {
  const local = fixture('Old browser draft'), remote = {map: fixture('Latest online save'), sha: newSha};
  for (const baseSha of [undefined, oldSha, newSha]) {
    assert.equal(planMapSync({local, project, remote, baseSha, opening: true}), 'remote');
  }
  assert.equal(planMapSync({local: remote.map, project, remote, opening: true}), 'synced');
  assert.equal(planMapSync({local, project, remote, baseSha: oldSha}), 'conflict', 'connecting or saving during editing keeps conflict protection');
});
