// SPDX-License-Identifier: AGPL-3.0-only
import { t } from './i18n.js';
// This measures a Wisp handshake, not download or video bandwidth.
export function checkWisp(url,{environment=globalThis,timeoutMs=5000,signal}={}) {
  return new Promise((resolve,reject)=>{
    let socket,settled=false;
    const now=()=>environment.performance?.now?.()??Date.now(),start=now();
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(socket){socket.onmessage=socket.onerror=socket.onclose=null;try{socket.close();}catch{}}
      error?reject(error):resolve(value);
    };
    const abort=()=>finish(new Error(t('بررسی اتصال لغو شد.')));
    const timer=setTimeout(()=>finish(new Error(t('سرور اتصال در مهلت تعیین‌شده پاسخ نداد.'))),timeoutMs);
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    try {
      socket=new environment.WebSocket(url);socket.binaryType='arraybuffer';
      socket.onmessage=event=>{
        try {
          const bytes=event.data instanceof ArrayBuffer?new Uint8Array(event.data):ArrayBuffer.isView(event.data)?new Uint8Array(event.data.buffer,event.data.byteOffset,event.data.byteLength):null;
          // Wisp v1 begins with a CONTINUE packet for stream zero.
          if(!bytes||bytes.length<9||bytes[0]!==3||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(1,true)!==0)throw new Error(t('پاسخ سرور با پروتکل Wisp سازگار نیست.'));
          finish(null,{rtt:Math.round(now()-start),protocol:'wisp-v1',buffer:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(5,true)});
        }catch(error){finish(error);}
      };
      socket.onerror=()=>finish(new Error(t('اتصال WebSocket برقرار نشد؛ ورود، HTTPS و reverse proxy را بررسی کن.')));
      socket.onclose=()=>finish(new Error(t('سرور اتصال پیش از آماده‌شدن بسته شد.')));
    }catch(error){finish(error);}
  });
}
