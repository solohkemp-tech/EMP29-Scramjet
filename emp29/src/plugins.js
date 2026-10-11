// SPDX-License-Identifier: AGPL-3.0-only
import { matchesDomain } from './model.js';
export const CACHE = 'emp29-static-v1';
const TRACKERS = ['doubleclick.net', 'google-analytics.com', 'googletagmanager.com', 'facebook.net', 'scorecardresearch.com', 'hotjar.com', 'clarity.ms'];
const MAX_BYTES = 2 * 1024 * 1024, MAX_ENTRIES = 120;
export async function readBounded(stream, limit = MAX_BYTES) {
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { reader.cancel().catch(() => {}); throw new Error('Cache entry too large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    return bytes;
  } finally { reader.releaseLock(); }
}
function assetRequest(ctx) {
  return ctx.request.method === 'GET' && ['script', 'style', 'image', 'font'].includes(ctx.parsed.destination) && !['no-store', 'reload'].includes(ctx.request.cache) && !ctx.request.initialHeaders.get('authorization') && !ctx.request.initialHeaders.get('range');
}
export function makePlugins({ tab, settings, onUrl, onTitle, onError, onRequest, onNewTab }) {
  const { ManagedPlugin } = globalThis.$scramjetController;
  const { BareResponse, ScramjetHeaders } = globalThis.$scramjet;
  class WorkspacePlugin extends ManagedPlugin {
    constructor() { super('emp29-workspace', []); this.startTimes = new WeakMap(); this.responses = new WeakSet(); }
    install(frame) {
      super.install(frame);
      this.tap(frame.hooks.init.post, ctx => {
        if (!ctx.isTopLevel) return;
        const document = ctx.window.document;
        const title = () => onTitle(document.title);
        title();
        // Observe the title element instead of every mutation in complex/video pages.
        let observer;
        const observe = () => {
          observer?.disconnect(); const node = document.querySelector('title');
          if (node) { observer = new ctx.window.MutationObserver(title); observer.observe(node, { subtree: true, childList: true, characterData: true }); }
          title();
        };
        observe(); document.addEventListener('DOMContentLoaded', observe, { once: true });
        ctx.window.addEventListener('pagehide', () => observer?.disconnect(), { once: true });
        document.addEventListener('click', event => {
          const link = event.target?.closest?.('a[href]');
          if (link && (link.target === '_blank' || event.ctrlKey || event.metaKey) && !event.defaultPrevented && !link.hasAttribute('download')) {
            if (/^https?:/.test(link.href)) { event.preventDefault(); onNewTab(link.href); }
          }
        });
      });
      this.tap(frame.hooks.error.request, ctx => {
        const request = ctx.rawrequest;
        const top = request?.rawUrl && new URL(request.rawUrl).pathname === frame.prefix + encodeURIComponent(tab.url);
        onError(ctx.error, !!top);
      });
      this.tap(frame.hooks.fetch.intercept, (ctx, props) => {
        if (['document'].includes(ctx.parsed.destination)) {
          onNewTab(ctx.parsed.url.href);
          props.response = { status: 200, statusText: 'OK', body: '<!doctype html><title>EMP29</title><p>This page opened in EMP29.</p>', headers: ScramjetHeaders.fromRawHeaders([['Content-Type', 'text/html; charset=utf-8']]) };
          return;
        }
        const domains = [...settings.blockedDomains, ...(settings.blockTrackers ? TRACKERS : [])];
        let siteAllowed = false; try { siteAllowed = matchesDomain(new URL(tab.url).hostname, settings.allowedSites || []); } catch {}
        if (!siteAllowed && !['document', 'iframe'].includes(ctx.parsed.destination) && matchesDomain(ctx.parsed.url.hostname, domains)) {
          props.response = { status: 204, statusText: 'No Content', body: '', headers: ScramjetHeaders.fromRawHeaders([]) };
          onRequest({ host: ctx.parsed.url.hostname, status: 'blocked', ms: 0, tab: tab.id });
        }
      });
      this.tap(frame.hooks.fetch.request, async (ctx, props) => {
        this.startTimes.set(ctx.request, performance.now());
        if (!settings.cache || !assetRequest(ctx) || props.earlyResponse) return;
        try {
          const cache = await caches.open(CACHE);
          const found = await cache.match(new Request(ctx.parsed.url.href, { headers: ctx.request.initialHeaders.toRawHeaders() }));
          if (!found) return;
          const expires = Number(found.headers.get('x-emp29-expires'));
          if (expires <= Date.now() || ctx.request.cache === 'no-cache') return;
          const headers = new Headers(found.headers); headers.delete('x-emp29-expires');
          props.earlyResponse = BareResponse.fromNativeResponse(new Response(await found.arrayBuffer(), { status: found.status, statusText: found.statusText, headers }));
          this.responses.add(ctx.request);
        } catch { /* A quota/Cache API error must not break navigation. */ }
      });
      this.tap(frame.hooks.fetch.preresponse, async (ctx, props) => {
        if (!settings.cache || !assetRequest(ctx) || this.responses.has(ctx.request) || props.response.status !== 200) return;
        const headers = new Headers(props.response.rawHeaders);
        const policy = headers.get('cache-control') ?? '';
        const length = Number(headers.get('content-length'));
        const seconds = /(?:^|,)\s*max-age=(\d+)/i.exec(policy)?.[1];
        // Cache only explicitly public, small static assets. Never buffer video,
        // unknown-length streams, authenticated responses, or HTML/API responses.
        if (!/(?:^|,)\s*public(?:,|$)/i.test(policy) || /no-store|no-cache|private/i.test(policy) || !seconds || !length || length > MAX_BYTES || headers.has('set-cookie') || headers.get('vary') === '*' || /video|audio/i.test(headers.get('content-type') ?? '')) return;
        try {
          const clone = props.response.clone();
          // Read only the bounded clone in the background. The original response
          // streams straight to the page, without awaiting a cache write.
          void (async () => {
            const bytes = await readBounded(clone.body);
            const cache = await caches.open(CACHE);
            headers.set('x-emp29-expires', String(Date.now() + Math.min(Number(seconds), 86400) * 1000));
            await cache.put(new Request(ctx.parsed.url.href, { headers: ctx.request.initialHeaders.toRawHeaders() }), new Response(bytes, { headers }));
            const keys = await cache.keys(); for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
          })().catch(() => {});
        } catch { /* Preserve the response on cache failures. */ }
      });
      this.tap(frame.hooks.fetch.response, (ctx, props) => {
        onRequest({ host: ctx.parsed.url.hostname, status: props.response.status, ms: Math.round(performance.now() - (this.startTimes.get(ctx.request) ?? performance.now())), cached: this.responses.has(ctx.request), tab: tab.id });
      });
    }
  }
  return [new globalThis.$scramjetUtils.UrlWatcherPlugin(onUrl), new WorkspacePlugin()];
}
