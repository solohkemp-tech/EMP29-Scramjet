// SPDX-License-Identifier: AGPL-3.0-only
import { ht, msg, t, locale, number, preserveDrafts } from './i18n.js';
import { icon, esc } from './icons.js';
import { matchesDomain } from './model.js';
import { PRO_KEY, MAX_WORKSPACES, MAX_SESSIONS, MAX_ARTICLES, readPro, cleanPro, captureSession, restorationPlan, captureArticle, frameAdmission } from './pro-model.js';

export function installPro({ state, storage, activeTab, newTab, activateTab, release, renderTabs, renderActive, save, toast, confirm, loadTab }) {
  let data=readPro(storage), splitId=null, reader=null, articleId=null;
  const $=id=>document.getElementById(id);
  const inWorkspace=()=>state.tabs.filter(tab=>tab.workspace===data.currentWorkspace);
  const names=()=>({workspaces:t('فضاهای کاری و نشست‌ها'),reader:t('حالت مطالعه'),library:t('کتابخانه مطالعه'),shields:t('کنترل سایت')});
  const dialog=document.createElement('dialog');dialog.id='pro-panel';dialog.className='panel pro-panel';dialog.setAttribute('aria-labelledby','pro-title');
  dialog.innerHTML=ht`<header class="panel-heading"><div><span class="eyebrow" dir="ltr">EMP29 PRO / 2.1</span><h2 id="pro-title"></h2></div><button class="icon-btn" data-pro-action="close" aria-label="بستن پنجره">${icon('x')}</button></header><div id="pro-body" class="panel-body"></div>`;
  document.body.append(dialog);
  const strip=document.createElement('div');strip.className='workspace-strip';const toolbarMarkup=()=>ht`<div id="workspace-chips" role="group" aria-label="فضاهای کاری"></div><div class="workspace-tools"><button class="workspace-tool" data-pro-action="workspaces" aria-label="مدیریت فضای کاری و نشست‌ها">${icon('layers')}<span>فضای کاری</span></button><button class="workspace-tool" id="split-toggle" data-pro-action="split" aria-label="نمایش دو تب کنار هم" aria-pressed="false">${icon('columns')}<span>نمای دوگانه</span></button><button class="workspace-tool" data-pro-action="reader" aria-label="حالت مطالعه">${icon('book')}<span>مطالعه</span></button><button class="workspace-tool" data-pro-action="shields" aria-label="کنترل مسدودسازی سایت">${icon('shield')}<span id="shield-counter">کنترل سایت</span></button></div>`;
  strip.innerHTML=toolbarMarkup();document.querySelector('.tab-row').after(strip);
  const rail=document.querySelector('.rail-nav');
  rail.insertAdjacentHTML('beforeend',ht`<button class="rail-btn" data-pro-action="workspaces" data-tip="فضاهای کاری" aria-label="فضاهای کاری و نشست‌ها">${icon('layers')}</button><button class="rail-btn" data-pro-action="library" data-tip="مطالعه و یادداشت" aria-label="کتابخانه مطالعه و یادداشت">${icon('book')}</button>`);
  function relocalize(){
    strip.innerHTML=toolbarMarkup();
    dialog.querySelector('[data-pro-action=close]').setAttribute('aria-label',t('بستن پنجره'));
    const labels={workspaces:[t('فضاهای کاری'),t('فضاهای کاری و نشست‌ها')],library:[t('مطالعه و یادداشت'),t('کتابخانه مطالعه و یادداشت')]};
    for(const [kind,[tip,label]] of Object.entries(labels)){const button=rail.querySelector(`[data-pro-action="${kind}"]`);button.dataset.tip=tip;button.setAttribute('aria-label',label);}
    if(dialog.open)preserveDrafts($('pro-body'),()=>{
      const kind=dialog.dataset.view;
      if(kind==='workspaces')workspacesView();else if(kind==='library')libraryView($('article-search')?.value||'');else if(kind==='reader')readerView(reader,articleId);else if(kind==='shields')shieldsView();
    });
    refresh();
  }
  function persist(){try{storage.setItem(PRO_KEY,JSON.stringify(data));}catch{toast(t('ذخیره فضای کاری ممکن نشد؛ نسخه پشتیبان بگیر.'));}}
  function refresh(){
    $('workspace-chips').innerHTML=data.workspaces.map(item=>`<button class="workspace-chip ${item.id===data.currentWorkspace?'active':''}" data-workspace="${item.id}" data-color="${item.color}" aria-pressed="${item.id===data.currentWorkspace}"><span class="workspace-dot"></span><span>${esc(item.name)}</span><small>${number(state.tabs.filter(tab=>tab.workspace===item.id).length)}</small></button>`).join('');
    $('split-toggle').setAttribute('aria-pressed',String(!!splitId));
    const stats=activeTab()?.stats;const count=stats?.blocked||0;
    $('shield-counter').textContent=count?msg`${count.toLocaleString(locale())} مسدود`:t('کنترل سایت');
    for(const [key,value] of Object.entries(stats||{}))if($('shield-'+key))$('shield-'+key).textContent=value.toLocaleString(locale());
  }
  function selectForTab(tab){
    if(!data.workspaces.some(item=>item.id===tab.workspace))tab.workspace='general';
    if(data.currentWorkspace!==tab.workspace){data.currentWorkspace=tab.workspace;splitId=null;persist();}
    if(splitId===tab.id)splitId=null;refresh();
  }
  function layout(){
    const primary=activeTab(),secondary=state.tabs.find(tab=>tab.id===splitId);
    if(!primary?.url||!secondary?.url||secondary.workspace!==data.currentWorkspace)splitId=null;
    $('frames').classList.toggle('is-split',!!splitId);
    for(const tab of state.tabs){
      const visible=!!primary?.url&&(tab.id===state.active||tab.id===splitId);
      if(tab.pane){tab.pane.hidden=!visible;tab.pane.classList.toggle('secondary-pane',tab.id===splitId);}
      if(tab.element)tab.element.hidden=!visible;
    }
    refresh();
  }
  function switchWorkspace(id){
    if(!data.workspaces.some(item=>item.id===id))return;
    if(!state.tabs.some(tab=>tab.workspace===id)&&state.tabs.length>=24)throw new Error(t('برای بازکردن فضای خالی، ابتدا یک تب را ببند.'));
    splitId=null;data.currentWorkspace=id;persist();
    const tab=state.tabs.find(item=>item.workspace===id);
    if(tab)activateTab(tab.id);else newTab();
    layout();renderTabs();
  }
  async function toggleSplit(){
    if(splitId){splitId=null;layout();return;}
    const tab=activeTab();if(!tab?.url)throw new Error(t('ابتدا یک سایت باز کن، سپس تب دوم همین فضای کاری را انتخاب کن.'));
    const second=inWorkspace().filter(item=>item.id!==tab.id&&item.url).sort((a,b)=>b.lastActive-a.lastActive)[0];
    if(!second)throw new Error(t('برای نمای دوگانه دو تب دارای نشانی در همین فضای کاری لازم است.'));
    splitId=second.id;second.lastActive=Date.now();
    if(!second.frame&&!second.loading)await loadTab(second);layout();
  }
  function show(kind,body){
    for(const id of ['panel','commands'])if($(id).open)$(id).close();
    $('pro-title').textContent=names()[kind]||'EMP29 Pro';$('pro-body').innerHTML=body;
    dialog.dataset.view=kind;if(!dialog.open)dialog.showModal();
    if(kind==='shields')refresh();
  }
  function workspacesView(){
    const options=data.workspaces.map(item=>`<option value="${item.id}" ${item.id===data.currentWorkspace?'selected':''}>${esc(item.name)}</option>`).join('');
    show('workspaces',ht`<p class="panel-intro">تب‌های کار، تحقیق و زندگی را جدا مرتب کن. فضای کاری گروه‌بندی تب‌هاست؛ کوکی و ورود سایت‌ها بین آن‌ها مشترک است.</p><section class="panel-section"><h3>فضاهای تو</h3><div class="pro-list">${data.workspaces.map(item=>ht`<div class="pro-row"><button class="pro-open" data-workspace="${item.id}"><span class="workspace-dot" data-color="${item.color}"></span><strong dir="auto">${esc(item.name)}</strong></button><form class="workspace-rename" data-rename-workspace="${item.id}"><label class="sr-only" for="rename-${item.id}">نام فضای ${esc(item.name)}</label><input id="rename-${item.id}" dir="auto" value="${esc(item.name)}" maxlength="40" required><button class="icon-btn" aria-label="ذخیره نام فضای کاری">${icon('check')}</button></form>${item.id==='general'?'':ht`<button class="icon-btn" data-delete-workspace="${item.id}" aria-label="حذف فضای کاری ${esc(item.name)}">${icon('trash')}</button>`}</div>`).join('')}</div><form id="create-workspace" class="pro-form"><label for="new-workspace-name">فضای کاری تازه</label><div class="pro-form-row"><input id="new-workspace-name" dir="auto" maxlength="40" required placeholder="مثلاً تحقیق"><select id="new-workspace-color" aria-label="رنگ فضای کاری"><option value="mint">سبز</option><option value="blue">آبی</option><option value="violet">بنفش</option><option value="amber">کهربایی</option></select><button class="primary-btn">${icon('plus')} ساخت</button></div></form><div class="field"><label for="move-workspace">انتقال تب فعال</label><select id="move-workspace">${options}</select></div><div class="button-row"><button class="secondary-btn" data-pro-action="hibernate">${icon('moon')} خواب تب‌های دیگر این فضا</button><button class="secondary-btn" data-pro-action="copy-links">${icon('code')} کپی پیوندها</button></div></section><section class="panel-section"><h3>نشست‌های ذخیره‌شده</h3><p class="panel-intro">نشانی‌ها و عنوان تب‌ها ذخیره می‌شوند؛ رمز و کوکی داخل نشست نیست. بازیابی، تب‌های جدید را در فضای فعلی و به‌صورت خوابیده اضافه می‌کند.</p><form id="save-session" class="pro-form"><label for="session-name">نام نشست فعلی</label><div class="pro-form-row"><input id="session-name" dir="auto" maxlength="60" required placeholder="مثلاً پروژه امروز"><button class="primary-btn">ذخیره نشست</button></div></form><div class="pro-list">${data.sessions.length?data.sessions.map(item=>ht`<div class="pro-row"><button class="pro-open" data-restore-session="${item.id}">${icon('layers')}<span><strong dir="auto">${esc(item.name)}</strong><small>${item.tabs.length.toLocaleString(locale())} تب</small></span></button><button class="icon-btn" data-delete-session="${item.id}" aria-label="حذف نشست ${esc(item.name)}">${icon('trash')}</button></div>`).join(''):ht('<p class="panel-intro">هنوز نشستی ذخیره نشده است.</p>')}</div></section>`);
  }
  function shieldsView(){
    const tab=activeTab();let host='';try{host=new URL(tab?.url).hostname;}catch{}
    const allowed=host&&matchesDomain(host,state.settings.allowedSites);
    show('shields',ht`<p class="panel-intro">مسدودسازی دامنه‌های ردیاب و قوانین شخصی؛ تغییر تنظیمات روی درخواست‌های بعدی اثر می‌گذارد.</p><div class="site-summary">${icon('shield')}<div><strong dir="ltr">${esc(host||t('ابتدا یک سایت باز کن'))}</strong><small>${allowed?t('مسدودسازی برای این سایت مستثنا شده است'):state.settings.blockTrackers?t('مسدودسازی دامنه‌های شناخته‌شده فعال است'):t('مسدودسازی ردیاب خاموش است')}</small></div></div><div class="pro-stats"><div><strong id="shield-requests">${tab?.stats?.requests||0}</strong><span>پاسخ</span></div><div><strong id="shield-blocked">${tab?.stats?.blocked||0}</strong><span>مسدود</span></div><div><strong id="shield-cached">${tab?.stats?.cached||0}</strong><span>از کش</span></div></div><div class="button-row"><button class="primary-btn" data-pro-action="toggle-trackers">${state.settings.blockTrackers?t('خاموش‌کردن'):t('فعال‌کردن')} مسدودسازی ردیاب</button>${host?`<button class="secondary-btn" data-pro-action="toggle-site">${allowed?t('حذف استثنای این سایت'):t('استثنای این سایت')}</button>`:''}</div><p class="panel-intro">اگر سایتی درست باز نمی‌شود، آن را مستثنا کن و دوباره بارگذاری کن. استثنا روی زیردامنه‌های همین سایت هم اعمال می‌شود. شمارنده‌ها فقط رویدادهای همین نشست برنامه هستند.</p><section class="panel-section"><h3>موتور اتصال واقعی</h3><div class="check-row"><span>حالت</span><span dir="ltr">${esc(state.settings.transport)}</span></div><div class="check-row"><span>موتور آماده</span><span dir="ltr">${esc(state.engine?.selectedTransport||t('هنوز راه‌اندازی نشده'))}</span></div><button class="secondary-btn full-width" data-pro-action="switch-transport">آماده‌سازی موتور دیگر برای درخواست‌های بعدی</button><p class="panel-intro">درخواست قبلی، ارسال فرم یا پرداخت به‌صورت خودکار تکرار نمی‌شود.</p></section>`);
  }
  function readerView(article=reader,savedId=null){
    if(!article)throw new Error(t('ابتدا حالت مطالعه یک مقاله را باز کن.'));reader=article;articleId=savedId;
    show('reader',ht`<div class="reader-actions"><button class="secondary-btn" data-pro-action="save-article">${icon('bookmark')} ${savedId?t('ذخیره یادداشت'):t('ذخیره در کتابخانه')}</button><button class="secondary-btn" data-pro-action="export-article">${icon('download')} متن Markdown</button><button class="secondary-btn" data-pro-action="library">کتابخانه</button></div><article class="reader-article"><a class="reader-source" href="${esc(article.url)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(new URL(article.url).hostname)}</a><h3 dir="auto">${esc(article.title)}</h3><div class="reader-text" dir="auto">${esc(article.text)}</div></article><section class="panel-section"><label for="article-notes">یادداشت تو</label><textarea id="article-notes" dir="auto" maxlength="4000" rows="5" placeholder="نکته‌هایی که می‌خواهی نگه داری…">${esc(article.notes)}</textarea><p class="panel-intro">مقاله و یادداشت فقط در همین مرورگر ذخیره می‌شوند و در پشتیبان قرار می‌گیرند. استخراج متن بر پایه Mozilla Readability است؛ صفحات ویدئو و برنامه‌های تعاملی ممکن است متن خواندنی نداشته باشند.</p></section>`);
  }
  function libraryView(filter=''){
    const query=filter.trim().toLowerCase(),rows=data.articles.filter(item=>(item.title+' '+item.notes+' '+item.url).toLowerCase().includes(query));
    show('library',ht`<p class="panel-intro">مطلب و یادداشت‌های ذخیره‌شده را بدون بارگذاری دوباره سایت بخوان. حداکثر ${MAX_ARTICLES.toLocaleString(locale())} مطلب، هرکدام تا ۶۰ هزار نویسه؛ متن در همین دستگاه می‌ماند.</p><input id="article-search" dir="auto" class="panel-search" aria-label="جست‌وجوی مطلب یا یادداشت" placeholder="جست‌وجوی عنوان، نشانی یا یادداشت…" value="${esc(filter)}"><div class="pro-list">${rows.length?rows.map(item=>ht`<div class="pro-row"><button class="pro-open" data-read-article="${item.id}">${icon('book')}<span><strong dir="auto">${esc(item.title)}</strong><small dir="ltr">${esc(new URL(item.url).hostname)}</small></span></button><button class="icon-btn" data-delete-article="${item.id}" aria-label="حذف ${esc(item.title)}">${icon('trash')}</button></div>`).join(''):ht('<div class="empty-state"><p>مطلبی پیدا نشد؛ از نوار بالا حالت مطالعه را باز کن و ذخیره کن.</p></div>')}</div>`);
  }
  async function action(name){
    if(name==='close'){dialog.close();return;}
    if(name==='workspaces'){workspacesView();return;}
    if(name==='library'){libraryView();return;}
    if(name==='shields'){shieldsView();return;}
    if(name==='split'){await toggleSplit();return;}
    if(name==='reader'){
      const tab=activeTab();if(!tab?.frame||!tab.element?.contentDocument)throw new Error(t('ابتدا بارگذاری یک مقاله را کامل کن.'));
      const {Readability}=await import('./reader-runtime.js');
      readerView(captureArticle(tab.element.contentDocument,tab.url,Readability));return;
    }
    if(name==='save-article'){
      reader.notes=$('article-notes').value.slice(0,4000);
      const existing=data.articles.find(item=>item.id===articleId||item.url===reader.url);
      if(existing){Object.assign(existing,reader,{id:existing.id});articleId=existing.id;}
      else{if(data.articles.length>=MAX_ARTICLES)throw new Error(t('کتابخانه پر است؛ یک مطلب را حذف کن.'));data.articles.unshift({...reader});articleId=reader.id;}
      persist();toast(t('مطلب و یادداشت ذخیره شدند.'));readerView(reader,articleId);return;
    }
    if(name==='export-article'){
      const content=msg`# ${reader.title}\n\n${reader.url}\n\n${reader.text}\n\n## یادداشت\n\n${$('article-notes').value}`;
      const link=document.createElement('a'),source=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));link.href=source;link.download='EMP29-article.md';link.click();setTimeout(()=>URL.revokeObjectURL(source),1000);return;
    }
    if(name==='hibernate'){for(const tab of inWorkspace())if(tab.id!==state.active&&tab.id!==splitId&&!tab.pinned&&!tab.loading&&!playing(tab)&&tab.frame){release(tab);tab.suspended=true;}renderTabs();layout();toast(t('تب‌های غیرفعال آزاد شدند؛ تب‌های سنجاق‌شده و در حال پخش حفظ شدند.'));return;}
    if(name==='copy-links'){const links=inWorkspace().filter(tab=>tab.url).map(tab=>tab.url).join('\n');if(!links)throw new Error(t('این فضا هنوز پیوندی ندارد.'));await navigator.clipboard.writeText(links);toast(t('پیوندهای این فضا کپی شدند.'));return;}
    if(name==='toggle-trackers'){state.settings.blockTrackers=!state.settings.blockTrackers;save();shieldsView();return;}
    if(name==='toggle-site'){
      const host=new URL(activeTab().url).hostname;
      if(matchesDomain(host,state.settings.allowedSites))state.settings.allowedSites=state.settings.allowedSites.filter(domain=>!(host===domain||host.endsWith('.'+domain)));
      else state.settings.allowedSites=[...state.settings.allowedSites,host].slice(-200);
      save();shieldsView();return;
    }
    if(name==='switch-transport'){if(!state.engine)throw new Error(t('ارتباط با سرور آماده نیست.'));const selected=await state.engine.switchTransport();toast(msg`${selected} آماده شد. برای تکرار بارگذاری، دکمه تلاش دوباره را بزن.`);shieldsView();}
  }
  function playing(tab){try{return [...tab.element.contentDocument.querySelectorAll('audio,video')].some(media=>!media.paused&&!media.ended);}catch{return true;}}
  function admitFrame(tab){
    const plan=frameAdmission(tab,state.tabs,{active:state.active,secondary:splitId,budget:state.settings.frameBudget,playing});
    if(!plan.allowed)return false;
    for(const victim of plan.victims){release(victim);victim.suspended=true;}
    if(plan.victims.length)renderTabs();return true;
  }
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-pro-action],[data-workspace],[data-delete-workspace],[data-restore-session],[data-delete-session],[data-read-article],[data-delete-article]');
    if(!target||!$('login').hidden)return;
    try {
      if(target.dataset.proAction){await action(target.dataset.proAction);return;}
      if(target.dataset.workspace){switchWorkspace(target.dataset.workspace);return;}
      if(target.dataset.deleteWorkspace){
        const id=target.dataset.deleteWorkspace;if(id==='general')return;
        if(!await confirm(t('حذف فضای کاری'),t('تب‌ها به فضای شخصی منتقل می‌شوند و بسته نمی‌شوند.'),t('حذف')))return;
        for(const tab of state.tabs)if(tab.workspace===id)tab.workspace='general';data.workspaces=data.workspaces.filter(item=>item.id!==id);if(data.currentWorkspace===id)switchWorkspace('general');persist();save();refresh();workspacesView();return;
      }
      if(target.dataset.restoreSession){
        const session=data.sessions.find(item=>item.id===target.dataset.restoreSession);const plan=restorationPlan(session,state.tabs,data.currentWorkspace);
        for(const tab of plan)newTab(tab.url,tab.title,tab.pinned,false,data.currentWorkspace);save();refresh();toast(msg`${plan.length.toLocaleString(locale())} تب به فضای فعلی اضافه شد.`);return;
      }
      if(target.dataset.deleteSession){data.sessions=data.sessions.filter(item=>item.id!==target.dataset.deleteSession);persist();workspacesView();return;}
      if(target.dataset.readArticle){const item=data.articles.find(item=>item.id===target.dataset.readArticle);if(item)readerView({...item},item.id);return;}
      if(target.dataset.deleteArticle){if(!await confirm(t('حذف مطلب'),t('متن ذخیره‌شده و یادداشت آن حذف می‌شوند.'),t('حذف')))return;data.articles=data.articles.filter(item=>item.id!==target.dataset.deleteArticle);persist();libraryView();}
    }catch(error){toast(error.message||t('این عمل کامل نشد.'));}
  });
  dialog.addEventListener('submit',event=>{
    event.preventDefault();try{
      if(event.target.id==='create-workspace'){
        if(data.workspaces.length>=MAX_WORKSPACES)throw new Error(t('سقف ۸ فضای کاری است؛ یکی را حذف کن.'));
        const name=$('new-workspace-name').value.trim().slice(0,40);if(!name)throw new Error(t('نام فضای کاری را بنویس.'));
        const item={id:crypto.randomUUID(),name,color:$('new-workspace-color').value};data.workspaces.push(item);persist();switchWorkspace(item.id);workspacesView();
      }else if(event.target.id==='save-session'){
        if(data.sessions.length>=MAX_SESSIONS)throw new Error(t('سقف ۱۲ نشست ذخیره‌شده است؛ یکی را حذف کن.'));
        data.sessions.unshift(captureSession(inWorkspace(),$('session-name').value));persist();workspacesView();toast(t('نشست این فضا ذخیره شد.'));
      }else if(event.target.dataset.renameWorkspace){const item=data.workspaces.find(x=>x.id===event.target.dataset.renameWorkspace);const name=event.target.querySelector('input').value.trim().slice(0,40);if(!name)throw new Error(t('نام نمی‌تواند خالی باشد.'));item.name=name;persist();refresh();workspacesView();}
    }catch(error){toast(error.message);}
  });
  dialog.addEventListener('change',event=>{if(event.target.id==='move-workspace'){const tab=activeTab();if(tab){tab.workspace=event.target.value;selectForTab(tab);save();renderTabs();layout();}}});
  dialog.addEventListener('input',event=>{if(event.target.id==='article-search'){const value=event.target.value;libraryView(value);$('article-search').focus();$('article-search').setSelectionRange(value.length,value.length);}});
  document.addEventListener('keydown',event=>{if(!$('login').hidden||!event.altKey||event.ctrlKey||event.metaKey)return;const key=event.key.toLowerCase();const names={p:'workspaces',r:'reader',s:'split'};if(names[key]){event.preventDefault();action(names[key]).catch(error=>toast(error.message));}});
  refresh();
  return {
    get currentWorkspace(){return data.currentWorkspace;}, get splitId(){return splitId;}, dialog,
    workspaceFor:id=>data.workspaces.some(item=>item.id===id)?id:'general',
    selectForTab,layout,refresh,relocalize,admitFrame,isVisible:tab=>tab.id===state.active||tab.id===splitId,
    snapshot:()=>cleanPro(data),restore:value=>{data=cleanPro(value);persist();},
    beforeClose:id=>{if(splitId===id)splitId=null;},
    commands:()=>[
      {title:t('فضاهای کاری و نشست‌ها'),icon:'layers',key:'Alt P',run:()=>workspacesView()},
      {title:t('کتابخانه مطالعه و یادداشت'),icon:'book',run:()=>libraryView()},
      {title:t('حالت مطالعه مقاله'),icon:'book',key:'Alt R',run:()=>action('reader').catch(error=>toast(error.message))},
      {title:t('نمای دوگانه تب‌ها'),icon:'columns',key:'Alt S',run:()=>toggleSplit().catch(error=>toast(error.message))},
      {title:t('کنترل سایت و مسدودسازی'),icon:'shield',run:()=>shieldsView()},
      ...state.tabs.map(tab=>({title:msg`رفتن به تب: ${tab.title||tab.url||t('خانه')}`,icon:'globe',run:()=>activateTab(tab.id)})),
    ],
  };
}
