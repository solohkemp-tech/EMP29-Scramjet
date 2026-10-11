import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, DEFAULTS, KEY, matchesDomain, normalizeWisp, readWorkspace, resolveAddress, safeUrl, validateBackup } from '../src/model.js';
test('address parsing handles domains, Unicode, ports, and search phrases', () => {
  assert.equal(resolveAddress('github.com/a?x=1'), 'https://github.com/a?x=1');
  assert.equal(resolveAddress('localhost:3030'), 'https://localhost:3030/');
  assert.equal(resolveAddress('https://example.com/a#x'), 'https://example.com/a#x');
  assert.equal(resolveAddress('اخبار امروز','duckduckgo'), 'https://duckduckgo.com/?q=' + encodeURIComponent('اخبار امروز'));
  assert.equal(new URL(resolveAddress('مثال.ir')).protocol, 'https:');
});
test('unsafe schemes, credentials, and oversized input are rejected', () => {
  for (const input of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'https://user:secret@example.com', 'ftp://example.com']) assert.throws(() => resolveAddress(input));
  assert.throws(() => resolveAddress('x'.repeat(4097))); assert.throws(() => resolveAddress('a\nexample.com'));
  assert.throws(() => safeUrl('https://u:p@example.com'));
});
test('Wisp endpoint uses the current host and rejects mixed content', () => {
  assert.equal(normalizeWisp('', 'https://emp.example'), 'wss://emp.example/wisp/');
  assert.equal(normalizeWisp('', 'http://localhost:3030'), 'ws://localhost:3030/wisp/');
  assert.equal(normalizeWisp('wss://other.example/wisp', 'https://emp.example'), 'wss://other.example/wisp/');
  for (const input of ['ws://other.example/', 'https://other.example/', 'wss://user:p@other.example/', 'wss://other.example/?token=x']) assert.throws(() => normalizeWisp(input,'https://emp.example'));
});
test('malformed saved state and hostile imports cannot inject URL schemes', () => {
  assert.deepEqual(readWorkspace({getItem:()=>'{broken'}).settings, DEFAULTS);
  assert.throws(() => validateBackup({format:'emp29',schema:1,bookmarks:[{url:'javascript:alert(1)'}]}));
  const data = validateBackup({format:'emp29',schema:1,settings:{theme:'unknown',transport:'fake'},bookmarks:[{url:'https://example.com',title:'<script>alert(1)</script>'}]});
  assert.equal(data.settings.theme,'dark'); assert.equal(data.bookmarks[0].title,'<script>alert(1)</script>');
  assert.equal(data.bookmarks[0].url,'https://example.com/');
});
test('saved sessions are bounded and domain rules respect domain boundaries', () => {
  const value={settings:{remember:false},tabs:[{url:'https://example.com'}],history:[{url:'javascript:x'}],bookmarks:[]};
  assert.deepEqual(readWorkspace({getItem:key=>key===KEY?JSON.stringify(value):null}).tabs,[]);
  assert.equal(matchesDomain('sub.example.com',['example.com']),true);
  assert.equal(matchesDomain('badexample.com',['example.com']),false);
  assert.deepEqual(cleanSettings({blockedDomains:'*.example.com\nexample.com\njavascript:x'}).blockedDomains,['example.com']);
});
