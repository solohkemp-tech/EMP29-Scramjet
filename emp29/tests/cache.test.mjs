import test from 'node:test';
import assert from 'node:assert/strict';
import { readBounded, makePlugins } from '../src/plugins.js';
import { BareResponse } from '@mercuryworkshop/proxy-transports';
test('oversized cache clones are cancelled without consuming the page response',async()=>{
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(100));controller.enqueue(new Uint8Array(100));controller.close();}}));
  const clone=response.clone();await assert.rejects(readBounded(clone.body,128),/too large/);
  assert.equal((await response.arrayBuffer()).byteLength,200);
});
test('small public assets are cached asynchronously and private/video streams remain untouched',async t=>{
  const old={controller:globalThis.$scramjetController,core:globalThis.$scramjet,utils:globalThis.$scramjetUtils,caches:globalThis.caches};
  t.after(()=>{globalThis.$scramjetController=old.controller;globalThis.$scramjet=old.core;globalThis.$scramjetUtils=old.utils;globalThis.caches=old.caches;});
  class ManagedPlugin{constructor(name){this.name=name;}install(frame){this.frame=frame;}tap(hook,callback){hook.push(callback);}}
  globalThis.$scramjetController={ManagedPlugin};globalThis.$scramjet={BareResponse};globalThis.$scramjetUtils={UrlWatcherPlugin:class{}};
  const stored=new Map();let written;const done=new Promise(resolve=>written=resolve);
  globalThis.caches={open:async()=>({put:async(key,value)=>{stored.set(key.url,value);written();},match:async key=>stored.get(key.url)?.clone(),keys:async()=>[...stored.keys()].map(url=>new Request(url)),delete:async key=>stored.delete(key.url)})};
  const request={method:'GET',cache:'default',initialHeaders:{get:()=>null,toRawHeaders:()=>[]}};
  const ctx={request,parsed:{destination:'script',url:new URL('https://example.com/a.js')}};
  const frame={prefix:'/~/sj/test/',hooks:{init:{post:[]},error:{request:[]},fetch:{intercept:[],request:[],preresponse:[],response:[]}}};
  const plugin=makePlugins({tab:{id:'test',url:'https://example.com/'},settings:{cache:true,blockedDomains:[],blockTrackers:false},onUrl(){},onTitle(){},onError(){},onRequest(){},onNewTab(){}})[1];plugin.install(frame);
  const makeResponse=policy=>BareResponse.fromNativeResponse(new Response('const x=1;',{headers:{'content-type':'application/javascript','cache-control':policy,'content-length':'10'}}));
  const privateProps={response:makeResponse('private,max-age=60')};await frame.hooks.fetch.preresponse[0](ctx,privateProps);assert.equal(stored.size,0);assert.equal(await privateProps.response.text(),'const x=1;');
  const props={response:makeResponse('public,max-age=60')};await frame.hooks.fetch.preresponse[0](ctx,props);assert.equal(await props.response.text(),'const x=1;');await done;assert.equal(stored.size,1);
  const fetchProps={};await frame.hooks.fetch.request[0](ctx,fetchProps);assert.ok(fetchProps.earlyResponse);assert.equal(await fetchProps.earlyResponse.text(),'const x=1;');
  const video={request:{...request},parsed:{destination:'video',url:new URL('https://example.com/video')}};const videoProps={response:makeResponse('public,max-age=60')};await frame.hooks.fetch.preresponse[0](video,videoProps);assert.equal(stored.size,1);assert.equal(await videoProps.response.text(),'const x=1;');
});
