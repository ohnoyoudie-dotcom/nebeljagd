import test from 'node:test';
import assert from 'node:assert/strict';
import { freshPlaytestUrl } from '../src/map/playtest-url.js';
const editor='https://example.test/preview/map-editor.html?v=OLD-EDITOR';
test('an open stale editor launches the current game release, not its own cached version', async()=>{
 let request;
 const url=await freshPlaytestUrl(editor,{fetchRelease:async(url,options)=>{
  request={url,options};return {ok:true,json:async()=>({files:{'magebrawl.html':{sha256:'a'.repeat(64)}}})};
 }});
 assert.equal(url.pathname,'/preview/magebrawl.html');
 assert.equal(url.searchParams.get('mapSource'),'editor');
 assert.equal(url.searchParams.get('v'),'a'.repeat(64));
 assert.equal(request.options.cache,'no-store');
 assert.equal(request.url.pathname,'/preview/release.json');
});
test('failed and invalid releases still launch with a fresh cache key; offline exports stay relative',async()=>{
 for(const fetchRelease of [async()=>{throw Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({files:{'magebrawl.html':{sha256:'invalid'}}})})]){
  assert.equal((await freshPlaytestUrl(editor,{fetchRelease,now:()=>1234})).searchParams.get('v'),'1234');
 }
 const file=await freshPlaytestUrl('file:///game/map-editor.html?v=old',{fetchRelease:()=>assert.fail()});
 assert.equal(file.href,'file:///game/magebrawl.html?mapSource=editor');
});
