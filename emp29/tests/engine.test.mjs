import test from 'node:test';
import assert from 'node:assert/strict';
import { ProxyEngine, repairRuntime } from '../src/engine.js';
function fixture(ready=true) {
  const events=[]; let release;
  const initialized=new Promise(resolve=>release=resolve);
  const worker={state:'activated',scriptURL:'https://emp.example/sw.js'};
  const sw=Object.assign(new EventTarget(),{controller:worker,register:async()=>({active:worker,update:async()=>{events.push('sw-update');}})});
  class Transport {ready=false;async init(){events.push('transport-start');await initialized;this.ready=ready;events.push('transport-ready');}}
  class Controller {constructor(options){events.push('controller-create');assert.ok(options.transport.ready);this.frames=[];}async wait(){events.push('controller-ready');}}
  const environment={navigator:{serviceWorker:sw},isSecureContext:true,location:{origin:'https://emp.example'},LibcurlTransport:{LibcurlClient:Transport},$scramjetController:{Controller}};
  const engine=new ProxyEngine({runtime:{scramjet:'core',controller:'controller',utils:'utils',libcurl:'transport'},settings:{transport:'libcurl',wisp:''},environment});
  engine.loadScript=async path=>{events.push(path);};
  return {engine,events,release,sw};
}
test('WASM is ready before Controller creation and concurrent starts share one initialization',async()=>{
  const {engine,events,release}=fixture();const a=engine.start(),b=engine.start();
  await new Promise(resolve=>setImmediate(resolve));assert.ok(events.includes('transport-start'));assert.ok(!events.includes('controller-create'));
  release();assert.equal(await a,await b);assert.equal(events.filter(x=>x==='controller-create').length,1);
  assert.ok(events.indexOf('transport-ready')<events.indexOf('controller-create'));assert.equal(engine.phase,'ready');
});
test('successful init() with an unready transport still blocks navigation',async()=>{
  const {engine,release,events}=fixture(false);const result=engine.start();release();
  await assert.rejects(result,/WASM/);assert.ok(!events.includes('controller-create'));assert.equal(engine.phase,'error');
});
test('registration readiness cannot substitute for an actually controlling worker',async()=>{
  const {engine,sw,release}=fixture();const correct=sw.controller;sw.controller={state:'activated',scriptURL:'https://emp.example/old.js'};
  sw.register=async()=>({active:correct,update:async()=>{setTimeout(()=>{sw.controller=correct;sw.dispatchEvent(new Event('controllerchange'));},10);}});
  const result=engine.start();release();await result;assert.equal(sw.controller,correct);
});
test('plain HTTP on a remote host is reported clearly',async()=>{
  const {engine}=fixture();engine.env.isSecureContext=false;await assert.rejects(engine.start(),/HTTPS/);
});
test('runtime repair preserves unrelated service workers and unrelated caches',async()=>{
  const removed=[],deleted=[];
  await repairRuntime({location:{origin:'https://emp.example'},navigator:{serviceWorker:{getRegistrations:async()=>[
    {active:{scriptURL:'https://emp.example/sw.js'},unregister:async()=>removed.push('ours')},
    {active:{scriptURL:'https://emp.example/another/sw.js'},unregister:async()=>removed.push('other')},
  ]}},caches:{keys:async()=>['emp29-static-v1','scramjet-http-cache-v2','other-app'],delete:async x=>deleted.push(x)}});
  assert.deepEqual(removed,['ours']);assert.deepEqual(deleted,['emp29-static-v1','scramjet-http-cache-v2']);
});

function adaptiveFixture({libcurlFails=true,firstEndpointFails=false}={}){
  const events=[],health=new Map();let controllers=0,swaps=0;
  const worker={state:'activated'},sw=Object.assign(new EventTarget(),{controller:worker,register:async()=>({active:worker,update:async()=>{}})});
  class Socket{constructor(url){events.push('probe:'+url);queueMicrotask(()=>{if(firstEndpointFails&&url.includes('primary.example'))this.onerror?.();else this.onmessage?.({data:new Uint8Array([3,0,0,0,0,128,0,0,0]).buffer});});}close(){}}
  class Curl{ready=false;constructor(options){this.options=options;}async init(){events.push('curl-init');if(libcurlFails)throw new Error('curl failed');this.ready=true;}}
  class Epoxy{ready=false;constructor(options){this.options=options;}async init(){events.push('epoxy-init');assert.equal(controllers,0);this.ready=true;}}
  class Controller{constructor(options){assert.ok(options.transport.ready);controllers++;events.push('controller');this.frames=[];this.transport=options.transport;}async wait(){}setTransport(next){assert.ok(next.ready);swaps++;this.transport=next;}}
  const environment={navigator:{serviceWorker:sw},isSecureContext:true,location:{origin:'https://emp.example'},WebSocket:Socket,LibcurlTransport:{LibcurlClient:Curl},EpoxyTransport:{EpoxyClient:Epoxy},$scramjetController:{Controller},sessionStorage:{getItem:key=>health.get(key)||null,setItem:(key,value)=>health.set(key,value)}};
  const engine=new ProxyEngine({runtime:{scramjet:'core',controller:'controller',utils:'utils',libcurl:'curl',epoxy:'epoxy'},settings:{transport:'auto',wisp:'wss://primary.example/wisp/',wispFallbacks:['wss://backup.example/wisp/'],transportTimeout:20},environment});engine.loadScript=async()=>{};
  return {engine,events,health,counts:()=>({controllers,swaps}),recover:()=>{libcurlFails=false;}};
}
test('automatic transport fallback prepares Epoxy before the only Controller is created',async()=>{
  const {engine,events,counts}=adaptiveFixture();await engine.start();
  assert.equal(engine.selectedTransport,'epoxy');assert.ok(events.indexOf('epoxy-init')<events.indexOf('controller'));assert.deepEqual(counts(),{controllers:1,swaps:0});
  assert.deepEqual(engine.snapshot().attempts.map(x=>[x.transport,x.ok]),[['epoxy',true],['libcurl',false]]);
  assert.deepEqual(engine.autoOrder(engine.selectedWisp),['epoxy','libcurl']);
});
test('an unavailable primary Wisp endpoint selects a configured fallback before any site request',async()=>{
  const {engine,events}=adaptiveFixture({firstEndpointFails:true});await engine.start();
  assert.equal(engine.selectedWisp,'wss://backup.example/wisp/');assert.equal(engine.transport.options.wisp,engine.selectedWisp);
  assert.deepEqual(engine.snapshot().checks.map(x=>x.ok),[false,true]);assert.ok(events.indexOf('probe:wss://backup.example/wisp/')<events.indexOf('epoxy-init'));
});
test('a failed manual switch keeps the working transport and recovery reuses the existing Controller',async()=>{
  const {engine,counts,recover}=adaptiveFixture();const controller=await engine.start(),working=controller.transport;
  await assert.rejects(engine.switchTransport('libcurl'),/curl failed/);assert.equal(controller.transport,working);assert.equal(engine.selectedTransport,'epoxy');assert.equal(engine.phase,'ready');
  recover();assert.equal(await engine.switchTransport('libcurl'),'libcurl');assert.equal(await engine.start(),controller);assert.deepEqual(counts(),{controllers:1,swaps:1});
});
