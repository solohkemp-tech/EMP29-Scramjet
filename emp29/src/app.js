// SPDX-License-Identifier: AGPL-3.0-only
import { ht, msg, t, bindStaticUI, getLanguage, setLanguage, locale, number, preserveDrafts } from './i18n.js';
import { DEFAULTS, KEY, MAX_TABS, SHORTCUTS, VERSION, cleanSettings, displayHost, normalizeWisp, readWorkspace, resolveAddress, safeUrl, timeout, validateBackup } from './model.js';
import { ProxyEngine, repairRuntime } from './engine.js';
import { CACHE, makePlugins } from './plugins.js';
import { icon, esc, decorate } from './icons.js';
import { installPro } from './pro-features.js';
import { cleanPro } from './pro-model.js';
import { checkWisp } from './connection.js';
const $ = id => document.getElementById(id);
let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw new Error('Storage unavailable');}};}
const stored = readWorkspace(storage);
setLanguage(stored.settings.language);
const translateStatic = bindStaticUI(document);
translateStatic();
let pro;
const state = { ...stored, tabs: [], active: null, closed: [], config: null, engine: null, server: null, rtt: null, logs: [], storageError: false, panel: '', initialized: false };
let saveTimer, toastTimer, installPrompt;
decorate();
const engineNames = { google: 'Google', duckduckgo: 'DuckDuckGo', bing: 'Bing', brave: 'Brave' };
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4300); }
function persistNow() {
  try {
    storage.setItem(KEY, JSON.stringify({ settings: state.settings, bookmarks: state.bookmarks, history: state.history, tabs: state.settings.remember ? state.tabs.map(({url,title,pinned,workspace}) => ({url,title,pinned,workspace})) : [] }));
  } catch { if (!state.storageError) { state.storageError = true; toast(t('ذخیره محلی در این مرورگر در دسترس نیست؛ تغییرات فقط در این جلسه می‌مانند.')); } }
}
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 250); }
function applyAppearance() {
  if (getLanguage() !== state.settings.language) changeLanguage(state.settings.language, false);
  const theme = state.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : state.settings.theme;
  document.documentElement.dataset.theme = theme; document.documentElement.dataset.accent = state.settings.accent;
  document.documentElement.dataset.motion = state.settings.reducedMotion ? 'reduce' : 'normal';
  document.querySelector('meta[name=theme-color]').content = theme === 'dark' ? '#0c1114' : '#f4f7f5';
  $('search-engine-name').textContent = engineNames[state.settings.engine];
  for (const node of document.querySelectorAll('[data-profile]')) node.classList.toggle('active', node.dataset.profile === currentProfile());
  for (const tab of state.tabs) if (tab.element) setZoom(tab);
}
function changeLanguage(language, announce = true) {
  state.settings.language = language === 'en' ? 'en' : 'fa';
  setLanguage(state.settings.language);translateStatic();
  for (const id of ['language-switch','login-language']) $(id).value = getLanguage();
  $('engine-pill').dir = getLanguage() === 'en' ? 'ltr' : 'rtl';
  document.querySelector('link[rel=manifest]').href = getLanguage() === 'en' ? '/manifest-en.webmanifest' : '/manifest.webmanifest';
  clock();renderHome();renderTabs();renderActive();pro?.relocalize();
  if (state.panel && $('panel').open) preserveDrafts($('panel-body'), () => {
    $('panel-title').textContent = panelName(state.panel);
    $('panel-body').innerHTML = {bookmarks:bookmarksPanel,history:historyPanel,settings:settingsPanel,diagnostics:diagnosticsPanel}[state.panel]();
  });
  if ($('panel-search')) $('saved-list').innerHTML = listRows(state[state.panel], state.panel, $('panel-search').value);
  if ($('commands').open) renderCommands();
  if (!$('server-banner').hidden) {
    const copy = $('server-banner').querySelector('span') || $('server-banner');
    copy.textContent = t(copy.textContent);
    const retry = $('server-banner').querySelector('[data-action=retry-server]');
    if (retry) retry.textContent = t('بررسی دوباره');
  }
  for (const id of ['login-error','settings-error','confirm-title','confirm-message','confirm-accept']) if ($(id)) $(id).textContent = t($(id).textContent);
  updatePhase(state.engine?.phase || 'idle', phaseMessage());
  $('server-latency').textContent = state.rtt === null ? t('وضعیت اتصال') : msg`${number(state.rtt)} ms · سرور`;
  if (state.panel === 'diagnostics') refreshDiagnostics();
  if (announce) {persistNow();toast(t('زبان تغییر کرد.'));}
}
function panelName(kind) { return {bookmarks:t('نشانک‌های تو'),history:t('مسیرهای اخیر'),settings:t('به سبک خودت'),diagnostics:t('وضعیت اتصال')}[kind]; }
function phaseMessage() {
  return {idle:t('آماده برای شروع'),worker:t('آماده‌سازی سرویس مرورگر'),connection:t('بررسی مسیر Wisp'),engine:t('دریافت موتور وب'),transport:msg`آماده‌سازی ${state.engine?.selectedTransport || 'WASM'} و WASM`,ready:t('موتور آماده است'),error:t('نیاز به بررسی')}[state.engine?.phase || 'idle'];
}
function currentProfile() { return state.settings.suspendMinutes === 0 && !state.settings.cache ? 'video' : state.settings.suspendMinutes === 5 && state.settings.reducedMotion && state.settings.cache ? 'lean' : state.settings.suspendMinutes === 10 && state.settings.cache && !state.settings.reducedMotion ? 'balanced' : 'custom'; }
function profile(name) {
  Object.assign(state.settings, name === 'video' ? { suspendMinutes: 0, cache: false } : name === 'lean' ? { suspendMinutes: 5, cache: true, reducedMotion: true } : { suspendMinutes: 10, cache: true, reducedMotion: false });
  applyAppearance(); save(); toast(name === 'video' ? t('حالت ویدئو: خواب زمان‌بندی‌شده خاموش و کش محتوا غیرفعال است.') : name === 'lean' ? t('حالت کم‌مصرف: حرکت کمتر و خواب تب‌های غیرفعال پس از ۵ دقیقه.') : t('حالت متوازن فعال شد.'));
}
function clock() {
  $('home-date').textContent = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date());
}
function renderHome() {
  $('shortcuts').innerHTML = SHORTCUTS.map((item, index) => `<button class="shortcut-card" data-shortcut="${index}"><span class="shortcut-symbol" style="--tile:${item.color}">${icon(item.icon)}</span><strong dir="ltr">${item.title}</strong><small>${t(item.label)}</small></button>`).join('');
  $('recent-list').innerHTML = state.history.length ? state.history.slice(0, 3).map((item, index) => `<button class="recent-row" data-recent="${index}">${icon('globe')}<strong>${esc(item.title || displayHost(item.url))}</strong><time>${esc(displayHost(item.url))}</time></button>`).join('') : ht`<div class="empty-recent">${icon('clock')}<div><p>مسیر تازه از همین‌جا شروع می‌شود.</p><small>آخرین سایت‌های بازشده اینجا دیده می‌شوند.</small></div></div>`;
}
function activeTab() { return state.tabs.find(tab => tab.id === state.active); }
function renderTabs() {
  pro?.refresh();
  $('tabs').innerHTML = state.tabs.filter(tab=>!pro||tab.workspace===pro.currentWorkspace).map(tab => ht`<div class="tab-shell ${tab.id === state.active ? 'active' : ''} ${tab.suspended ? 'sleeping' : ''}"><button class="tab-select" role="tab" id="tab-${tab.id}" tabindex="${tab.id === state.active?0:-1}" aria-selected="${tab.id === state.active}" aria-controls="workspace" data-tab="${tab.id}">${tab.loading ? '<span class="spinner"></span>' : icon(tab.suspended ? 'moon' : tab.url ? 'globe' : 'home')}<span class="tab-title" dir="auto">${esc(tab.title || displayHost(tab.url))}</span>${tab.pinned ? icon('pin','tab-pin') : ''}</button><button class="tab-close" data-close-tab="${tab.id}" aria-label="بستن ${esc(tab.title || t('تب'))}">${icon('x')}</button></div>`).join('');
  $('tabs').querySelector(`[data-tab="${state.active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function newTab(url = '', title = '', pinned = false, activate = true, workspace = pro?.currentWorkspace || 'general') {
  if (state.tabs.length >= MAX_TABS) { toast(msg`حداکثر ${MAX_TABS} تب باز می‌ماند؛ یک تب را ببند.`); return null; }
  if (url) url = safeUrl(url);
  workspace=pro?.workspaceFor(workspace)||workspace;
  const tab = { id: crypto.randomUUID(), workspace, stats:{requests:0,blocked:0,cached:0,errors:0}, pane:null, url, title, pinned, suspended: !!url, loading: false, error: '', lastActive: Date.now(), epoch: 0, element: null, frame: null, timer: null };
  state.tabs.push(tab); if (activate) activateTab(tab.id); else renderTabs(); save(); return tab;
}
function activateTab(id) {
  const tab = state.tabs.find(item => item.id === id); if (!tab) return;
  const previous = activeTab(); if (previous && previous.id !== id) previous.lastActive = Date.now();
  state.active = id; tab.lastActive = Date.now(); pro?.selectForTab(tab);
  for (const item of state.tabs) if (item.element) item.element.hidden = item.id !== id;
  renderTabs(); renderActive();
  if (tab.url && !tab.frame && !tab.loading && !tab.error && state.initialized) loadTab(tab);
}
function renderActive() {
  const tab = activeTab(); if (!tab) return;
  $('address').value = tab.url; $('home').hidden = !!tab.url; $('frames').hidden = !tab.url;
  $('page-state').hidden = true; $('progress').classList.toggle('active', tab.loading);
  $('bookmark-btn').classList.toggle('bookmarked', state.bookmarks.some(item => item.url === tab.url));
  $('bookmark-btn').disabled = !tab.url;
  for (const action of ['back','forward','reload']) document.querySelector(`[data-action="${action}"]`).disabled = !tab.frame;
  $('current-host').textContent = tab.url ? displayHost(tab.url) : 'EMP29 / PERSONAL WEB';
  document.title = tab.url ? `${tab.title || displayHost(tab.url)} · EMP29` : t('EMP29 · مرورگر وب شخصی');
  pro?.layout();
  if (tab.error) showState(tab, 'error');
  else if (tab.loading && !tab.element) showState(tab, 'loading');
  else if (tab.suspended && !tab.loading) showState(tab, 'sleep');
}
function showState(tab, type) {
  if (tab.id !== state.active) return;
  const content = type === 'error' ? { name: t('این مسیر باز نشد'), text: t(tab.error), icon: 'alert', actions: ht`<button class="primary-btn" data-action="retry-page">دوباره تلاش کن</button><button class="secondary-btn" data-panel="diagnostics">عیب‌یابی اتصال</button>` } : type === 'sleep' ? { name: t('تب در حال استراحت است'), text: t('برای مصرف کمتر منابع، این تب موقتاً آزاد شده است.'), icon: 'moon', actions: ht('<button class="primary-btn" data-action="retry-page">بیدار کردن تب</button>') } : { name: t('در حال باز کردن مسیر…'), text: state.engine?.phase === 'ready' ? displayHost(tab.url) : t('موتور اتصال برای اولین بار آماده می‌شود.'), icon: 'globe', actions: ht('<button class="secondary-btn" data-action="cancel-page">بازگشت به خانه</button>') };
  $('page-state').innerHTML = `<div class="state-icon ${type === 'error' ? 'error' : ''}">${type === 'loading' ? '<span class="spinner"></span>' : icon(content.icon)}</div><h2>${content.name}</h2><p>${esc(content.text)}</p><div class="state-actions">${content.actions}</div>${type === 'loading' ? ht('<small>فایل‌های موتور در همان سرور نگهداری می‌شوند.</small>') : ''}`;
  $('page-state').hidden = false;
}
function updatePhase(phase, detail) {
  const loading = ['worker','connection','engine','transport'].includes(phase);
  $('engine-pill').dataset.status = loading ? 'loading' : phase;
  $('engine-label').textContent = phase === 'ready' ? t('موتور آماده') : phase === 'error' ? t('نیاز به بررسی') : detail;
  $('bottom-state').innerHTML = `<span class="status-dot"></span> ${esc(detail)}`;
  const tab = activeTab(); if (tab?.loading && !tab.element) showState(tab, 'loading');
}
function setZoom(tab) { const ratio = state.settings.zoom / 100; tab.element.style.transform = `scale(${ratio})`; tab.element.style.width = `${100 / ratio}%`; tab.element.style.height = `${100 / ratio}%`; }
function record(tab) {
  if (!state.settings.recordHistory || !tab.url) return;
  const top = state.history[0];
  if (top?.url === tab.url) { top.title = tab.title; top.time = Date.now(); }
  else { state.history = [{ url: tab.url, title: tab.title, time: Date.now() }, ...state.history.filter(item => item.url !== tab.url)].slice(0, 300); }
  renderHome(); save();
}
function log(item) { const tab=state.tabs.find(tab=>tab.id===item.tab);if(tab){if(item.status==='blocked')tab.stats.blocked++;else if(item.status==='error')tab.stats.errors++;else tab.stats.requests++;if(item.cached)tab.stats.cached++;pro?.refresh();}state.logs.unshift({ ...item, time: Date.now() }); state.logs.length = Math.min(state.logs.length, 120); }
function friendlyError(error) {
  const text = String(error?.message ?? error ?? '');
  if (/wasm|WebAssembly/i.test(text)) return t('موتور WASM آماده نشد. از تعمیر اتصال یا موتور Epoxy در تنظیمات استفاده کن.');
  if (/DNS|resolve|HostUnreachable|HostNotFound/i.test(text)) return t('سرور نتوانست نشانی سایت را پیدا کند. DNS و دسترسی اینترنت سرور را بررسی کن.');
  if (/SSL|TLS|certificate/i.test(text)) return t('اتصال امن به سایت کامل نشد. ساعت سرور و مسیر اتصال را بررسی کن.');
  if (/401|403|Authentication/i.test(text)) return t('اتصال اجازه دسترسی ندارد؛ ورود یا پیکربندی سرور را بررسی کن.');
  if (/WebSocket|network|connect|Failed to fetch|wisp|fetch failed/i.test(text)) return t('ارتباط با سرور یا سایت مقصد قطع شد. وضعیت اتصال را بررسی و دوباره تلاش کن.');
  return text.length > 220 ? t('بارگذاری سایت ناموفق بود. وضعیت اتصال را بررسی کن.') : text || t('بارگذاری سایت ناموفق بود.');
}
async function loadTab(tab) {
  if (!state.engine) { tab.error = t('ارتباط با سرور برقرار نیست؛ اتصال را دوباره بررسی کن.'); renderActive(); return; }
  if(pro&&!pro.admitFrame(tab)){failTab(tab,t('بودجه تب‌های زنده پر است؛ یک تب را ببند یا از تنظیمات سقف تب زنده را بیشتر کن.'));return;}
  const epoch = ++tab.epoch;
  tab.loading = true; tab.error = ''; tab.suspended = false; renderTabs(); renderActive();
  try {
    const controller = await state.engine.start();
    if (tab.epoch !== epoch || !state.tabs.includes(tab)) return;
    if (!tab.frame) {
      // Recheck after the shared startup promise: concurrent tabs cannot all
      // reserve the same free slot before the engine becomes ready.
      if(pro&&!pro.admitFrame(tab)){failTab(tab,t('بودجه تب‌های زنده پر است؛ یک تب را ببند یا از تنظیمات سقف تب زنده را بیشتر کن.'));return;}
      const element = document.createElement('iframe'); element.className = 'proxy-frame'; element.title = tab.title || displayHost(tab.url);
      element.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write'; element.referrerPolicy = 'no-referrer'; element.hidden = tab.id !== state.active;
      tab.element = element;const pane=document.createElement('section');pane.className='frame-pane';pane.setAttribute('aria-label',element.title);tab.pane=pane;pane.append(element);
      const plugins = makePlugins({ tab, settings: state.settings,
        onUrl: url => { if (!state.tabs.includes(tab)) return; try { tab.url = safeUrl(url); if (tab.id === state.active) { $('address').value = tab.url; $('current-host').textContent = displayHost(tab.url); } record(tab); save(); } catch {} },
        onTitle: title => { if (!state.tabs.includes(tab)) return; tab.title = String(title || displayHost(tab.url)).slice(0, 120); element.title = tab.title; renderTabs(); record(tab); if (tab.id === state.active) document.title = `${tab.title} · EMP29`; },
        onError: (error, isDocument) => { log({ host: displayHost(tab.url), status: 'error', ms: 0, tab: tab.id }); if (isDocument && tab.loading) failTab(tab, friendlyError(error)); },
        onRequest: log,
        onNewTab: url => { try { newTab(safeUrl(url)); } catch {} },
      });
      tab.frame = controller.createFrame(element, { plugins });
      element.addEventListener('load', () => {
        if (!state.tabs.includes(tab) || !tab.element) return;
        try {
          if (!element.contentWindow.location.pathname.startsWith(tab.frame.prefix)) return;
          const body = element.contentDocument?.body?.textContent?.trim();
          if (body?.startsWith('Internal Service Worker Error:')) { failTab(tab, friendlyError(body)); return; }
        } catch {}
        tab.loading = false; clearTimeout(tab.timer); renderTabs(); if (tab.id === state.active) { renderActive(); $('engine-label').textContent = t('موتور آماده'); } record(tab);
      });
      $('frames').append(tab.pane); setZoom(tab);pro?.layout();
    }
    tab.frame.go(tab.url);
    clearTimeout(tab.timer);
    tab.timer = setTimeout(() => { if (tab.loading) { toast(t('بارگذاری این سایت طول کشیده؛ می‌توانی اتصال را بررسی کنی یا منتظر بمانی.')); $('engine-label').textContent = t('در حال بارگذاری…'); } }, 30_000);
    renderActive();
  } catch (error) { if (tab.epoch === epoch && state.tabs.includes(tab)) failTab(tab, friendlyError(error)); }
}
function failTab(tab, message) { tab.loading = false; tab.error = message; clearTimeout(tab.timer); renderTabs(); if (tab.id === state.active) renderActive(); }
function release(tab) { tab.pane?.remove();tab.pane=null;tab.epoch++; tab.loading = false; clearTimeout(tab.timer); state.engine?.detach(tab.frame); tab.frame = null; tab.element = null; }
function closeTab(id) {
  const tab = state.tabs.find(item => item.id === id); if (!tab) return;
  state.closed.unshift({ url: tab.url, title: tab.title, pinned: tab.pinned, workspace:tab.workspace }); state.closed.length = Math.min(10, state.closed.length);
  pro?.beforeClose(tab.id);const index = state.tabs.indexOf(tab); release(tab); state.tabs.splice(index,1);
  if (!state.tabs.length) newTab();
  else if (state.active === id) activateTab(state.tabs[Math.min(index,state.tabs.length-1)].id);
  else renderTabs(); save();
}
function reopen() { const tab = state.closed.shift(); if (tab) newTab(tab.url,tab.title,tab.pinned,true,tab.workspace); else toast(t('تب بسته‌شده‌ای در این جلسه وجود ندارد.')); }
async function navigate(value) {
  try {
    const url = resolveAddress(value,state.settings.engine); const tab = activeTab() ?? newTab();
    if (!tab) return; tab.url = url; tab.title = displayHost(url); tab.error = ''; tab.suspended = false;
    closePanel(); $('commands').close(); save(); await loadTab(tab);
  } catch (error) { toast(error.message); }
}
function home() { const tab = activeTab(); if (!tab) return; release(tab); tab.url = ''; tab.title = ''; tab.error = ''; tab.suspended = false; renderTabs(); renderActive(); renderHome(); save(); }
function bookmark() {
  const tab = activeTab(); if (!tab?.url) { openPanel('bookmarks'); return; }
  const index = state.bookmarks.findIndex(item => item.url === tab.url);
  if (index >= 0) { state.bookmarks.splice(index,1); toast(t('نشانک حذف شد.')); }
  else {
    if (state.bookmarks.length >= 500) { toast(t('تعداد نشانک‌ها به سقف ۵۰۰ رسیده است.')); return; }
    state.bookmarks.push({ id: crypto.randomUUID(), url: tab.url, title: tab.title || displayHost(tab.url), created: Date.now() }); toast(t('به نشانک‌ها اضافه شد.'));
  }
  renderActive(); save(); if (state.panel === 'bookmarks') openPanel('bookmarks');
}
function closePanel() { $('panel').close(); state.panel = ''; document.querySelectorAll('.rail-btn').forEach(node => node.classList.toggle('selected', node.dataset.action === 'home')); }
function openPanel(kind) {
  if (state.panel === kind && $('panel').open) { closePanel(); return; }
  $('commands').close();pro?.dialog.close(); state.panel = kind;
  $('panel-title').textContent = panelName(kind);
  const body = {bookmarks:bookmarksPanel,history:historyPanel,settings:settingsPanel,diagnostics:diagnosticsPanel}[kind];
  if (!body) return; $('panel-body').innerHTML = body();
  if (!$('panel').open) $('panel').showModal();
  document.querySelectorAll('.rail-btn').forEach(node => node.classList.toggle('selected',node.dataset.panel === kind));
  if (kind === 'diagnostics') refreshDiagnostics();
}
function listRows(items, type, filter = '') {
  const query = filter.trim().toLowerCase();
  const matching = items.map((item,index) => ({item,index})).filter(({item}) => `${item.title} ${item.url}`.toLowerCase().includes(query));
  return matching.length ? matching.map(({item,index}) => ht`<div class="list-item"><button class="list-open" data-open-${type}="${index}"><span class="list-initial">${esc(displayHost(item.url).slice(0,1).toUpperCase())}</span><span class="list-text"><strong>${esc(item.title || displayHost(item.url))}</strong><small>${esc(displayHost(item.url))}</small></span></button>${type === 'history' ? `<span class="list-meta">${new Intl.DateTimeFormat(locale(),{hour:'2-digit',minute:'2-digit'}).format(item.time)}</span>` : ''}<button class="icon-btn" data-remove-${type}="${index}" aria-label="حذف ${esc(item.title || t('مورد'))}">${icon('x')}</button></div>`).join('') : `<div class="empty-state">${icon(type === 'bookmarks' ? 'bookmark' : 'clock')}<p>${query ? t('موردی پیدا نشد.') : t('هنوز چیزی اینجا نیست.')}</p><small>${type === 'bookmarks' ? t('با ستاره کنار نشانی، سایت‌ها را ذخیره کن.') : t('سایت‌های بازشده در این بخش دیده می‌شوند.')}</small></div>`;
}
function bookmarksPanel() { return ht`<p class="panel-intro">مسیرهای مورد علاقه‌ات را همیشه نزدیک نگه دار.</p><input id="panel-search" dir="auto" class="panel-search" placeholder="جست‌وجو در نشانک‌ها…" aria-label="جست‌وجو در نشانک‌ها"><div id="saved-list" class="panel-list">${listRows(state.bookmarks,'bookmarks')}</div><form id="add-bookmark" class="add-bookmark"><h3>افزودن یک مسیر</h3><div class="field"><label for="bookmark-title">نام</label><input id="bookmark-title" dir="auto" placeholder="نام سایت" maxlength="120" required></div><div class="field"><label for="bookmark-url">نشانی</label><input id="bookmark-url" dir="ltr" placeholder="https://example.com" maxlength="4096" required></div><button class="primary-btn full-width">افزودن نشانک ${icon('plus')}</button></form><div class="button-row"><button class="secondary-btn" data-action="export">${icon('download')} پشتیبان</button><button class="secondary-btn" data-action="import">${icon('upload')} بازیابی</button></div>`; }
function historyPanel() { return ht`<p class="panel-intro">آخرین ۳۰۰ مسیر فقط در همین مرورگر نگهداری می‌شوند.</p><input id="panel-search" dir="auto" class="panel-search" placeholder="جست‌وجو در تاریخچه…" aria-label="جست‌وجو در تاریخچه"><div id="saved-list" class="panel-list">${listRows(state.history,'history')}</div><div class="button-row"><button class="danger-btn" data-action="clear-history">${icon('trash')} پاک‌کردن تاریخچه</button></div>`; }
function field(label, id, options, current) { return `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${id}">${Object.entries(options).map(([value,text]) => `<option value="${value}" ${String(current) === value ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`; }
function toggle(name,label,help) { return `<label class="toggle-row"><span class="toggle-copy"><strong>${label}</strong><small>${help}</small></span><span class="switch"><input type="checkbox" name="${name}" ${state.settings[name] ? 'checked' : ''} aria-label="${label}"><span class="switch-track"></span></span></label>`; }
function settingsPanel() {
  const s = state.settings;
  return ht`<form id="settings-form"><section class="panel-section"><h3>ظاهر و تجربه</h3>${field(t('زبان رابط'),'language',{fa:'فارسی',en:'English'},s.language)}${field(t('تم'),'theme',{dark:t('تیره'),light:t('روشن'),system:t('مطابق دستگاه')},s.theme)}${field(t('رنگ تأکید'),'accent',{mint:t('سبز روشن'),blue:t('آبی'),violet:t('بنفش')},s.accent)}${field(t('موتور جست‌وجو'),'engine',engineNames,s.engine)}${field(t('اندازه محتوای سایت'),'zoom',{75:t('۷۵٪'),90:t('۹۰٪'),100:t('۱۰۰٪'),110:t('۱۱۰٪'),125:t('۱۲۵٪'),150:t('۱۵۰٪')},s.zoom)}${toggle('reducedMotion',t('حرکت کمتر'),t('انیمیشن‌های محیط مرورگر کمتر می‌شوند.'))}</section><section class="panel-section"><h3>اتصال</h3>${field(t('موتور انتقال'),'transport',{auto:t('خودکار · پیشنهادشده'),libcurl:'Libcurl',epoxy:'Epoxy'},s.transport)}<div class="field"><label for="wisp">سرور اتصال سفارشی (اختیاری)</label><input id="wisp" name="wisp" dir="ltr" placeholder="خالی = سرور همین برنامه" value="${esc(s.wisp)}"><small>برای سرور دیگر، نشانی WSS با / پایانی وارد کن. تغییر موتور یا سرور اتصال، محیط را دوباره بارگذاری می‌کند.</small></div></section><section class="panel-section"><h3>منابع و مرور</h3><div class="field"><label for="wispFallbacks">مسیرهای Wisp پشتیبان (اختیاری)</label><textarea id="wispFallbacks" name="wispFallbacks" dir="ltr" rows="2" placeholder="wss://your-other-server.example/wisp/">${esc(s.wispFallbacks.join("\n"))}</textarea><small>حداکثر دو مسیر متعلق به خودت یا سرور مورد اعتماد؛ هر خط یک WSS. مسیرها به‌ترتیب و فقط پیش از اولین درخواست سایت بررسی می‌شوند.</small></div>${field(t('بودجه تب زنده'),'frameBudget',{2:t('۲ تب'),4:t('۴ تب'),6:t('۶ تب'),10:t('۱۰ تب')},s.frameBudget)}${field(t('مهلت آماده‌سازی هر موتور'),'transportTimeout',{10:t('۱۰ ثانیه'),20:t('۲۰ ثانیه'),45:t('۴۵ ثانیه')},s.transportTimeout)}${field(t('خواب تب غیرفعال'),'suspendMinutes',{0:t('خاموش · مناسب ویدئو'),5:t('پس از ۵ دقیقه'),10:t('پس از ۱۰ دقیقه'),20:t('پس از ۲۰ دقیقه')},s.suspendMinutes)}${toggle('cache',t('کش محدود فایل‌های عمومی'),t('تا ۱۲۰ فایل کوچک؛ ویدئو و محتوای حساب‌ها کش نمی‌شوند.'))}${toggle('remember',t('یادآوری تب‌ها'),t('نشانی تب‌ها هنگام بازگشت دیده می‌شود؛ تنها تب انتخاب‌شده بارگذاری می‌شود.'))}${toggle('recordHistory',t('ثبت تاریخچه'),t('برای توقف ذخیره مسیرهای جدید، خاموش کن.'))}</section><section class="panel-section"><h3>کنترل درخواست‌ها</h3>${toggle('blockTrackers',t('مسدودکردن چند دامنه ردیابی رایج'),t('ممکن است بخشی از بعضی سایت‌ها کار نکند. حفاظت کامل از ردیابی نیست.'))}<div class="field"><label for="blockedDomains">دامنه‌های مسدودشده</label><textarea id="blockedDomains" name="blockedDomains" dir="ltr" placeholder="analytics.example.com\nads.example.com">${esc(s.blockedDomains.join('\n'))}</textarea><small>هر دامنه در یک خط؛ درخواست‌های جانبی آن دامنه و زیردامنه‌ها مسدود می‌شوند.</small></div></section><p id="settings-error" class="form-error" role="alert"></p><button class="primary-btn full-width">ذخیره تنظیمات ${icon('check')}</button></form><section class="panel-section" style="margin-top:25px"><h3>نگهداری و پشتیبان</h3><div class="button-row"><button class="secondary-btn" data-action="export">${icon('download')} پشتیبان</button><button class="secondary-btn" data-action="import">${icon('upload')} بازیابی</button></div><div class="button-row"><button class="secondary-btn" data-action="clear-cache">پاک‌کردن کش</button><button class="secondary-btn" data-action="clear-cookies">پاک‌کردن کوکی‌ها</button></div><div class="button-row"><button class="secondary-btn" data-action="install">نصب میانبر برنامه</button><button class="danger-btn" data-action="reset-settings">بازنشانی تنظیمات</button></div></section><section class="panel-section"><h3>درباره EMP29</h3><p class="panel-intro">مرورگر شخصی با موتور Scramjet. پراکسی فقط برای سایت‌های بازشده در همین محیط عمل می‌کند.</p><div class="version-note">EMP29 ${VERSION}<br>Scramjet ${esc(state.config?.engine ?? '—')}<br><a href="/source.zip">Download source (AGPL-3.0)</a> · <a href="https://github.com/MercuryWorkshop/scramjet" target="_blank" rel="noopener noreferrer">Mercury Workshop</a><br><a href="https://t.me/emp29" target="_blank" rel="noopener noreferrer">@emp29</a></div>${state.config?.auth ? ht('<button class="danger-btn full-width" style="margin-top:20px" data-action="logout">خروج از حساب ')+icon('logout')+'</button>' : ''}</section>`;
}
function diagnosticsPanel() {
  const ready = state.engine?.phase === 'ready';
  return ht`<p class="panel-intro">وضعیت خود مرورگر و مسیر رسیدن به سرور را اینجا بررسی کن.</p><div class="diagnostic-grid"><div class="diag-card"><span>پاسخ سرور</span><strong id="diag-rtt">${state.rtt ?? '—'} <small>ms</small></strong><small>زمان رفت‌وبرگشت درخواست وضعیت</small></div><div class="diag-card"><span>درخواست‌های این جلسه</span><strong id="diag-requests">${number(state.logs.length)}</strong><small>آخرین ۱۲۰ درخواست نگهداری می‌شود</small></div></div><section class="panel-section"><h3>بررسی مرحله‌ها</h3><div class="check-row"><span>محیط امن مرورگر</span><span class="check-value ${isSecureContext ? '' : 'bad'}">${isSecureContext ? 'HTTPS / localhost' : t('HTTPS لازم است')}</span></div><div class="check-row"><span>سرویس مرورگر</span><span id="diag-sw" class="check-value">${navigator.serviceWorker?.controller ? t('فعال') : t('در انتظار اولین سایت')}</span></div><div class="check-row"><span>موتور وب / WASM</span><span class="check-value">${ready ? t('آماده') : state.engine?.phase === 'error' ? t('ناموفق') : t('در انتظار اولین سایت')}</span></div><div class="check-row"><span>مسیر WebSocket</span><span id="diag-ws" class="check-value">هنوز بررسی نشده</span></div><div class="check-row"><span>موتور انتقال انتخابی</span><span class="check-value" dir="ltr">${esc(state.engine?.selectedTransport||state.settings.transport)}</span></div><div class="button-row"><button class="primary-btn" data-action="probe">بررسی اتصال ${icon('activity')}</button><button class="secondary-btn" data-action="repair">تعمیر اتصال ${icon('refresh')}</button></div></section><section class="panel-section"><h3>خلاصه سرور</h3><div id="diag-server" class="install-note">در حال دریافت وضعیت…</div></section><section class="panel-section"><div class="section-heading"><h3 style="margin:0">رویدادهای اخیر</h3><button class="text-btn" data-action="export-diagnostics">دریافت گزارش</button></div><div id="diag-logs" class="log-list">${logRows()}</div></section><p class="panel-intro">زمان پاسخ سرور، سرعت دانلود سایت یا ویدئو را اندازه نمی‌گیرد. اطلاعات این بخش نشانی کامل صفحات یا رمز ورود را در گزارش قرار نمی‌دهد.</p>`;
}
function logRows() { return state.logs.length ? state.logs.slice(0,30).map(item => `<div class="log-row"><span>${esc(item.host)}</span><span class="${item.status === 'error' || item.status === 'blocked' ? 'log-bad' : item.cached ? 'log-cached' : ''}">${esc(item.cached ? 'cache' : item.status)}</span><span>${item.ms} ms</span></div>`).join('') : ht('<p class="panel-intro">پس از بازکردن سایت، رویدادها اینجا دیده می‌شوند.</p>'); }
async function api(path, options = {}) {
  const response = await fetch(path,{ ...options, cache:'no-store', credentials:'same-origin', signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) showLogin(); throw new Error(t(data.error) || t('ارتباط با سرور ناموفق بود.')); }
  return data;
}
async function refreshDiagnostics() {
  try {
    const time = performance.now(); state.server = await api('/api/status'); state.rtt = Math.round(performance.now()-time);
    $('server-latency').textContent = msg`${number(state.rtt)} ms · سرور`;
    if ($('diag-rtt')) $('diag-rtt').innerHTML = `${number(state.rtt)} <small>ms</small>`;
    if ($('diag-server')) $('diag-server').innerHTML = ht`زمان فعالیت: ${number(Math.floor(state.server.uptime/60))} دقیقه<br>اتصال‌های فعال: ${number(state.server.activeConnections)}<br>حافظه فرایند: ${number(state.server.memoryMB)} MB<br>موتور: <b dir="ltr">${esc(state.server.engine)}</b>`;
    if ($('diag-requests')) $('diag-requests').textContent = number(state.logs.length);
    if ($('diag-logs')) $('diag-logs').innerHTML = logRows();
    if ($('diag-sw')) $('diag-sw').textContent = navigator.serviceWorker?.controller ? t('فعال') : t('در انتظار اولین سایت');
  } catch (error) { if ($('diag-server')) $('diag-server').textContent = friendlyError(error); }
}
async function probe() {
  const label=$('diag-ws');if(label){label.textContent=t('در حال بررسی…');label.classList.remove('bad');}
  try{
    const url=state.engine?.selectedWisp||normalizeWisp(state.settings.wisp,location.origin);
    const result=await checkWisp(url);if(label)label.textContent=`Wisp · ${result.rtt} ms`;toast(t('مسیر WebSocket و پاسخ Wisp تأیید شدند.'));
  }catch(error){if(label){label.textContent=error.message;label.classList.add('bad');}toast(error.message);}
  refreshDiagnostics();
}
async function confirm(title,message,accept=t('ادامه')) {
  $('confirm-title').textContent = title; $('confirm-message').textContent = message; $('confirm-accept').textContent = accept;
  $('confirm').showModal();
  return new Promise(resolve => {
    const close = event => { $('confirm').removeEventListener('close',close); resolve($('confirm').returnValue === 'accept'); };
    $('confirm').returnValue = ''; $('confirm').addEventListener('close',close);
  });
}
function download(name,data) { const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
function backup() { download(`EMP29-backup-${new Date().toISOString().slice(0,10)}.json`, { format:'emp29',schema:1,version:VERSION,settings:state.settings,bookmarks:state.bookmarks,pro:pro?.snapshot() }); toast(t('پشتیبان تنظیمات، نشانک‌ها، فضاهای کاری و کتابخانه دریافت شد.')); }
async function importBackup(file) {
  if (!file) return; if (file.size > 15_000_000) { toast(t('فایل پشتیبان باید کمتر از ۱۵ مگابایت باشد.')); return; }
  try {
    const input=JSON.parse(await file.text());const data=validateBackup(input);const extra=input.pro?cleanPro(input.pro):null; normalizeWisp(data.settings.wisp,location.origin);data.settings.wispFallbacks.forEach(value=>normalizeWisp(value,location.origin));
    if (!(await confirm(t('بازیابی پشتیبان'),msg`${data.bookmarks.length} نشانک و تنظیمات این فایل، جایگزین موارد فعلی می‌شود.`,t('بازیابی')))) return;
    state.bookmarks = data.bookmarks; Object.assign(state.settings,data.settings);if(extra)pro.restore(extra); persistNow(); location.reload();
  } catch (error) { toast(error.message); }
}
const commandItems = () => [
  ...(pro?.commands()||[]),
  { title:t('بازکردن تب جدید'),icon:'plus',key:'Alt T',run:()=>newTab() },
  { title:t('جست‌وجو یا نوشتن نشانی'),icon:'search',key:'Alt L',run:()=>{ $('address').focus(); $('address').select(); } },
  { title:t('نشانک‌ها'),icon:'bookmark',key:'Alt D',run:()=>openPanel('bookmarks') },
  { title:t('تاریخچه'),icon:'clock',key:'Alt H',run:()=>openPanel('history') },
  { title:t('تنظیمات مرورگر'),icon:'settings',run:()=>openPanel('settings') },
  { title:t('وضعیت و عیب‌یابی اتصال'),icon:'activity',run:()=>openPanel('diagnostics') },
  { title:t('بازکردن آخرین تب بسته‌شده'),icon:'refresh',key:'Alt ⇧ T',run:reopen },
  { title:t('سنجاق / آزادکردن تب فعلی'),icon:'pin',run:()=>{ const tab=activeTab(); if(tab) { tab.pinned=!tab.pinned; renderTabs(); save(); toast(tab.pinned?t('این تب خودکار نمی‌خوابد.'):t('سنجاق تب برداشته شد.')); } } },
  { title:t('حالت تمرکز'),icon:'expand',run:()=>document.body.classList.toggle('focus-mode') },
  { title:t('دریافت پشتیبان'),icon:'download',run:backup },
  { title:t('تلگرام EMP29'),icon:'send',run:()=>window.open('https://t.me/emp29','_blank','noopener,noreferrer') },
  ...state.bookmarks.map(item=>({title:item.title || displayHost(item.url),icon:'bookmark',run:()=>navigate(item.url)})),
];
let visibleCommands=[];
function renderCommands() {
  const query = $('command-search').value.trim().toLowerCase(); visibleCommands=commandItems().filter(item=>item.title.toLowerCase().includes(query));
  $('command-list').innerHTML=visibleCommands.length ? visibleCommands.map((item,index)=>`<button class="command-item" data-command="${index}"><span>${icon(item.icon)}</span><span class="command-label">${esc(item.title)}</span>${item.key?`<kbd dir="ltr">${item.key}</kbd>`:''}</button>`).join('') : ht('<div class="empty-state"><p>فرمانی پیدا نشد.</p></div>');
}
function commands() { closePanel(); $('command-search').value=''; renderCommands(); $('commands').showModal(); $('command-search').focus(); }
function showLogin() { pro?.dialog.close();$('login').hidden=false; $('shell').inert=true; closePanel(); $('commands').close(); $('password').focus(); }
async function bootstrap() {
  try {
    const session=await api('/api/session'); if(!session.authenticated){showLogin();return;}
    state.config=await api('/api/config'); state.initialized=true;
    state.engine ??=new ProxyEngine({runtime:state.config.runtime,settings:state.settings,onPhase:updatePhase});
    $('server-banner').hidden=true;
    const tab=activeTab(); if(tab?.url && !tab.frame && !tab.loading) loadTab(tab);
    refreshDiagnostics();
  } catch(error) { $('server-banner').innerHTML=ht`<span>${esc(friendlyError(error))}</span><button data-action="retry-server">بررسی دوباره</button>`; $('server-banner').hidden=false; }
}
const actions={
  home, 'new-tab':()=>newTab(), back:()=>activeTab()?.frame?.back(), forward:()=>activeTab()?.frame?.forward(),
  reload:()=>{const tab=activeTab();if(tab?.url)loadTab(tab);},bookmark,commands,
  focus:()=>{document.body.classList.toggle('focus-mode');}, 'close-commands':()=>$('commands').close(),
  'retry-page':()=>{const tab=activeTab();if(tab){release(tab);loadTab(tab);}},'cancel-page':home,
  export:backup,import:()=>$('import-file').click(),probe,
  'retry-server':bootstrap,
  'clear-history':async()=>{if(await confirm(t('پاک‌کردن تاریخچه'),t('همه مسیرهای ذخیره‌شده در همین مرورگر حذف می‌شوند.'),t('پاک‌کردن'))){state.history=[];save();renderHome();$('panel-body').innerHTML=historyPanel();}},
  'clear-cache':async()=>{await caches.delete(CACHE);toast(t('کش فایل‌های عمومی پاک شد.'));},
  repair:async()=>{if(await confirm(t('تعمیر اتصال'),t('کش پراکسی و سرویس مرورگر دوباره ساخته می‌شوند. نشانک‌ها و تنظیمات نگه داشته می‌شوند.'),t('تعمیر'))){persistNow();await repairRuntime();location.reload();}},
  'clear-cookies':async()=>{
    if(!(await confirm(t('پاک‌کردن کوکی سایت‌ها'),t('کوکی‌های پراکسی پاک می‌شوند و ممکن است از حساب سایت‌های بازشده خارج شوی.'),t('پاک‌کردن'))))return;
    if(state.engine?.controller){const controller=state.engine.controller;controller.cookieJar.clear();await controller.persistCookies();await controller.propagateCookieSync([],{clear:true});}
    else await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase('__scramjet_controller');req.onsuccess=resolve;req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error(t('یک پنجره دیگر EMP29 باز است؛ آن را ببند و دوباره تلاش کن.')));});
    persistNow();location.reload();
  },
  'reset-settings':async()=>{if(await confirm(t('بازنشانی تنظیمات'),t('تنظیمات به حالت پیش‌فرض برمی‌گردند. نشانک‌ها و تاریخچه نگه داشته می‌شوند.'),t('بازنشانی'))){Object.assign(state.settings,DEFAULTS);persistNow();location.reload();}},
  install:async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;}else toast(t('در منوی مرورگر، «نصب برنامه» یا «افزودن به صفحه اصلی» را انتخاب کن؛ پشتیبانی به مرورگر بستگی دارد.'));},
  logout:async()=>{await api('/api/logout',{method:'POST'});location.reload();},
  'export-diagnostics':()=>download('EMP29-diagnostics.json',{version:VERSION,engine:state.config?.engine,secure:isSecureContext,serviceWorker:!!navigator.serviceWorker?.controller,phase:state.engine?.phase,transport:state.engine?.snapshot(),rtt:state.rtt,server:state.server,events:state.logs.map(({host,status,ms,cached,time})=>({host,status,ms,cached,time}))}),
};
document.addEventListener('click',async event=>{
  const target=event.target.closest('button,[data-panel]');if(!target)return;
  try{
    if(target.dataset.panel){openPanel(target.dataset.panel);return;}
    if(target.dataset.action){await actions[target.dataset.action]?.();return;}
    if(target.dataset.tab){activateTab(target.dataset.tab);return;}
    if(target.dataset.closeTab){closeTab(target.dataset.closeTab);return;}
    if(target.dataset.shortcut!==undefined){navigate(SHORTCUTS[Number(target.dataset.shortcut)].url);return;}
    if(target.dataset.recent!==undefined){navigate(state.history[Number(target.dataset.recent)].url);return;}
    if(target.dataset.profile){profile(target.dataset.profile);return;}
    if(target.dataset.command!==undefined){$('commands').close();visibleCommands[Number(target.dataset.command)]?.run();return;}
    for(const type of ['bookmarks','history']){
      const open=target.getAttribute(`data-open-${type}`),remove=target.getAttribute(`data-remove-${type}`);
      if(open!==null){navigate(state[type][Number(open)].url);return;}
      if(remove!==null){state[type].splice(Number(remove),1);save();$('saved-list').innerHTML=listRows(state[type],type,$('panel-search').value);renderHome();renderActive();return;}
    }
  }catch(error){toast(friendlyError(error));}
});
$('address-form').addEventListener('submit',event=>{event.preventDefault();navigate($('address').value);});
for (const id of ['language-switch','login-language']) $(id).addEventListener('change', event => changeLanguage(event.target.value));
$('home-search').addEventListener('submit',event=>{event.preventDefault();navigate($('home-address').value);});
$('panel-body').addEventListener('input',event=>{if(event.target.id==='panel-search')$('saved-list').innerHTML=listRows(state[state.panel],state.panel,event.target.value);});
$('panel-body').addEventListener('submit',event=>{
  event.preventDefault();
  if(event.target.id==='settings-form'){
    const values=Object.fromEntries(new FormData(event.target));for(const k of ['remember','recordHistory','cache','reducedMotion','blockTrackers'])values[k]=event.target.elements[k].checked;
    try{
      normalizeWisp(values.wisp,location.origin);const fallbackValues=cleanSettings(values).wispFallbacks;fallbackValues.forEach(value=>normalizeWisp(value,location.origin)); const settings=cleanSettings({...state.settings,...values});
      const restart=settings.transport!==state.settings.transport||settings.wisp!==state.settings.wisp||JSON.stringify(settings.wispFallbacks)!==JSON.stringify(state.settings.wispFallbacks);
      Object.assign(state.settings,settings);applyAppearance();persistNow();toast(t('تنظیمات ذخیره شد.'));if(restart)location.reload();
    }catch(error){$('settings-error').textContent=error.message;}
  }
  if(event.target.id==='add-bookmark'){
    try{if(state.bookmarks.length>=500)throw new Error(t('سقف تعداد نشانک‌ها ۵۰۰ است.'));const url=resolveAddress($('bookmark-url').value,state.settings.engine);if(state.bookmarks.some(item=>item.url===url))throw new Error(t('این نشانی قبلاً ذخیره شده است.'));state.bookmarks.push({id:crypto.randomUUID(),url,title:$('bookmark-title').value.trim().slice(0,120),created:Date.now()});save();$('panel-body').innerHTML=bookmarksPanel();renderActive();toast(t('نشانک اضافه شد.'));}catch(error){toast(error.message);}
  }
});
$('close-panel').addEventListener('click',closePanel);
$('panel').addEventListener('close',()=>{state.panel='';document.querySelectorAll('.rail-btn').forEach(node=>node.classList.toggle('selected',node.dataset.action==='home'));});
$('panel').addEventListener('click',event=>{if(event.target===$('panel')&&event.clientX>$('panel').getBoundingClientRect().right)closePanel();});
$('confirm-cancel').addEventListener('click',()=>$('confirm').close('cancel'));
$('confirm-accept').addEventListener('click',()=>$('confirm').close('accept'));
$('command-search').addEventListener('input',renderCommands);
$('command-search').addEventListener('keydown',event=>{if(event.key==='Enter'&&visibleCommands[0]){$('commands').close();visibleCommands[0].run();}if(event.key==='ArrowDown'){$('command-list').querySelector('button')?.focus();event.preventDefault();}});
$('command-list').addEventListener('keydown',event=>{const nodes=[...$('command-list').querySelectorAll('button')];const index=nodes.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();nodes[(index+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length]?.focus();}});
$('tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const visible=state.tabs.filter(tab=>!pro||tab.workspace===pro.currentWorkspace);const index=visible.findIndex(tab=>tab.id===state.active);let next=index;
  if(event.key==='Home')next=0;else if(event.key==='End')next=visible.length-1;else next=(index+(event.key==='ArrowRight'?1:-1)+visible.length)%visible.length;
  event.preventDefault();activateTab(visible[next].id);$('tabs').querySelector(`[data-tab="${state.active}"]`)?.focus();
});
$('import-file').addEventListener('change',event=>{importBackup(event.target.files[0]);event.target.value='';});
$('login-form').addEventListener('submit',async event=>{event.preventDefault();$('login-submit').disabled=true;$('login-error').textContent='';try{await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});$('password').value='';location.reload();}catch(error){$('login-error').textContent=error.message;}finally{$('login-submit').disabled=false;}});
document.addEventListener('keydown',event=>{
  if (!$('login').hidden) return;
  if(event.key==='Escape')document.body.classList.remove('focus-mode');
  if(!event.altKey||event.ctrlKey||event.metaKey)return;
  const key=event.key.toLowerCase();
  const map={l:()=>{$('address').focus();$('address').select();},t:()=>event.shiftKey?reopen():newTab(),w:()=>closeTab(state.active),d:bookmark,h:()=>openPanel('history'),k:commands};
  if(map[key]){event.preventDefault();map[key]();}
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
window.addEventListener('pagehide',persistNow);
window.addEventListener('offline',()=>{$('server-banner').textContent=t('اتصال اینترنت دستگاه قطع شده است.');$('server-banner').hidden=false;});
window.addEventListener('online',bootstrap);
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('document-hidden',document.hidden);if(!document.hidden)clock();});
matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(state.settings.theme==='system')applyAppearance();});
setInterval(()=>{
  const timeoutMinutes=state.settings.suspendMinutes;if(!timeoutMinutes)return;
  for(const tab of state.tabs){
    if(pro?.isVisible(tab)||tab.id===state.active||tab.pinned||!tab.frame||tab.loading||Date.now()-tab.lastActive<timeoutMinutes*60_000)continue;
    let playing=false;try{playing=[...tab.element.contentDocument.querySelectorAll('audio,video')].some(media=>!media.paused&&!media.ended);}catch{playing=true;}
    if(!playing){release(tab);tab.suspended=true;renderTabs();}
  }
},30_000);
setInterval(()=>{if(!document.hidden&&state.initialized&&$('login').hidden)refreshDiagnostics();},60_000);
pro=installPro({state,storage,activeTab,newTab,activateTab,release,renderTabs,renderActive,save,toast,confirm,loadTab});
applyAppearance();changeLanguage(state.settings.language, false);
for(const item of stored.tabs)newTab(item.url,item.title,item.pinned,false,item.workspace);
if(!state.tabs.length)newTab();else activateTab((state.tabs.find(tab=>tab.workspace===pro.currentWorkspace)||state.tabs[0]).id);
bootstrap();
