import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { JSDOM } from 'jsdom';
import { t, ht, msg, locale, number, setLanguage, bindStaticUI } from '../src/i18n.js';
import { cleanSettings, readWorkspace, validateBackup } from '../src/model.js';

test('authored translations leave interpolated names and notes intact',()=>{
  setLanguage('en');
  assert.equal(t('حالت مطالعه'),'Reading mode');
  assert.equal(ht`<button aria-label="حذف ${'نشانک‌ها'}">بستن</button>`,'<button aria-label="Delete نشانک‌ها">Close</button>');
  assert.equal(msg`رفتن به تب: ${'خانه'}`,'Switch to tab: خانه');
  assert.equal(locale(),'en-US');assert.equal(number(1234),'1,234');
  setLanguage('fa');assert.equal(t('Reading mode'),'حالت مطالعه');assert.equal(number(1234),'۱٬۲۳۴');
});
test('language preferences validate, migrate and round-trip through backups',()=>{
  assert.equal(cleanSettings({language:'en'}).language,'en');assert.equal(cleanSettings({language:'ar'}).language,'fa');
  assert.equal(cleanSettings({theme:'light'}).language,'fa');
  assert.equal(validateBackup({format:'emp29',schema:1,bookmarks:[],settings:{language:'en'}}).settings.language,'en');
  assert.equal(readWorkspace({getItem:()=>JSON.stringify({settings:{language:'en'},bookmarks:[]})}).settings.language,'en');
});
test('static bindings never translate later user nodes or input values',()=>{
  const dom=new JSDOM('<html lang="fa" dir="rtl"><body><h1>بدون فاصله.</h1><input aria-label="نام" value="نشانک‌ها"><div id="user"></div></body></html>');
  const doc=dom.window.document,translate=bindStaticUI(doc);doc.getElementById('user').textContent='حالت مطالعه';
  setLanguage('en');translate();assert.equal(doc.documentElement.dir,'ltr');assert.equal(doc.querySelector('h1').textContent,'Within reach.');assert.equal(doc.querySelector('input').value,'نشانک‌ها');assert.equal(doc.getElementById('user').textContent,'حالت مطالعه');
  setLanguage('fa');translate();assert.equal(doc.querySelector('h1').textContent,'بدون فاصله.');assert.equal(doc.documentElement.dir,'rtl');dom.window.close();
});
test('all authored Persian UI and error messages have complete English coverage',async()=>{
  setLanguage('en');const missing=[];const arabic=/\p{Script=Arabic}/u;
  for(const name of ['app.js','model.js','pro-model.js','pro-features.js','engine.js','connection.js']){
    const source=await readFile(new URL('../src/'+name,import.meta.url),'utf8');const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});
    function walk(node,parent){
      if(!node||typeof node!=='object')return;
      if(node.type==='Literal'&&typeof node.value==='string'&&arabic.test(node.value)&&node.value!=='فارسی'){
        const translated=parent?.callee?.name==='ht'?ht(node.value):t(node.value);
        if(arabic.test(translated))missing.push(name+': '+translated.slice(0,100));
        if(parent?.type!=='CallExpression'||!['t','ht'].includes(parent.callee?.name))missing.push(name+': unbound literal at '+node.start);
      }
      if(node.type==='TemplateLiteral'&&node.quasis.some(q=>arabic.test(q.value.cooked||''))){
        if(parent?.type!=='TaggedTemplateExpression'||!['ht','msg'].includes(parent.tag?.name))missing.push(name+': unbound template at '+node.start);
        for(const q of node.quasis){const translated=ht(q.value.cooked||'');if(arabic.test(translated))missing.push(name+': '+translated.slice(0,100));}
      }
      for(const value of Object.values(node)){if(Array.isArray(value)){for(const child of value)walk(child,node);}else if(value&&typeof value==='object'&&value.type)walk(value,node);}
    }walk(tree,null);
  }
  setLanguage('fa');assert.deepEqual(missing,[]);
});
