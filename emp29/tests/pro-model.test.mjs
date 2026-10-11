import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { cleanPro, readPro, captureSession, restorationPlan, captureArticle, frameAdmission, MAX_WORKSPACES, MAX_ARTICLES } from '../src/pro-model.js';
import { cleanSettings, readWorkspace } from '../src/model.js';

test('Pro imports reject executable URLs, duplicate identities and unbounded content',()=>{
  const workspaces=Array.from({length:30},(_,i)=>({id:'space'+i,name:'x'.repeat(100),color:'invalid'}));
  const articles=Array.from({length:30},(_,i)=>({id:'article'+i,url:'https://example.com/',text:'x'.repeat(70000),notes:'x'.repeat(5000)}));
  const data=cleanPro({currentWorkspace:'missing',workspaces,articles,sessions:[{id:'session',name:'safe',tabs:[{url:'javascript:alert(1)'},{url:'https://user:secret@example.com/'},{url:'https://example.com/',title:'ok'}]},{id:'session',tabs:[{url:'https://other.example/'}]}]});
  assert.equal(data.workspaces.length,MAX_WORKSPACES);assert.equal(data.currentWorkspace,'general');
  assert.equal(data.workspaces[1].name.length,40);assert.equal(data.workspaces[1].color,'mint');
  assert.equal(data.articles.length,MAX_ARTICLES);assert.equal(data.articles[0].text.length,60000);assert.equal(data.articles[0].notes.length,4000);
  assert.equal(data.sessions.length,1);assert.equal(data.sessions[0].tabs.length,1);
  assert.equal(readPro({getItem(){throw new Error('disabled');}}).currentWorkspace,'general');
});
test('session restoration is lazy data, deduplicated and atomic at the global tab limit',()=>{
  const session=captureSession([{url:'',title:'home'},{url:'https://a.example/',title:'a',pinned:true},{url:'https://b.example/'},{url:'https://b.example/'}],'research','session');
  assert.deepEqual(Object.keys(session.tabs[0]).sort(),['pinned','title','url']);
  const tabs=[{url:'https://a.example/',workspace:'general'},{url:'https://b.example/',workspace:'other'}];
  assert.deepEqual(restorationPlan(session,tabs,'general').map(x=>x.url),['https://b.example/']);
  const full=Array.from({length:24},()=>({url:'',workspace:'general'})),before=structuredClone(full);
  assert.throws(()=>restorationPlan(session,full,'general'),/۲۴/);assert.deepEqual(full,before);
  assert.throws(()=>captureSession([{url:''}],'empty'),/سایت/);
});
test('Readability extracts text without changing the live document or importing active markup',()=>{
  const body='This paragraph explains an important research result with enough detail for a full reading article. '.repeat(14);
  const dom=new JSDOM(`<html><head><title>Research</title></head><body><nav>Menu</nav><article><h1>Research</h1><p>${body}</p><script>alert('never')</script><img src=x onerror=alert(1)></article></body></html>`,{url:'https://example.com/article'});
  try{
    const before=dom.serialize(),article=captureArticle(dom.window.document,'https://example.com/article',Readability,'article');
    assert.equal(dom.serialize(),before);assert.ok(article.text.includes('research result'));
    assert.ok(!article.text.includes('<script'));assert.ok(!article.text.includes('onerror='));assert.equal(article.notes,'');
    assert.throws(()=>captureArticle(dom.window.document,'javascript:alert(1)',Readability,'bad'),/معتبر/);
  }finally{dom.window.close();}
});
test('version one preferences survive migration while new limits and defaults are validated',()=>{
  const stored={settings:{theme:'light',transport:'epoxy',remember:true,blockedDomains:['track.example']},bookmarks:[{url:'https://example.com/',title:'kept'}],tabs:[{url:'https://example.com/'}]};
  const result=readWorkspace({getItem:()=>JSON.stringify(stored)});
  assert.equal(result.settings.theme,'light');assert.equal(result.settings.transport,'epoxy');assert.equal(result.settings.frameBudget,6);assert.equal(result.tabs[0].workspace,'general');assert.equal(result.bookmarks.length,1);
  const settings=cleanSettings({transport:'unknown',frameBudget:999,transportTimeout:1,wispFallbacks:['one','two','three'],allowedSites:['track.example','invalid/path']});
  assert.equal(settings.transport,'auto');assert.equal(settings.frameBudget,6);assert.equal(settings.transportTimeout,20);assert.equal(settings.wispFallbacks.length,2);assert.deepEqual(settings.allowedSites,['track.example']);
});
test('frame admission protects visible, pinned, loading and playing tabs when the budget changes',()=>{
  const live=Array.from({length:7},(_,i)=>({id:String(i),frame:{},lastActive:i,pinned:i===2,loading:i===3,media:i===4}));
  const options={active:'0',secondary:'1',budget:7,playing:tab=>tab.media};
  assert.deepEqual(frameAdmission({},live,options).victims.map(tab=>tab.id),['5']);
  const blocked=frameAdmission({},live,{...options,budget:4});assert.equal(blocked.allowed,false);assert.deepEqual(blocked.victims,[]);
  for(const tab of live)tab.pinned=tab.loading=tab.media=false;
  assert.deepEqual(frameAdmission({},live,{...options,budget:5}).victims.map(tab=>tab.id),['2','3','4']);
  assert.equal(frameAdmission(live[0],live,{...options,budget:2}).allowed,true);
});
