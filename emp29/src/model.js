// SPDX-License-Identifier: AGPL-3.0-only
import { t } from './i18n.js';
export const VERSION = '2.1.0';
export const KEY = 'emp29.workspace.v1';
export const MAX_TABS = 24;
export const DEFAULTS = Object.freeze({
  language: 'fa', theme: 'dark', accent: 'mint', transport: 'auto', transportTimeout: 20, wisp: '', wispFallbacks: [],
  engine: 'google', remember: true, recordHistory: true, cache: true,
  reducedMotion: false, suspendMinutes: 10, blockTrackers: false,
  blockedDomains: [], allowedSites: [], frameBudget: 6, zoom: 100,
});
export const ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
};
export const SHORTCUTS = [
  { title: 'YouTube', url: 'https://www.youtube.com/', icon: 'play', color: '#fb6c72', label: t('ویدئو و موسیقی') },
  { title: 'Google', url: 'https://www.google.com/', icon: 'search', color: '#84b9fa', label: t('جست‌وجو در وب') },
  { title: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'sparkles', color: '#92dec4', label: t('همراه هوشمند') },
  { title: 'GitHub', url: 'https://github.com/', icon: 'code', color: '#c1a1f7', label: t('دنیای توسعه') },
  { title: 'Instagram', url: 'https://www.instagram.com/', icon: 'camera', color: '#f0a2ce', label: t('لحظه‌ها و ارتباط') },
  { title: 'Reddit', url: 'https://www.reddit.com/', icon: 'message', color: '#f7b87e', label: t('گفت‌وگو و ایده') },
];
export function safeUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error(t('نشانی معتبر نیست.'));
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(t('فقط نشانی‌های HTTP و HTTPS بدون نام کاربری و رمز پذیرفته می‌شوند.'));
  }
  return url.href;
}
export function resolveAddress(value, engine = 'google') {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(t('نشانی یا عبارت جست‌وجو را بنویس.'));
  if (text.length > 4096 || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(t('ورودی معتبر نیست.'));
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[\w.-]+:\d+(?:\/|$)/.test(text)) return safeUrl(text);
  if (!/\s/.test(text) && (/^(?:[\w\p{L}-]+\.)+[\p{L}a-z]{2,}(?::\d+)?(?:[/?#]|$)/iu.test(text) ||
    /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[\da-f:]+\])(?::\d+)?(?:[/?#]|$)/i.test(text))) {
    return safeUrl(`https://${text}`);
  }
  return ENGINES[engine in ENGINES ? engine : 'google'] + encodeURIComponent(text);
}
export function normalizeWisp(value, origin) {
  const source = String(value ?? '').trim();
  const base = new URL(origin);
  const url = source ? new URL(source) : new URL('/wisp/', base);
  if (!source) url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
    throw new Error(t('نشانی اتصال باید ws:// یا wss:// باشد و پارامتر نداشته باشد.'));
  }
  if (base.protocol === 'https:' && url.protocol !== 'wss:') throw new Error(t('روی HTTPS، اتصال باید WSS باشد.'));
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}
export function displayHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return t('تب جدید'); }
}
export function cleanSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const out = { ...DEFAULTS };
  for (const k of ['remember', 'recordHistory', 'cache', 'reducedMotion', 'blockTrackers']) {
    if (typeof value[k] === 'boolean') out[k] = value[k];
  }
  for (const [k, allowed] of Object.entries({ language: ['fa', 'en'], theme: ['dark', 'light', 'system'], accent: ['mint', 'blue', 'violet'], transport: ['auto', 'libcurl', 'epoxy'], engine: Object.keys(ENGINES) })) {
    if (allowed.includes(value[k])) out[k] = value[k];
  }
  if (typeof value.wisp === 'string' && value.wisp.length < 2048) out.wisp = value.wisp;
  const fallbacks=typeof value.wispFallbacks==='string'?value.wispFallbacks.split('\n'):Array.isArray(value.wispFallbacks)?value.wispFallbacks:[];
  out.wispFallbacks=[...new Set(fallbacks.filter(item=>typeof item==='string'&&item.trim()&&item.length<2048).map(item=>item.trim()))].slice(0,2);
  if ([0, 5, 10, 20].includes(Number(value.suspendMinutes))) out.suspendMinutes = Number(value.suspendMinutes);
  if ([75, 90, 100, 110, 125, 150].includes(Number(value.zoom))) out.zoom = Number(value.zoom);
  out.blockedDomains = cleanDomains(value.blockedDomains);
  out.allowedSites = cleanDomains(value.allowedSites);
  if ([10,20,45].includes(Number(value.transportTimeout))) out.transportTimeout = Number(value.transportTimeout);
  if ([2,4,6,10].includes(Number(value.frameBudget))) out.frameBudget = Number(value.frameBudget);
  return out;
}
export function cleanDomains(value) {
  const rows = typeof value === 'string' ? value.split(/[\n,]+/) : Array.isArray(value) ? value : [];
  return [...new Set(rows.filter(x => typeof x === 'string').map(x => x.trim().toLowerCase().replace(/^\*\./, '')).filter(x => /^(?:[a-z\d-]+\.)+[a-z]{2,}$/.test(x)))].slice(0, 200);
}
export function matchesDomain(host, domains) {
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}
export function validateBackup(input) {
  if (!input || typeof input !== 'object' || input.format !== 'emp29' || input.schema !== 1) throw new Error(t('این فایل، پشتیبان معتبر EMP29 نیست.'));
  if (!Array.isArray(input.bookmarks) || input.bookmarks.length > 500) throw new Error(t('تعداد نشانک‌ها معتبر نیست.'));
  const bookmarks = input.bookmarks.map(item => ({
    id: String(item.id ?? '').slice(0, 100), title: String(item.title ?? '').slice(0, 120),
    url: safeUrl(item.url), created: Number.isFinite(item.created) ? item.created : Date.now(),
  }));
  return { settings: cleanSettings(input.settings), bookmarks };
}
export function readWorkspace(storage) {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '{}');
    const settings = cleanSettings(raw.settings);
    return {
      settings,
      bookmarks: validateBackup({ format: 'emp29', schema: 1, bookmarks: raw.bookmarks ?? [] }).bookmarks,
      history: (Array.isArray(raw.history) ? raw.history : []).slice(0, 300).flatMap(item => {
        try { return [{ url: safeUrl(item.url), title: String(item.title ?? '').slice(0, 120), time: Number(item.time) || 0 }]; } catch { return []; }
      }),
      tabs: settings.remember && Array.isArray(raw.tabs) ? raw.tabs.slice(0, MAX_TABS).flatMap(item => {
        try { return [{ url: item.url ? safeUrl(item.url) : '', title: String(item.title ?? '').slice(0, 120), pinned: !!item.pinned, workspace: typeof item.workspace === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item.workspace) ? item.workspace : 'general' }]; } catch { return []; }
      }) : [],
    };
  } catch { return { settings: { ...DEFAULTS }, bookmarks: [], history: [], tabs: [] }; }
}
export function timeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
