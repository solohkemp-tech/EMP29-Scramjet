// SPDX-License-Identifier: AGPL-3.0-only
import english from './locales/en.json' with { type: 'json' };

let language = 'fa';
const reverse = new Map(Object.entries(english).map(([source, translated]) => [translated, source]));
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fragments = new RegExp(Object.keys(english).sort((a,b) => b.length-a.length).map(escapeRegex).join('|'), 'g');
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const getLanguage = () => language;
export const locale = () => language === 'en' ? 'en-US' : 'fa-IR';
export const number = value => Number(value).toLocaleString(locale());
export function setLanguage(value) { language = value === 'en' ? 'en' : 'fa'; }
export function t(source) {
  if (typeof source !== 'string') return source;
  return language === 'en' ? english[source] ?? source : reverse.get(source) ?? source;
}
function fragment(source, html) {
  if (language === 'fa') return source;
  return source.replace(fragments, key => html ? escapeHtml(english[key]) : english[key]);
}
function message(parts, values, html) {
  if (typeof parts === 'string') return fragment(parts, html);
  // Translate authored literal segments only. Page titles, notes and other
  // interpolated user content must retain their original text and direction.
  return parts.reduce((out, part, index) => out + fragment(part, html) + (index < values.length ? values[index] : ''), '');
}
export const ht = (parts, ...values) => message(parts, values, true);
export const msg = (parts, ...values) => message(parts, values, false);

export function bindStaticUI(doc) {
  const bindings = [];
  const walker = doc.createTreeWalker(doc.documentElement, 4);
  for (let node; (node = walker.nextNode());) {
    if (/\p{Script=Arabic}/u.test(node.nodeValue) && !node.parentElement?.closest('script,style,noscript')) bindings.push({node, source:node.nodeValue});
  }
  for (const node of doc.querySelectorAll('*')) for (const name of ['aria-label','placeholder','title','data-tip','content']) {
    const source = node.getAttribute(name);
    if (source && /\p{Script=Arabic}/u.test(source)) bindings.push({node, name, source});
  }
  return () => {
    doc.documentElement.lang = language;
    doc.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
    for (const {node, name, source} of bindings) {
      if (!node.isConnected) continue;
      const content = fragment(source, false);
      if (name) node.setAttribute(name, content); else node.nodeValue = content;
    }
  };
}

// Preserve drafts and focus when a translated dialog is redrawn. Values are
// kept verbatim, including values that happen to match a catalog message.
export function preserveDrafts(root, redraw) {
  const focused = root.ownerDocument.activeElement;
  const fields = [...root.querySelectorAll('input,select,textarea')].filter(node => node.id && node.id !== 'language').map(node => ({id:node.id, value:node.value, checked:node.checked, start:node.selectionStart, end:node.selectionEnd, focused:node === focused}));
  redraw();
  for (const field of fields) {
    const node = root.ownerDocument.getElementById(field.id);
    if (!node || !root.contains(node)) continue;
    node.value = field.value;
    if (typeof field.checked === 'boolean') node.checked = field.checked;
    if (field.focused) {
      node.focus();
      if (typeof field.start === 'number') node.setSelectionRange?.(field.start, field.end);
    }
  }
}
