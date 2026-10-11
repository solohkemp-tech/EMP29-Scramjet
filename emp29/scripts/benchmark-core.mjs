// SPDX-License-Identifier: AGPL-3.0-only
// npm ci && npm run build, then:
// node scripts/benchmark-core.mjs --baseline /path/to/previous/scramjet.js
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInContext } from 'node:vm';
import { performance } from 'node:perf_hooks';
import { JSDOM, VirtualConsole } from 'jsdom';
const baselinePath=process.argv[process.argv.indexOf('--baseline')+1];
if(!process.argv.includes('--baseline')||!baselinePath)throw new Error('Provide --baseline with the previous compiled scramjet.js bundle.');
const manifest=JSON.parse(await readFile('dist/build.json','utf8'));
const wasm=await readFile('dist'+manifest.runtime.wasm);
const baseline=await readFile(baselinePath,'utf8'),current=await readFile('dist'+manifest.runtime.scramjet,'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const corpus=[
  'export function probe(){return top.location.href;}',
  'const target = window.location; console.log(target.href);',
  'export const host = globalThis.location.hostname;',
  'import x from "./dependency.js"; export {x};',
  'async function start(){return import("./dynamic.js");}',
];
function measure(bundle){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost:3030/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
  const w=dom.window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Headers=Headers;w.Response=Response;w.Request=Request;w.ReadableStream=ReadableStream;
  w.fetch=async()=>new Response(wasm);w.URL.createObjectURL=URL.createObjectURL.bind(URL);w.URL.revokeObjectURL=URL.revokeObjectURL.bind(URL);
  runInContext(bundle,dom.getInternalVMContext());let compilations=0;const Module=w.WebAssembly.Module;
  w.WebAssembly.Module=new Proxy(Module,{construct(target,args){compilations++;return Reflect.construct(target,args);}});
  w.$scramjet.setWasm(wasm);
  const config={...w.$scramjet.defaultConfig,flags:{...w.$scramjet.defaultConfig.flags,sourcemaps:false,rewriterLogs:false,debugSourceURL:false,allowInvalidJs:false}};
  const context={config,prefix:new w.URL('http://localhost:3030/~/sj/test/'),interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent}};
  const meta={origin:new w.URL('https://example.com/'),base:new w.URL('https://example.com/script.js')};
  const started=performance.now(),outputs=Array.from({length:25},(_,index)=>w.$scramjet.rewriteJs(corpus[index%corpus.length],null,context,meta,true));
  const result={compilations,elapsedMs:Math.round((performance.now()-started)*1000)/1000,outputs};dom.window.close();return result;
}
const runs=Array.from({length:7},()=>({before:measure(baseline),after:measure(current)}));
const matching=runs.every(run=>JSON.stringify(run.before.outputs)===JSON.stringify(run.after.outputs));
if(!matching)throw new Error('Rewritten outputs differ. Review the core patch before release.');
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
console.log(JSON.stringify({version:manifest.version,revision:manifest.coreRevision,upstreamCommit:manifest.upstreamCommit,node:process.version,scope:'Local Node/V8 + jsdom rewrite microbenchmark; excludes network, site execution, browser rendering and video.',rewritesPerRun:25,corpusSize:corpus.length,runs:runs.length,outputIdentical:matching,baseline:{sha256:sha(baseline),moduleCompilations:runs[0].before.compilations,medianElapsedMs:median(runs.map(run=>run.before.elapsedMs))},current:{sha256:sha(current),moduleCompilations:runs[0].after.compilations,medianElapsedMs:median(runs.map(run=>run.after.elapsedMs))},wasmSha256:sha(wasm)},null,2));
