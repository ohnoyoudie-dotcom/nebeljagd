import { readFileSync } from 'node:fs';
import { gzipSync, deflateRawSync } from 'node:zlib';

// Store large, self-contained GLBs compressed inside the standalone module.
// At startup, restore exactly the original data URL before any GLTFLoader runs.
// No model/texture reduction, external requests, decoders or network dependencies.
const fallback = readFileSync(new URL(import.meta.resolve('three/addons/libs/fflate.module.js')), 'utf8')
  .replace(/^export\s*\{[^}]+\};?$/gm, '').replace(/^export /gm, '');
const restore = `async function __magebrawlRestoreModel(packed){
  const compressed=Uint8Array.from(atob(packed),c=>c.charCodeAt(0));
  let raw;
  if(typeof DecompressionStream==='function'){
    const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    raw=new Uint8Array(await new Response(stream).arrayBuffer());
  }else{__magebrawlGunzip??=__magebrawlCreateGunzip();raw=__magebrawlGunzip(compressed);}
  let binary='';for(let i=0;i<raw.length;i+=32768)binary+=String.fromCharCode(...raw.subarray(i,i+32768));
  return 'data:model/gltf-binary;base64,'+btoa(binary);
}`;
export function packInlineModels(source,{minimumBytes=1_000_000,minimumSaving=16_384}={}) {
  const models=[],seen=new Map();let originalBytes=0,packedBytes=0;
  const javascript=source.replace(/(["'`])data:model\/gltf-binary;base64,([A-Za-z0-9+/=]+)\1/g,(literal,_quote,base64)=>{
    if(seen.has(base64))return `__magebrawlModels[${seen.get(base64)}]`;
    const raw=Buffer.from(base64,'base64');if(raw.length<minimumBytes||raw.toString('ascii',0,4)!=='glTF')return literal;
    const packed=gzipSync(raw,{level:9}).toString('base64');
    const before=deflateRawSync(Buffer.from(base64),{level:9}).length,after=deflateRawSync(Buffer.from(packed),{level:9}).length;
    if(before-after<minimumSaving)return literal;
    const i=models.length;seen.set(base64,i);models.push(packed);originalBytes+=before;packedBytes+=after;
    return `__magebrawlModels[${i}]`;
  });
  if(!models.length)return {javascript:source,models:0,originalBytes:0,packedBytes:0};
  // Sequential expansion bounds temporary decompression buffers on tablets.
  const prefix=`let __magebrawlGunzip;function __magebrawlCreateGunzip(){${fallback}\nreturn gunzipSync;}\n`+restore+`\nconst __magebrawlModels=[];for(const packed of ${JSON.stringify(models)})__magebrawlModels.push(await __magebrawlRestoreModel(packed));\n`;
  return {javascript:prefix+javascript,models:models.length,originalBytes,packedBytes};
}
