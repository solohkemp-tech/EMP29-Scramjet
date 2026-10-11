import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { checkWisp } from '../src/connection.js';
import { createApp, configuration } from '../server.mjs';
function socketFixture(data){
  let closed=0;
  class Socket{constructor(){queueMicrotask(()=>this.onmessage?.({data}));}close(){closed++;}}
  return {environment:{WebSocket:Socket},closed:()=>closed};
}
test('a valid Wisp CONTINUE handshake succeeds and closes the probe',async()=>{
  const packet=new Uint8Array(9);packet[0]=3;new DataView(packet.buffer).setUint32(5,128,true);
  const fixture=socketFixture(packet.buffer),result=await checkWisp('wss://example.com/wisp/',fixture);
  assert.equal(result.protocol,'wisp-v1');assert.equal(result.buffer,128);assert.equal(fixture.closed(),1);
});
test('an arbitrary WebSocket message is not treated as a Wisp server',async()=>{
  for(const data of ['welcome',new Uint8Array([3,0,0]).buffer,new Uint8Array([3,1,0,0,0,1,0,0,0]).buffer]){
    const fixture=socketFixture(data);await assert.rejects(checkWisp('wss://example.com/wisp/',fixture),/Wisp/);assert.equal(fixture.closed(),1);
  }
});
test('timeouts and aborts close pending connection probes',async()=>{
  let closed=0;class Socket{close(){closed++;}}
  const environment={WebSocket:Socket};
  await assert.rejects(checkWisp('wss://example.com/',{environment,timeoutMs:10}),/مهلت/);
  const controller=new AbortController(),pending=checkWisp('wss://example.com/',{environment,signal:controller.signal});controller.abort();await assert.rejects(pending,/لغو/);assert.equal(closed,2);
});
test('the production Wisp endpoint passes the same protocol probe used by the app',async t=>{
  const app=await createApp(configuration({HOST:'127.0.0.1',PORT:'0'}));app.listen(0,'127.0.0.1');await once(app,'listening');
  t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
  const origin=`http://127.0.0.1:${app.address().port}`;
  class BrowserSocket extends WebSocket{constructor(url){super(url,{headers:{Origin:origin}});}}
  const result=await checkWisp(origin.replace('http','ws')+'/wisp/',{environment:{WebSocket:BrowserSocket},timeoutMs:2500});assert.equal(result.protocol,'wisp-v1');assert.ok(result.buffer>0);
});
