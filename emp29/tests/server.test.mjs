import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { configuration, createApp, publicAddress } from '../server.mjs';
import { hashPassword, RateLimit, verifyPassword, Sessions } from '../lib/auth.mjs';
async function fixture(t,auth=false,options={}) {
  const config=configuration({PORT:'0',HOST:'127.0.0.1',...(auth?{EMP29_PASSWORD:'sample-test-password'}:{})});
  const app=await createApp(config,options);app.listen(0,'127.0.0.1');await once(app,'listening');
  const origin=`http://127.0.0.1:${app.address().port}`;
  t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
  return {app,origin,get:(path,opts={})=>fetch(origin+path,opts)};
}
async function wsResult(url,headers={}) {
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(url,{headers});const timer=setTimeout(()=>{socket.terminate();reject(new Error('WebSocket timed out'));},2500);
    socket.once('unexpected-response',(request,response)=>{clearTimeout(timer);response.resume();request.abort();resolve(response.statusCode);});
    socket.once('message',()=>{clearTimeout(timer);socket.close();resolve(101);});
    socket.once('error',error=>{clearTimeout(timer);reject(error);});
  });
}
test('password hashes and opaque expiring sessions reject wrong credentials',async()=>{
  const hash=hashPassword('correct');assert.equal(await verifyPassword('correct',hash),true);assert.equal(await verifyPassword('wrong',hash),false);
  assert.equal(await verifyPassword('correct','broken'),false);const sessions=new Sessions(1);const token=sessions.create();assert.equal(token.length,64);assert.equal(sessions.valid('not-token'),false);
  sessions.tokens.set(token,0);assert.equal(sessions.valid(token),false);
  const rate=new RateLimit(2,60000);assert.equal(rate.take('x'),true);assert.equal(rate.take('x'),true);assert.equal(rate.take('x'),false);
});
test('public listen requires an explicit access decision and destination filtering includes IPv6',()=>{
  assert.throws(()=>configuration({HOST:'0.0.0.0'}),/password/);
  assert.equal(configuration({HOST:'0.0.0.0',EMP29_PUBLIC:'true'}).host,'0.0.0.0');
  for(const address of ['127.0.0.1','10.0.0.2','169.254.169.254','192.168.1.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','224.0.0.1'])assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('1.1.1.1'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('protected configuration, engine assets, and Wisp require the login cookie',async t=>{
  const {origin,get}=await fixture(t,true);
  assert.equal((await get('/api/config')).status,401);assert.equal((await get('/sw.js')).status,401);
  assert.equal(await wsResult(origin.replace('http','ws')+'/wisp/',{Origin:origin}),401);
  const wrong=await get('/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'wrong'})});assert.equal(wrong.status,401);
  const login=await get('/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password:'sample-test-password'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
  const response=await get('/api/config',{headers:{Cookie:cookie}});const config=await response.json();assert.equal(config.brand,'EMP29');assert.equal(config.telegram,'https://t.me/emp29');
  assert.equal(await wsResult(origin.replace('http','ws')+'/wisp/',{Origin:origin,Cookie:cookie}),101);
  assert.equal(await wsResult(origin.replace('http','ws')+'/wisp/',{Origin:'https://foreign.example',Cookie:cookie}),403);
  const out=await get('/api/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie}});assert.equal(out.status,200);assert.equal((await get('/api/config',{headers:{Cookie:cookie}})).status,401);
});
test('foreign-origin login and burst attempts are rejected',async t=>{
  const {get,origin}=await fixture(t,true);
  assert.equal((await get('/api/login',{method:'POST',headers:{Origin:'https://foreign.example'},body:'{}'})).status,403);
  for(let i=0;i<8;i++)assert.equal((await get('/api/login',{method:'POST',headers:{Origin:origin},body:'{"password":"wrong"}'})).status,401);
  assert.equal((await get('/api/login',{method:'POST',headers:{Origin:origin},body:'{}'})).status,429);
});
test('static delivery supports typed WASM, ranges, validators, and compression without SPA fallback',async t=>{
  const {get}=await fixture(t);const config=await(await get('/api/config')).json();
  const page=await get('/');assert.equal(page.status,200);assert.match(await page.text(),/lang="fa" dir="rtl"/);
  assert.match(page.headers.get('content-security-policy'),/object-src 'none'/);assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
  const file=await get(config.runtime.wasm,{headers:{'Accept-Encoding':'identity'}});assert.equal(file.headers.get('content-type'),'application/wasm');assert.match(file.headers.get('cache-control'),/immutable/);
  const bytes=new Uint8Array(await file.arrayBuffer());assert.deepEqual([...bytes.slice(0,4)],[0,97,115,109]);assert.equal(WebAssembly.validate(bytes),true);
  const short=await get(config.runtime.wasm,{headers:{Range:'bytes=0-3','Accept-Encoding':'identity'}});assert.equal(short.status,206);assert.equal((await short.arrayBuffer()).byteLength,4);
  assert.equal((await get(config.runtime.wasm,{headers:{Range:'bytes=999999999-'}})).status,416);
  assert.equal((await get(config.runtime.wasm,{headers:{'If-None-Match':file.headers.get('etag')}})).status,304);
  const zipped=await get(config.runtime.scramjet,{headers:{'Accept-Encoding':'gzip'}});assert.equal(zipped.headers.get('content-encoding'),'gzip');assert.ok((await zipped.text()).length>1000);
  assert.equal((await get('/vendor/not-found/scramjet.wasm')).status,404);
  assert.equal((await get('/sw.js')).headers.get('cache-control'),'no-store');
  assert.equal((await get('/%2e%2e%2fserver.mjs')).status,403);assert.equal((await get('/.env')).status,403);
  assert.equal((await get('/api/config',{method:'POST'})).status,404);
  assert.equal((await get('/healthz')).status,200);
});

test('concurrent password verification is bounded and releases capacity after completion',async t=>{
  let calls=0,release;const gate=new Promise(resolve=>release=resolve);
  const {get,origin}=await fixture(t,true,{verifyPassword:async()=>{calls++;await gate;return false;}});
  const attempt=()=>get('/api/login',{method:'POST',headers:{Origin:origin},body:'{"password":"wrong"}'});
  const pending=Array.from({length:4},attempt);
  for(let i=0;i<100&&calls<4;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(calls,4);const busy=await attempt();assert.equal(busy.status,429);assert.equal(busy.headers.get('retry-after'),'2');assert.equal(calls,4);
  release();assert.deepEqual((await Promise.all(pending)).map(response=>response.status),[401,401,401,401]);
  assert.equal((await attempt()).status,401);assert.equal(calls,5);
});
