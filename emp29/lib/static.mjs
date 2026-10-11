// SPDX-License-Identifier: AGPL-3.0-only
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
export const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.zip': 'application/zip' };
export async function serveStatic(req, res, root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400); res.end(); return; }
  if (decoded.includes('\0') || decoded.split('/').some(p => p.startsWith('.') || p === '..') || decoded.includes('\\')) { res.writeHead(403); res.end(); return; }
  const file = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return; }
  let info; try { info = await stat(file); } catch { res.writeHead(404); res.end('Not found'); return; }
  if (!info.isFile()) { res.writeHead(404); res.end(); return; }
  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const immutable = /^\/(assets|vendor)\//.test(pathname);
  const headers = { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store', 'ETag': etag, 'Accept-Ranges': 'bytes' };
  if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/';
  if (pathname === '/source.zip') headers['Content-Disposition'] = 'attachment; filename="EMP29_Source.zip"';
  if (req.headers['if-none-match'] === etag && immutable) { res.writeHead(304, headers); res.end(); return; }
  let chosen = file, range;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
    const start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
    const end = match[1] ? (match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1) : info.size - 1;
    if (start > end || start >= info.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
    range = { start, end }; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`; headers['Content-Length'] = end - start + 1;
  } else {
    const accepted = req.headers['accept-encoding'] ?? '';
    for (const [encoding, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
      if (!new RegExp(`(?:^|,)\\s*${encoding}(?:\\s*;\\s*q=(?!0(?:\\.0*)?(?:\\s*,|$))[\\d.]+)?\\s*(?:,|$)`).test(accepted)) continue;
      try { const packed = await stat(file + suffix); chosen = file + suffix; headers['Content-Encoding'] = encoding; headers['Content-Length'] = packed.size; break; } catch {}
    }
    headers['Content-Length'] ??= info.size; headers['Vary'] = 'Accept-Encoding';
  }
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  try { await pipeline(createReadStream(chosen, range), res); } catch (error) { if (!res.destroyed) res.destroy(error); }
}
