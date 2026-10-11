import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { randomUUID } from 'node:crypto';
import { runInContext, SourceTextModule } from 'node:vm';
import { KEY } from '../src/model.js';
import { PRO_KEY } from '../src/pro-model.js';
const manifest=JSON.parse(await readFile('dist/build.json','utf8'));
const html=await readFile('dist/index.html','utf8');
const entry=new URL('../dist'+/src="(\/assets\/app-[^"]+)"/.exec(html)[1],import.meta.url);
async function environment(t,saved,proSaved,prepare) {
  const errors=[];const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(html,{url:'http://localhost:3030',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.isSecureContext=true;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(value=''){this.open=false;this.returnValue=value;this.dispatchEvent(new w.Event('close'));};
  w.AbortSignal=globalThis.AbortSignal;w.Response=Response;w.Request=Request;w.Headers=Headers;w.ReadableStream=ReadableStream;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.structuredClone=structuredClone;
  w.URL.createObjectURL=globalThis.URL.createObjectURL.bind(globalThis.URL);w.URL.revokeObjectURL=globalThis.URL.revokeObjectURL.bind(globalThis.URL);
  Object.defineProperty(w.crypto,'randomUUID',{value:randomUUID});
  w.fetch=async path=>new Response(JSON.stringify(path==='/api/session'?{authenticated:true,required:false}:path==='/api/config'?{brand:'EMP29',telegram:'https://t.me/emp29',engine:manifest.engine,runtime:manifest.runtime}:path==='/api/status'?{uptime:60,activeConnections:0,memoryMB:30,engine:manifest.engine}:{ok:true}),{headers:{'Content-Type':'application/json'}});
  w.caches={delete:async()=>true,keys:async()=>[]};
  if(saved)w.localStorage.setItem(KEY,JSON.stringify(saved));
  if(proSaved)w.localStorage.setItem(PRO_KEY,JSON.stringify(proSaved));
  prepare?.(w);
  t.after(()=>dom.window.close());
  const context=dom.getInternalVMContext(),modules=new Map();
  const getModule=async url=>{
    if(modules.has(url))return modules.get(url);
    const module=new SourceTextModule(await readFile(new URL(url),'utf8'),{context,identifier:url,importModuleDynamically:async(specifier,referrer)=>{
      const child=await getModule(new URL(specifier,referrer.identifier).href);
      if(child.status==='unlinked')await child.link(linker);
      if(child.status==='linked')await child.evaluate();return child;
    }});modules.set(url,module);return module;
  };
  const linker=(specifier,referrer)=>getModule(new URL(specifier,referrer.identifier).href);
  const module=await getModule(entry.href);await module.link(linker);await module.evaluate();
  return {w,context:dom.getInternalVMContext(),doc:w.document,errors,click:selector=>{const node=w.document.querySelector(selector);assert.ok(node,selector);node.click();}};
}
async function tick(){await new Promise(resolve=>setImmediate(resolve));}
test('built app opens, tabs work, all panels open, and controls have accessible labels',async t=>{
  const {doc,click,errors}=await environment(t);await tick();
  assert.equal(doc.querySelectorAll('[role=tab]').length,1);
  click('[data-action=new-tab]');assert.equal(doc.querySelectorAll('[role=tab]').length,2);
  click('.tab-shell.active .tab-close');assert.equal(doc.querySelectorAll('[role=tab]').length,1);
  for(const kind of ['bookmarks','history','settings','diagnostics']){
    click(`.rail [data-panel=${kind}]`);assert.ok(doc.getElementById('panel').open);
    assert.ok(doc.getElementById('panel-body').childElementCount>0);click('#close-panel');
  }
  click('[data-action=commands]');assert.ok(doc.getElementById('commands').open);
  for(const input of doc.querySelectorAll('input:not([type=file]),select,textarea')){
    assert.ok(input.getAttribute('aria-label')||doc.querySelector(`label[for="${input.id}"]`)||input.closest('label'),`Missing label: ${input.id}`);
  }
  assert.deepEqual(errors,[]);
});
test('bookmark creation, filtering, deletion, and theme preferences update the actual DOM',async t=>{
  const {doc,w,click}=await environment(t);await tick();click('.rail [data-panel=bookmarks]');
  doc.getElementById('bookmark-title').value='<img src=x onerror=alert(1)>';
  doc.getElementById('bookmark-url').value='https://example.com/';
  doc.getElementById('add-bookmark').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(doc.querySelector('.list-text strong').textContent,'<img src=x onerror=alert(1)>');assert.equal(doc.querySelector('.list-text img'),null);
  doc.getElementById('panel-search').value='missing';doc.getElementById('panel-search').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(doc.querySelectorAll('.list-item').length,0);
  doc.getElementById('panel-search').value='example';doc.getElementById('panel-search').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(doc.querySelectorAll('.list-item').length,1);
  click('[data-remove-bookmarks="0"]');assert.equal(doc.querySelectorAll('.list-item').length,0);
  click('#close-panel');click('.rail [data-panel=settings]');doc.getElementById('theme').value='light';
  doc.getElementById('settings-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(doc.documentElement.dataset.theme,'light');assert.equal(JSON.parse(w.localStorage.getItem(KEY)).settings.theme,'light');
});
test('unsafe navigation stays in the home screen and reports an error',async t=>{
  const {doc,w}=await environment(t);await tick();doc.getElementById('address').value='javascript:alert(1)';
  doc.getElementById('address-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(doc.getElementById('home').hidden,false);assert.equal(doc.querySelectorAll('iframe').length,0);assert.equal(doc.getElementById('toast').hidden,false);
});
test('restored inactive tabs do not start background frames',async t=>{
  const {doc}=await environment(t,{settings:{remember:true},bookmarks:[],history:[],tabs:[{url:''},{url:'https://example.com/',workspace:'deleted'}]});await tick();
  assert.equal(doc.querySelectorAll('[role=tab]').length,2);assert.equal(doc.querySelectorAll('iframe').length,0);
});
test('actual core/controller/local utility bundles have compatible versions',async t=>{
  const {w,context}=await environment(t);await tick();
  for(const key of ['scramjet','controller','utils'])runInContext(await readFile('dist'+manifest.runtime[key],'utf8'),context);
  assert.equal(w.$scramjet.versionInfo.version,manifest.engine);
  assert.equal(w.$scramjet.versionInfo.build,manifest.upstreamCommit.slice(0,7));
  assert.equal(w.$scramjetController.VERSION,manifest.controller);
  assert.equal(w.$scramjetController.EMP29_CORE_REVISION,manifest.coreRevision);
  assert.doesNotThrow(()=>w.$scramjetController.assertRuntimeScramjetVersion());
  assert.equal(typeof w.$scramjetUtils.UrlWatcherPlugin,'function');
  assert.doesNotThrow(()=>new w.$scramjetUtils.UrlWatcherPlugin(()=>{}));
});
test('fresh WASM rewrites globals inside exported declarations',async t=>{
  const {w,context:realm}=await environment(t);await tick();
  runInContext(await readFile('dist'+manifest.runtime.scramjet,'utf8'),realm);
  w.$scramjet.setWasm(await readFile('dist'+manifest.runtime.wasm));
  const config={...w.$scramjet.defaultConfig,flags:{...w.$scramjet.defaultConfig.flags,sourcemaps:false}};
  const context={config,prefix:new w.URL('http://localhost:3030/~/sj/test/'),interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent}};
  const meta={origin:new w.URL('https://example.com/'),base:new w.URL('https://example.com/script.js')};
  const source='export function probe(){return top.location.href;}';
  const rewritten=w.$scramjet.rewriteJs(source,null,context,meta,true);
  assert.ok(rewritten.includes(config.globals.wrapfn),rewritten);
  assert.ok(rewritten.includes('export function probe'),rewritten);
});
test('URL rewriting survives a site replacing String.startsWith',async t=>{
  const {w,context:realm}=await environment(t);await tick();
  runInContext(await readFile('dist'+manifest.runtime.scramjet,'utf8'),realm);
  const context={config:w.$scramjet.defaultConfig,prefix:new w.URL('http://localhost:3030/~/sj/test/'),interface:{codecEncode:encodeURIComponent,codecDecode:decodeURIComponent}};
  const meta={origin:new w.URL('https://example.com/'),base:new w.URL('https://example.com/')};
  w.String.prototype.startsWith=()=>{throw new Error('clobbered');};
  assert.doesNotThrow(()=>w.$scramjet.rewriteUrl('https://example.com/page',context,meta));
});

test('workspace creation, switching and moving a tab preserve the version one workspace data',async t=>{
  const {w,doc,click,errors}=await environment(t);await tick();click('[data-action=new-tab]');
  click('[data-pro-action=workspaces]');doc.getElementById('new-workspace-name').value='تحقیق';doc.getElementById('create-workspace').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const pro=JSON.parse(w.localStorage.getItem(PRO_KEY)),id=pro.currentWorkspace;assert.notEqual(id,'general');assert.equal(doc.querySelectorAll('[role=tab]').length,1);
  click('[data-workspace=general]');assert.equal(doc.querySelectorAll('[role=tab]').length,2);
  click('[data-pro-action=workspaces]');const move=doc.getElementById('move-workspace');move.value=id;move.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(doc.querySelectorAll('[role=tab]').length,2);w.dispatchEvent(new w.Event('pagehide'));
  assert.equal(JSON.parse(w.localStorage.getItem(KEY)).tabs.filter(tab=>tab.workspace===id).length,2);assert.deepEqual(errors,[]);
});
test('saved sessions restore asleep without duplicate tabs or starting the engine',async t=>{
  const {doc,click}=await environment(t,undefined,{sessions:[{id:'research',name:'Research',tabs:[{url:'https://a.example/'},{url:'https://a.example/'},{url:'https://b.example/'}]}]});await tick();
  click('[data-pro-action=workspaces]');click('[data-restore-session=research]');await tick();
  assert.equal(doc.querySelectorAll('[role=tab]').length,3);assert.equal(doc.querySelectorAll('iframe').length,0);
  click('[data-restore-session=research]');assert.equal(doc.querySelectorAll('[role=tab]').length,3);
});
test('reading library escapes stored markup and saves notes without affecting the live page',async t=>{
  const {w,doc,click,errors}=await environment(t,undefined,{articles:[{id:'article',url:'https://example.com/',title:'<img src=x onerror=alert(1)>',text:'<script>alert(1)</script> Plain article text',notes:''}]});await tick();
  click('[data-pro-action=library]');click('[data-read-article=article]');assert.equal(doc.querySelector('.reader-article img'),null);assert.equal(doc.querySelector('.reader-article script'),null);assert.ok(doc.querySelector('.reader-text').textContent.includes('<script>'));
  doc.getElementById('article-notes').value='My note';click('[data-pro-action=save-article]');await tick();assert.equal(JSON.parse(w.localStorage.getItem(PRO_KEY)).articles[0].notes,'My note');assert.deepEqual(errors,[]);
});
test('site exceptions and tracker preferences persist and Pro shortcuts open labelled dialogs',async t=>{
  const {w,doc,click}=await environment(t,{settings:{remember:true},tabs:[{url:'https://example.com/'}]});await tick();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'p',altKey:true,bubbles:true}));assert.equal(doc.getElementById('pro-panel').dataset.view,'workspaces');
  click('[data-pro-action=shields]');click('[data-pro-action=toggle-trackers]');w.dispatchEvent(new w.Event('pagehide'));assert.equal(JSON.parse(w.localStorage.getItem(KEY)).settings.blockTrackers,true);
  click('[data-pro-action=toggle-site]');await tick();w.dispatchEvent(new w.Event('pagehide'));assert.deepEqual(JSON.parse(w.localStorage.getItem(KEY)).settings.allowedSites,['example.com']);
  for(const input of doc.querySelectorAll('#pro-panel input,#pro-panel select,#pro-panel textarea'))assert.ok(input.getAttribute('aria-label')||input.closest('label')||doc.querySelector(`label[for="${input.id}"]`));
});
test('concurrent startup enforces live frame budget and split view protects visible panes',async t=>{
  let ready,frames=0;const initialization=new Promise(resolve=>ready=resolve);
  const {w,doc,click,errors}=await environment(t,{settings:{remember:true,frameBudget:2},tabs:[{url:''},{url:'https://a.example/'},{url:'https://b.example/'},{url:'https://c.example/'}]},undefined,w=>{
    const worker={state:'activated'};Object.defineProperty(w.navigator,'serviceWorker',{value:Object.assign(new w.EventTarget(),{controller:worker,register:async()=>({active:worker,update:async()=>{}})})});
    class Socket{constructor(){queueMicrotask(()=>this.onmessage?.({data:new w.Uint8Array([3,0,0,0,0,128,0,0,0]).buffer}));}close(){}}
    w.WebSocket=Socket;
    class Transport{ready=false;async init(){await initialization;this.ready=true;}}
    class Controller{constructor(){this.frames=[];}async wait(){}createFrame(element){frames++;const frame={element,prefix:'/~/sj/mock/',go(url){element.src='http://localhost:3030/~/sj/mock/'+encodeURIComponent(url);},back(){},forward(){},reload(){}};this.frames.push(frame);return frame;}}
    w.LibcurlTransport={LibcurlClient:Transport};w.$scramjetController={Controller,ManagedPlugin:class{}};w.$scramjet={};w.$scramjetUtils={UrlWatcherPlugin:class{}};
    const append=w.document.head.append.bind(w.document.head);w.document.head.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='SCRIPT')queueMicrotask(()=>node.onload?.());};
  });await tick();
  const ids=[...doc.querySelectorAll('[role=tab]')].map(tab=>tab.dataset.tab);for(const id of ids.slice(1))click(`[data-tab="${id}"]`);ready();await tick();await tick();
  assert.equal(frames,2);assert.equal(doc.querySelectorAll('iframe').length,2);assert.match(doc.querySelector('.page-state p').textContent,/بودجه/);
  // Mark completed loads, select an existing pane, then open its second pane.
  for(const frame of doc.querySelectorAll('iframe'))frame.dispatchEvent(new w.Event('load'));
  click(`[data-close-tab="${ids[3]}"]`);
  click(`[data-tab="${ids[1]}"]`);click('[data-pro-action=split]');await tick();
  assert.ok(doc.getElementById('frames').classList.contains('is-split'));assert.equal(doc.querySelectorAll('.frame-pane:not([hidden])').length,2);assert.equal(doc.querySelectorAll('iframe').length,2);assert.deepEqual(errors,[]);
  const liveFrames=[...doc.querySelectorAll('iframe')];
  doc.getElementById('language-switch').value='en';doc.getElementById('language-switch').dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.deepEqual([...doc.querySelectorAll('iframe')],liveFrames);assert.equal(frames,2);assert.equal(doc.querySelectorAll('.frame-pane:not([hidden])').length,2);
  const primary=doc.querySelector('.frame-pane:not(.secondary-pane) iframe');
  primary.contentDocument.open();primary.contentDocument.write('<!doctype html><html><head><title>Research article</title></head><body><article><h1>Research article</h1><p>'+('This research article describes a useful result with detailed supporting information. '.repeat(15))+'</p></article></body></html>');primary.contentDocument.close();
  click('[data-pro-action=reader]');
  for(let i=0;i<100&&doc.getElementById('pro-panel').dataset.view!=='reader';i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(doc.getElementById('pro-panel').dataset.view,'reader');assert.ok(doc.querySelector('.reader-text').textContent.includes('supporting information'));
  click('[data-pro-action=save-article]');await tick();assert.equal(JSON.parse(w.localStorage.getItem(PRO_KEY)).articles.length,1);assert.deepEqual(errors,[]);
});

