// SPDX-License-Identifier: AGPL-3.0-only
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { join } from 'node:path';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import { hashPassword, verifyPassword, parseCookie, Sessions, RateLimit } from './lib/auth.mjs';
import { serveStatic } from './lib/static.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export function publicAddress(address) { try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; } }
export function configuration(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  const passwordHash = env.EMP29_PASSWORD_HASH || (env.EMP29_PASSWORD ? hashPassword(env.EMP29_PASSWORD) : '');
  if (passwordHash && !/^scrypt:[a-f\d]{32}:[a-f\d]{128}$/.test(passwordHash)) throw new Error('EMP29_PASSWORD_HASH is invalid. Run npm run setup.');
  if (!passwordHash && !['127.0.0.1', 'localhost', '::1'].includes(host) && env.EMP29_PUBLIC !== 'true') throw new Error('A public listen address requires a password. Run npm run setup, or explicitly set EMP29_PUBLIC=true.');
  const port = Number(env.PORT || 3030);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be between 0 and 65535.');
  const origin = env.EMP29_ORIGIN ? new URL(env.EMP29_ORIGIN).origin : '';
  if (origin && !/^https?:/.test(origin)) throw new Error('EMP29_ORIGIN must be HTTP(S).');
  return { host, port, passwordHash, origin, trustProxy: env.TRUST_PROXY === 'true', maxConnections: Math.max(1, Math.min(100, Number(env.EMP29_MAX_CONNECTIONS) || 20)) };
}
export async function createApp(config = configuration(), options = {}) {
  const dist = options.dist || join(root, 'dist');
  const manifest = JSON.parse(await readFile(join(dist, 'build.json'), 'utf8'));
  const sessions = new Sessions(), loginLimit = new RateLimit(8, 60_000), upgradeLimit = new RateLimit(60, 60_000);
  const activeSockets = new Set();
  const counters = { requests: 0, upgrades: 0, denied: 0 };
  let loginBusy = 0;
  logging.set_level(logging.WARN);
  Object.assign(wisp.options, {
    allow_private_ips: false, allow_loopback_ips: false, allow_direct_ip: false,
    allow_udp_streams: false, port_whitelist: [80, 443], stream_limit_total: 128,
    stream_limit_per_host: -1, dns_result_order: 'ipv4first', dns_ttl: 120_000,
    parse_real_ip: config.trustProxy, parse_real_ip_from: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
    dns_method: async hostname => {
      const addresses = await lookup(hostname, { all: true, order: 'ipv4first' });
      const selected = addresses.find(item => publicAddress(item.address));
      if (!selected) throw new Error('Destination has no public address');
      return selected.address;
    },
  });
  const started = Date.now();
  const secure = req => req.socket.encrypted || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const ip = req => config.trustProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim() : req.socket.remoteAddress;
  const authorized = req => !config.passwordHash || sessions.valid(parseCookie(req.headers));
  const sameOrigin = req => {
    try {
      if (!req.headers.origin) return false;
      const value = new URL(req.headers.origin).origin;
      return value === (config.origin || `${secure(req) ? 'https' : 'http'}://${req.headers.host}`);
    } catch { return false; }
  };
  const json = (res, status, value, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(value)); };
  const cookie = (req, token, age) => `emp29_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure(req) ? '; Secure' : ''}`;
  const body = async req => {
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > 4096) throw new Error('Body too large'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const app = http.createServer({ maxHeaderSize: 16_384, requestTimeout: 30_000, headersTimeout: 15_000, keepAliveTimeout: 65_000 }, async (req, res) => {
    counters.requests++;
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    let path; try { path = new URL(req.url, 'http://localhost').pathname; } catch { json(res, 400, { error: 'Invalid URL' }); return; }
    if(path==='/'||path==='/index.html')res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
    if(secure(req))res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      if (path === '/healthz' && req.method === 'GET') { json(res, 200, { ok: true, version: manifest.version }); return; }
      if (path === '/api/session' && req.method === 'GET') { json(res, 200, { authenticated: authorized(req), required: !!config.passwordHash }); return; }
      if (path === '/api/login' && req.method === 'POST') {
        if (!sameOrigin(req)) { json(res, 403, { error: 'درخواست ورود معتبر نیست.' }); return; }
        if (!loginLimit.take(ip(req))) { json(res, 429, { error: 'کمی بعد دوباره تلاش کن.' }, { 'Retry-After': '60' }); return; }
        const data = await body(req);
        if(loginBusy>=4){json(res,429,{error:'سرور ورود مشغول است؛ کمی بعد دوباره تلاش کن.'},{'Retry-After':'2'});return;}
        loginBusy++;
        let accepted;
        try{accepted=!config.passwordHash||await (options.verifyPassword||verifyPassword)(data.password,config.passwordHash);}finally{loginBusy--;}
        if (!accepted) { json(res, 401, { error: 'رمز ورود صحیح نیست.' }); return; }
        json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, sessions.create(), 43_200) }); return;
      }
      if (path.startsWith('/api/')) {
        if (!authorized(req)) { json(res, 401, { error: 'ورود دوباره لازم است.' }); return; }
        if (path === '/api/logout' && req.method === 'POST') {
          if (!sameOrigin(req)) { json(res, 403, { error: 'Invalid origin' }); return; }
          const token = parseCookie(req.headers); sessions.delete(token);
          for (const socket of activeSockets) if (socket.emp29Token === token) socket.destroy();
          json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) }); return;
        }
        if (path === '/api/config' && req.method === 'GET') { json(res, 200, { brand: 'EMP29', telegram: 'https://t.me/emp29', version: manifest.version, engine: manifest.engine, runtime: manifest.runtime, wispPath: '/wisp/', source: '/source.zip', auth: !!config.passwordHash }); return; }
        if (path === '/api/status' && req.method === 'GET') { json(res, 200, { ok: true, uptime: Math.floor((Date.now() - started) / 1000), version: manifest.version, engine: manifest.engine, activeConnections: activeSockets.size, memoryMB: Math.round(process.memoryUsage().rss / 1048576), ...counters }); return; }
        json(res, 404, { error: 'Not found' }); return;
      }
      if (path.startsWith('/wisp/')) { json(res, 426, { error: 'WebSocket required' }); return; }
      if (path.startsWith('/~/sj/')) { res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>EMP29</title><body style="font-family:sans-serif;padding:40px">اتصال مرورگر از دست رفته است. صفحه اصلی EMP29 را دوباره باز کن.<p lang="en" dir="ltr">The browser connection was lost. Reopen the EMP29 home page.</p><p><a href="/">بازگشت به EMP29 / Return to EMP29</a></p></body></html>'); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' }); return; }
      if (!authorized(req) && (path.startsWith('/vendor/') || path === '/sw.js' || path === '/build.json' || path === '/source.zip')) { json(res, 401, { error: 'Authentication required' }); return; }
      // There is no SPA fallback: engine/WASM requests must never receive index.html.
      await serveStatic(req, res, dist, path);
    } catch (error) {
      if (!res.headersSent) json(res, 400, { error: path === '/api/login' ? 'درخواست ورود معتبر نیست.' : 'Request failed' });
      else res.destroy(error);
    }
  });
  const reject = (socket, code) => { counters.denied++; socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\n\r\n`); };
  app.on('upgrade', (req, socket, head) => {
    let path; try { path = new URL(req.url, 'http://localhost').pathname; } catch { reject(socket, 400); return; }
    if (!path.startsWith('/wisp/')) { reject(socket, 404); return; }
    if (!authorized(req)) { reject(socket, 401); return; }
    if (!sameOrigin(req)) { reject(socket, 403); return; }
    if (activeSockets.size >= config.maxConnections || !upgradeLimit.take(ip(req))) { reject(socket, 429); return; }
    socket.emp29Token = parseCookie(req.headers);
    socket.emp29Expires = config.passwordHash ? sessions.tokens.get(socket.emp29Token) : Infinity;
    activeSockets.add(socket); socket.once('close', () => activeSockets.delete(socket));
    counters.upgrades++;
    try { wisp.routeRequest(req, socket, head); } catch { socket.destroy(); }
  });
  const cleanup = setInterval(() => {
    sessions.prune();
    for (const socket of activeSockets) if (socket.emp29Expires <= Date.now()) socket.destroy();
  }, 60_000).unref();
  app.on('close', () => { clearInterval(cleanup); for (const socket of activeSockets) socket.destroy(); });
  app.emp29Version=manifest.version;
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configuration();
    const app = await createApp(config);
    app.listen(config.port, config.host, () => console.log(JSON.stringify({ event: 'emp29_ready', version: app.emp29Version, address: `http://${config.host}:${app.address().port}`, protected: !!config.passwordHash, time: new Date().toISOString() })));
    const stop = () => { app.close(); setTimeout(() => process.exit(0), 3000).unref(); };
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
    app.on('error', error => { console.error(error.message); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
