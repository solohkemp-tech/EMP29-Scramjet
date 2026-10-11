// SPDX-License-Identifier: AGPL-3.0-only
import { t } from './i18n.js';
export const PRO_KEY = 'emp29.pro.v2';
export const MAX_WORKSPACES = 8, MAX_SESSIONS = 12, MAX_ARTICLES = 15;
const colors = ['mint', 'blue', 'violet', 'amber'];
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const text = (value, length) => typeof value === 'string' ? value.slice(0, length) : '';
const timestamp = value => Number.isFinite(value) && value > 0 ? value : Date.now();
function url(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error(t('نشانی ذخیره‌شده معتبر نیست.'));
  const parsed = new URL(value);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(t('نشانی ذخیره‌شده معتبر نیست.'));
  return parsed.href;
}
export function defaultsPro() {
  return { schema: 2, currentWorkspace: 'general', workspaces: [{id:'general',name:t('شخصی'),color:'mint'}], sessions: [], articles: [] };
}
export function cleanPro(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const result = defaultsPro(), ids = new Set(['general']);
  if (Array.isArray(raw.workspaces)) {
    const general=raw.workspaces.find(item=>item?.id==='general');
    if(general)result.workspaces[0]={id:'general',name:text(general.name,40).trim()||t('شخصی'),color:colors.includes(general.color)?general.color:'mint'};
    for(const item of raw.workspaces.slice(0,MAX_WORKSPACES)) {
      if(!item||!validId(item.id)||ids.has(item.id))continue;
      ids.add(item.id);result.workspaces.push({id:item.id,name:text(item.name,40).trim()||t('فضای کاری'),color:colors.includes(item.color)?item.color:'mint'});
      if(result.workspaces.length>=MAX_WORKSPACES)break;
    }
  }
  if(ids.has(raw.currentWorkspace))result.currentWorkspace=raw.currentWorkspace;
  if(Array.isArray(raw.sessions))for(const item of raw.sessions.slice(0,MAX_SESSIONS)) {
    if(!item||!validId(item.id)||!Array.isArray(item.tabs))continue;
    const tabs=item.tabs.slice(0,24).flatMap(tab=>{try{return tab?.url?[{url:url(tab.url),title:text(tab.title,120),pinned:tab.pinned===true}]:[];}catch{return [];}});
    if(tabs.length&&!result.sessions.some(x=>x.id===item.id))result.sessions.push({id:item.id,name:text(item.name,60).trim()||t('نشست ذخیره‌شده'),created:timestamp(item.created),tabs});
  }
  if(Array.isArray(raw.articles))for(const item of raw.articles.slice(0,MAX_ARTICLES)) {
    try {
      if(!item||!validId(item.id)||typeof item.text!=='string'||!item.text.trim()||result.articles.some(x=>x.id===item.id))continue;
      result.articles.push({id:item.id,url:url(item.url),title:text(item.title,160)||t('مطلب ذخیره‌شده'),text:text(item.text,60_000),notes:text(item.notes,4000),created:timestamp(item.created)});
    } catch { /* Invalid imports cannot introduce executable schemes. */ }
  }
  return result;
}
export function readPro(storage) {
  try{return cleanPro(JSON.parse(storage.getItem(PRO_KEY)||'{}'));}catch{return defaultsPro();}
}
export function captureSession(tabs,name,id=crypto.randomUUID()) {
  const records=tabs.filter(tab=>tab.url).slice(0,24).map(tab=>({url:url(tab.url),title:text(tab.title,120),pinned:!!tab.pinned}));
  if(!records.length)throw new Error(t('ابتدا یک سایت در این فضای کاری باز کن.'));
  const title=text(name,60).trim();if(!title)throw new Error(t('برای نشست یک نام بنویس.'));
  return {id,name:title,created:Date.now(),tabs:records};
}
export function restorationPlan(session,tabs,workspace,limit=24) {
  const candidates=cleanPro({sessions:[session]}).sessions[0]?.tabs;
  if(!candidates)throw new Error(t('نشست ذخیره‌شده معتبر نیست.'));
  const seen=new Set(tabs.filter(tab=>tab.workspace===workspace).map(tab=>tab.url));
  const missing=candidates.filter(tab=>{if(seen.has(tab.url))return false;seen.add(tab.url);return true;});
  if(tabs.length+missing.length>limit)throw new Error(t('برای بازیابی کامل نشست، چند تب را ببند؛ سقف ۲۴ تب است.'));
  return missing;
}
export function captureArticle(document,pageUrl,Readability,id=crypto.randomUUID()) {
  const source=url(pageUrl);
  if(!document?.documentElement)throw new Error(t('محتوای صفحه در دسترس نیست.'));
  // Extraction never mutates the live page and only plain text leaves this function.
  const copy=document.cloneNode(true);
  const parsed=new Readability(copy,{maxElemsToParse:20_000,charThreshold:120}).parse();
  const body=parsed?.textContent?.trim();
  if(!body||body.length<120)throw new Error(t('متن کافی برای حالت مطالعه پیدا نشد؛ این قابلیت برای مقاله و خبر است.'));
  return {id,url:source,title:text(parsed.title||document.title,160),text:body.slice(0,60_000),notes:'',created:Date.now()};
}
export function frameAdmission(tab,tabs,{active,secondary,budget,playing}) {
  if(tab.frame)return {allowed:true,victims:[]};
  const live=tabs.filter(item=>item.frame),needed=Math.max(0,live.length-budget+1);
  if(!needed)return {allowed:true,victims:[]};
  const candidates=live.filter(item=>item.id!==active&&item.id!==secondary&&!item.pinned&&!item.loading&&!playing(item)).sort((a,b)=>a.lastActive-b.lastActive);
  // A reduced budget may require several victims. Do not partially evict tabs
  // when protected frames prevent admission of the new frame.
  return candidates.length<needed?{allowed:false,victims:[]}:{allowed:true,victims:candidates.slice(0,needed)};
}