test('persisted English covers the home, dialogs, accessible labels, errors and LTR layout',async t=>{
  const {doc,w,click,errors}=await environment(t,{settings:{language:'en'},bookmarks:[],tabs:[]});await tick();
  assert.equal(doc.documentElement.lang,'en');assert.equal(doc.documentElement.dir,'ltr');
  assert.equal(doc.getElementById('language-switch').value,'en');assert.match(doc.title,/Personal web browser/);
  assert.match(doc.getElementById('home-date').textContent,/[A-Za-z]/);assert.equal(doc.querySelector('link[rel=manifest]').getAttribute('href'),'/manifest-en.webmanifest');
  function coverage(){
    const missing=[],walker=doc.createTreeWalker(doc.body,w.NodeFilter.SHOW_TEXT);
    for(let node;(node=walker.nextNode());)if(/\p{Script=Arabic}/u.test(node.nodeValue)&&!node.parentElement.closest('script,style,noscript,option[value=fa]'))missing.push(node.nodeValue.trim());
    for(const node of doc.querySelectorAll('[aria-label],[placeholder],[data-tip]'))for(const key of ['aria-label','placeholder','data-tip'])if(/\p{Script=Arabic}/u.test(node.getAttribute(key)||''))missing.push(key+': '+node.getAttribute(key));
    assert.deepEqual(missing,[]);
  }
  coverage();for(const kind of ['bookmarks','history','settings','diagnostics']){click(`.rail [data-panel=${kind}]`);await tick();coverage();click('#close-panel');}
  for(const kind of ['workspaces','library','shields']){click(kind==='library'?'.rail [data-pro-action=library]':`.workspace-tools [data-pro-action=${kind}]`);await tick();coverage();click('#pro-panel [data-pro-action=close]');}
  click('[data-action=commands]');coverage();click('[data-action=close-commands]');
  doc.getElementById('address').value='javascript:alert(1)';doc.getElementById('address-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(doc.getElementById('toast').textContent,/HTTP and HTTPS/);coverage();assert.deepEqual(errors,[]);
});
test('switching language live preserves user text, bookmark filters and unsaved form values',async t=>{
  const {doc,w,click}=await environment(t,{settings:{language:'fa'},bookmarks:[{id:'a',title:'نشانک‌ها',url:'https://example.com/',created:1}]}, {workspaces:[{id:'general',name:'حالت مطالعه',color:'mint'}]});await tick();
  const change=value=>{doc.getElementById('language-switch').value=value;doc.getElementById('language-switch').dispatchEvent(new w.Event('change',{bubbles:true}));};
  click('.rail [data-panel=bookmarks]');doc.getElementById('bookmark-title').value='ادامه';doc.getElementById('bookmark-url').value='https://draft.example/';doc.getElementById('panel-search').value='example';doc.getElementById('panel-search').dispatchEvent(new w.Event('input',{bubbles:true}));
  change('en');assert.equal(doc.getElementById('panel-title').textContent,'Your bookmarks');assert.equal(doc.getElementById('bookmark-title').value,'ادامه');assert.equal(doc.getElementById('panel-search').value,'example');assert.equal(doc.querySelector('.list-text strong').textContent,'نشانک‌ها');assert.equal(doc.querySelector('.workspace-chip span:last-of-type').textContent,'حالت مطالعه');assert.equal(JSON.parse(w.localStorage.getItem(KEY)).settings.language,'en');
  change('fa');assert.equal(doc.getElementById('panel-title').textContent,'نشانک‌های تو');assert.equal(doc.getElementById('bookmark-url').value,'https://draft.example/');
  click('#close-panel');click('.rail [data-panel=settings]');doc.getElementById('wisp').value='wss://draft.example/wisp/';doc.getElementById('theme').value='light';change('en');assert.equal(doc.getElementById('theme').value,'light');assert.equal(doc.getElementById('wisp').value,'wss://draft.example/wisp/');assert.equal(doc.getElementById('language').value,'en');
});
test('English login and server errors are available while the browser shell is inert',async t=>{
  const {doc,w}=await environment(t,undefined,undefined,w=>{w.fetch=async path=>new Response(JSON.stringify(path==='/api/session'?{authenticated:false,required:true}:{error:'رمز ورود صحیح نیست.'}),{status:path==='/api/login'?401:200,headers:{'Content-Type':'application/json'}});});await tick();
  assert.equal(doc.getElementById('login').hidden,false);assert.equal(doc.getElementById('shell').inert,true);
  doc.getElementById('password').value='draft password';doc.getElementById('login-language').value='en';doc.getElementById('login-language').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(doc.getElementById('password').value,'draft password');assert.match(doc.querySelector('.login-card h1').textContent,/Welcome/);
  doc.getElementById('login-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(doc.getElementById('login-error').textContent,'Incorrect password.');assert.equal(JSON.parse(w.localStorage.getItem(KEY)).settings.language,'en');
});
test('reader notes and workspace drafts survive a round-trip language switch',async t=>{
  const {doc,w,click}=await environment(t,undefined,{articles:[{id:'a',url:'https://example.com/',title:'حالت مطالعه',text:'نشانک‌ها',notes:'ادامه'}]});await tick();
  const change=value=>{doc.getElementById('language-switch').value=value;doc.getElementById('language-switch').dispatchEvent(new w.Event('change',{bubbles:true}));};
  click('.rail [data-pro-action=library]');click('[data-read-article=a]');doc.getElementById('article-notes').value='حالت مطالعه — unsaved';doc.getElementById('article-notes').focus();doc.getElementById('article-notes').setSelectionRange(3,5);
  change('en');assert.equal(doc.getElementById('pro-title').textContent,'Reading mode');assert.equal(doc.querySelector('.reader-text').textContent,'نشانک‌ها');assert.equal(doc.querySelector('.reader-article h3').textContent,'حالت مطالعه');assert.equal(doc.getElementById('article-notes').value,'حالت مطالعه — unsaved');assert.equal(doc.activeElement.id,'article-notes');assert.equal(doc.getElementById('article-notes').selectionStart,3);
  change('fa');assert.equal(doc.getElementById('article-notes').value,'حالت مطالعه — unsaved');click('[data-pro-action=save-article]');await tick();assert.equal(JSON.parse(w.localStorage.getItem(PRO_KEY)).articles[0].notes,'حالت مطالعه — unsaved');
  click('.workspace-tools [data-pro-action=workspaces]');doc.getElementById('new-workspace-name').value='ادامه';doc.getElementById('session-name').value='نشانک‌ها';change('en');assert.equal(doc.getElementById('new-workspace-name').value,'ادامه');assert.equal(doc.getElementById('session-name').value,'نشانک‌ها');
});
