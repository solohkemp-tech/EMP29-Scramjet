import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { transform } from 'esbuild';
const manifest=JSON.parse(await readFile('dist/build.json','utf8'));
const bytes=await readFile('dist'+manifest.runtime.wasm);
async function runtime(t){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost:3030/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});t.after(()=>dom.window.close());
  const w=dom.window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Response=Response;w.Request=Request;w.Headers=Headers;w.ReadableStream=ReadableStream;w.structuredClone=structuredClone;
  w.URL.createObjectURL=URL.createObjectURL.bind(URL);w.URL.revokeObjectURL=URL.revokeObjectURL.bind(URL);
  w.fetch=async()=>new Response(bytes);
  for(const key of ['scramjet','controller'])runInContext(await readFile('dist'+manifest.runtime[key],'utf8'),dom.getInternalVMContext());
  return {w,realm:dom.getInternalVMContext()};
}
function fixture(w){const controller=Object.create(w.$scramjetController.Controller.prototype);Object.assign(controller,{config:{wasmPath:'/rewriter.wasm'},wasmAlreadyFetched:false,wasmBytesPromise:null,wasmPayloadPromise:null});return controller;}

test('actual WASM compiles once for repeated rewrites, with retry after a failed replacement',async t=>{
  const {w}=await runtime(t);let compilations=0;const Module=w.WebAssembly.Module;
  w.WebAssembly.Module=new Proxy(Module,{construct(target,args){compilations++;return Reflect.construct(target,args);}});
  w.$scramjet.setWasm(bytes);
  const config={...w.$scramjet.defaultConfig,flags:{...w.$scramjet.defaultConfig.flags,sourcemaps:false,rewriterLogs:false,debugSourceURL:false}};
  const context={config,prefix:new w.URL('http://localhost:3030/~/sj/test/'),interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent}},meta={origin:new w.URL('https://example.com/'),base:new w.URL('https://example.com/script.js')};
  const source='export function probe(){return top.location.href;}';const outputs=Array.from({length:25},()=>w.$scramjet.rewriteJs(source,null,context,meta,true));
  assert.equal(compilations,1);assert.equal(new Set(outputs).size,1);assert.ok(outputs[0].includes(config.globals.wrapfn));
  w.$scramjet.setWasm(new w.Uint8Array([0,97,115,109,0]));assert.throws(()=>w.$scramjet.getRewriter(context,meta),/WebAssembly|compile|buffer|expected/i);assert.equal(compilations,2);
  w.$scramjet.setWasm(bytes);assert.doesNotThrow(()=>w.$scramjet.rewriteJs(source,null,context,meta,true));assert.equal(compilations,3);
  w.$scramjet.rewriteJs(source,null,context,meta,true);assert.equal(compilations,3);
});
test('concurrent controller and worker payload requests share one validated WASM download',async t=>{
  const {w}=await runtime(t);const controller=fixture(w);let downloads=0,release;const gate=new Promise(resolve=>release=resolve);
  w.fetch=async()=>{downloads++;await gate;return new Response(bytes);};
  const jobs=Array.from({length:20},(_,index)=>index%2?controller.loadScramjetWasm():controller.loadWasmPayload());release();const outputs=await Promise.all(jobs);
  assert.equal(downloads,1);assert.equal(controller.wasmAlreadyFetched,true);const payload=outputs[0];assert.ok(payload.startsWith("self.WASM = '"));
  assert.deepEqual(Buffer.from(payload.slice(13,-2),'base64'),bytes);assert.equal(await controller.loadWasmPayload(),payload);await controller.loadScramjetWasm();assert.equal(downloads,1);
});
test('failed HTTP or invalid binary downloads do not poison either WASM cache',async t=>{
  const {w}=await runtime(t);const controller=fixture(w);let downloads=0;
  w.fetch=async()=>{downloads++;return downloads===1?new Response('unavailable',{status:503}):downloads===2?new Response('<html>Not a WASM file</html>'):new Response(bytes);};
  await assert.rejects(controller.loadWasmPayload(),/HTTP 503/);await assert.rejects(controller.loadScramjetWasm(),/invalid/);assert.equal(controller.wasmAlreadyFetched,false);
  assert.ok((await controller.loadWasmPayload()).startsWith('self.WASM'));await controller.loadScramjetWasm();assert.equal(downloads,3);assert.equal(controller.wasmAlreadyFetched,true);
});
test('Controller readiness waits for WASM and the actual service-worker RPC before frame creation',async t=>{
  const {w}=await runtime(t);let release;const gate=new Promise(resolve=>release=resolve);w.fetch=async()=>{await gate;return new Response(bytes);};
  w.BroadcastChannel=class extends w.EventTarget{postMessage(){}close(){}};
  class Port extends w.EventTarget{start(){}close(){}postMessage(data){this.other.dispatchEvent(new w.MessageEvent('message',{data}));}}
  w.MessageChannel=class{constructor(){this.port1=new Port();this.port2=new Port();this.port1.other=this.port2;this.port2.other=this.port1;}};
  Object.defineProperty(w.navigator,'serviceWorker',{value:new w.EventTarget()});
  let acknowledgement;
  const worker={postMessage(message,[port]){acknowledgement=()=>port.postMessage({['tabchannel-'+message.$controller$init.id]:{$type:'request',$method:'ready',$token:1}});}};
  const controller=new w.$scramjetController.Controller({serviceworker:worker,transport:{ready:true,request(){},connect(){}}});
  assert.equal(controller.isReady,false);assert.throws(()=>controller.createFrame(),/not ready/);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(controller.isReady,false);
  acknowledgement();await controller.wait();assert.equal(controller.isReady,true);const frame=controller.createFrame();assert.equal(controller.frames[0],frame);
  const [response]=await controller.methods.request({rawUrl:'http://localhost:3030'+frame.prefix+controller.config.virtualWasmPath});assert.equal(response.status,200);assert.ok(response.body.startsWith('self.WASM'));
});
test('bounded binary base64 conversion is byte-exact across chunk boundaries and the full rewriter',async()=>{
  const source=await readFile('../packages/controller/src/wasm-payload.ts','utf8');const {code}=await transform(source,{loader:'ts',format:'esm'});const {binaryBase64}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  for(const length of [0,1,256,32767,32768,32769,65537,bytes.length]){const input=length===bytes.length?bytes:Uint8Array.from({length},(_,index)=>index%256);assert.deepEqual(Buffer.from(binaryBase64(input),'base64'),Buffer.from(input));}
});
