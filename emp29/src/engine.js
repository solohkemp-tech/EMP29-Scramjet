// SPDX-License-Identifier: AGPL-3.0-only
import { msg, t } from './i18n.js';
import { normalizeWisp, timeout } from './model.js';
import { checkWisp } from './connection.js';
export class ProxyEngine {
  constructor({ runtime, settings, onPhase = () => {}, environment = globalThis }) {
    this.runtime = runtime; this.settings = settings; this.onPhase = onPhase; this.env = environment;
    this.controller = null; this.starting = null; this.scripts = new Map(); this.phase = 'idle';
    this.transport = null; this.selectedTransport = null; this.attempts = []; this.switching = null;
    this.selectedWisp = null; this.connectionChecks = [];
  }
  status(phase, detail) { this.phase = phase; this.onPhase(phase, detail); }
  loadScript(path) {
    if (this.scripts.has(path)) return this.scripts.get(path);
    const job = new Promise((resolve, reject) => {
      const script = this.env.document.createElement('script'); script.src = path;
      const timer=setTimeout(()=>{script.onload=script.onerror=null;script.remove();reject(new Error(t('دریافت موتور بیش از حد طول کشید.')));},30_000);
      script.onload = () => {clearTimeout(timer);resolve();}; script.onerror = () => { clearTimeout(timer);script.remove(); reject(new Error(t('دریافت فایل موتور ناموفق بود. اتصال یا نصب سرور را بررسی کن.'))); };
      this.env.document.head.append(script);
    });
    this.scripts.set(path, job); job.catch(() => this.scripts.delete(path));
    return job;
  }
  async worker() {
    const nav = this.env.navigator;
    if (!this.env.isSecureContext || !nav.serviceWorker) throw new Error(t('این مرورگر به HTTPS نیاز دارد. روی کامپیوتر شخصی از localhost استفاده کن.'));
    const reg = await nav.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await reg.update();
    // Wait for the registered worker to activate AND actually control this page.
    // serviceWorker.ready alone may refer to an older worker from a prior install.
    await timeout(new Promise((resolve, reject) => {
      const check = () => {
        if (reg.active?.state === 'activated' && reg.active === nav.serviceWorker.controller && !reg.installing && !reg.waiting) { done(); resolve(); }
      };
      const done = () => { clearInterval(poll); clearTimeout(deadline); nav.serviceWorker.removeEventListener('controllerchange', check); };
      const poll = setInterval(check, 100);
      const deadline = setTimeout(() => { done(); reject(new Error(t('فعال‌سازی سرویس مرورگر کامل نشد. از تعمیر اتصال استفاده کن.'))); }, 14_000);
      nav.serviceWorker.addEventListener('controllerchange', check); check();
    }), 15_000, t('فعال‌سازی سرویس مرورگر طول کشید.'));
    return nav.serviceWorker.controller;
  }
  async start() {
    if (this.controller) return this.controller;
    if (this.starting) return this.starting;
    this.starting = this.initialize();
    try { return await this.starting; } catch (error) { this.status('error', error.message); throw error; }
    finally { this.starting = null; }
  }
  async initialize() {
    this.status('worker', t('آماده‌سازی سرویس مرورگر'));
    const sw = await this.worker();
    const endpoints=[...new Set([this.settings.wisp||'',...(this.settings.wispFallbacks||[])].map(value=>normalizeWisp(value,this.env.location.origin)))];
    let wisp;
    for(const endpoint of endpoints){
      try{
        this.status('connection',t('بررسی مسیر Wisp'));
        const info=this.env.WebSocket?await checkWisp(endpoint,{environment:this.env}):null;
        this.connectionChecks.push({host:new URL(endpoint).host,ok:true,rtt:info?.rtt??null});this.connectionChecks=this.connectionChecks.slice(-6);wisp=endpoint;break;
      }catch(error){this.connectionChecks.push({host:new URL(endpoint).host,ok:false});this.connectionChecks=this.connectionChecks.slice(-6);if(endpoint===endpoints.at(-1))throw error;}
    }
    this.connectionChecks=this.connectionChecks.slice(-6);this.selectedWisp=wisp;
    this.status('engine', t('دریافت موتور وب'));
    await this.loadScript(this.runtime.scramjet);
    await this.loadScript(this.runtime.controller);
    await this.loadScript(this.runtime.utils);
    const names = this.settings.transport === 'auto' ? this.autoOrder(wisp) : [this.settings.transport];
    let transport, failure;
    for (const name of names) {
      try { transport = await this.prepareTransport(name, wisp); break; }
      catch (error) { failure = error; }
    }
    if (!transport) throw failure || new Error(t('هیچ موتور اتصال آماده نشد.'));
    const controller = new this.env.$scramjetController.Controller({
      serviceworker: sw, transport,
      config: { prefix: '/~/sj/', scramjetPath: this.runtime.scramjet, injectPath: this.runtime.inject, wasmPath: this.runtime.wasm },
      scramjetConfig: { flags: { rewriterLogs: false, captureErrors: false, debugTrampolines: false, debugSourceURL: false, sourcemaps: false } },
    });
    await timeout(controller.wait(), 30_000, t('آماده‌سازی موتور وب کامل نشد.'));
    this.controller = controller; this.status('ready', t('موتور آماده است')); return controller;
  }
  autoOrder(wisp) {
    try {
      const saved = JSON.parse(this.env.sessionStorage?.getItem('emp29.transport.health') || '{}');
      if (saved.wisp === wisp && saved.name === 'epoxy' && Date.now() - saved.time < 30 * 60_000) return ['epoxy', 'libcurl'];
    } catch { /* Storage availability never determines connectivity. */ }
    return ['libcurl', 'epoxy'];
  }
  async prepareTransport(name, wisp = this.selectedWisp || normalizeWisp(this.settings.wisp, this.env.location.origin)) {
    if (!['libcurl', 'epoxy'].includes(name)) throw new Error(t('موتور اتصال انتخابی معتبر نیست.'));
    const start = Date.now();
    this.status('transport', msg`آماده‌سازی ${name === 'libcurl' ? 'Libcurl' : 'Epoxy'} و WASM`);
    let transport;
    try {
      await this.loadScript(this.runtime[name]);
      const Ctor = name === 'epoxy' ? this.env.EpoxyTransport?.EpoxyClient : this.env.LibcurlTransport?.LibcurlClient;
      if (!Ctor) throw new Error(t('فایل موتور انتقال کامل بارگذاری نشد.'));
      transport = new Ctor({ wisp, ...(name === 'epoxy' ? { udp_extension_required: false } : {}) });
      const seconds = [10, 20, 45].includes(this.settings.transportTimeout) ? this.settings.transportTimeout : 45;
      // Startup fallback cannot replay any site request: no Controller exists yet.
      await timeout(transport.init(), seconds * 1000, t('آماده‌سازی WASM بیش از حد طول کشید.'));
      if (!transport.ready) throw new Error(t('WASM هنوز آماده نیست. تعمیر اتصال را اجرا کن.'));
      this.transport = transport; this.selectedTransport = name;
      this.attempts.unshift({ transport: name, ok: true, elapsed: Date.now() - start });
      this.attempts.length = Math.min(this.attempts.length, 8);
      try { this.env.sessionStorage?.setItem('emp29.transport.health', JSON.stringify({ name, wisp, time: Date.now() })); } catch {}
      return transport;
    } catch (error) {
      this.attempts.unshift({ transport: name, ok: false, elapsed: Date.now() - start });
      this.attempts.length = Math.min(this.attempts.length, 8);
      throw error;
    }
  }
  async switchTransport(name) {
    if (this.switching) return this.switching;
    this.switching = (async () => {
      const controller = await this.start();
      const previous = this.selectedTransport, old = this.transport;
      const target = name || (previous === 'epoxy' ? 'libcurl' : 'epoxy');
      try {
        const next = await this.prepareTransport(target);
        controller.setTransport(next);
        this.status('ready', msg`${target === 'epoxy' ? 'Epoxy' : 'Libcurl'} آماده است`);
        return target;
      } catch (error) {
        this.selectedTransport = previous; this.transport = old;
        this.status('ready', t('موتور قبلی همچنان در دسترس است'));
        throw error;
      }
    })();
    try { return await this.switching; } finally { this.switching = null; }
  }
  snapshot() {
    return { phase: this.phase, mode: this.settings.transport, selected: this.selectedTransport, ready: !!this.transport?.ready, endpoint:this.selectedWisp?new URL(this.selectedWisp).host:null, checks:this.connectionChecks.map(item=>({...item})), attempts: this.attempts.map(item => ({ ...item })) };
  }
  detach(frame) {
    if (!frame || !this.controller) return;
    const index = this.controller.frames.indexOf(frame); if (index >= 0) this.controller.frames.splice(index, 1);
    frame.element.remove();
  }
}
export async function repairRuntime(environment = globalThis) {
  const registrations = await environment.navigator.serviceWorker?.getRegistrations() ?? [];
  for (const reg of registrations) {
    const script = reg.active?.scriptURL ?? reg.waiting?.scriptURL ?? reg.installing?.scriptURL;
    if (script && new URL(script).origin === environment.location.origin && new URL(script).pathname === '/sw.js') await reg.unregister();
  }
  if (environment.caches) for (const name of await environment.caches.keys()) if (/^(emp29-|scramjet-)/.test(name)) await environment.caches.delete(name);
}
