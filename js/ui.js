// Small DOM helpers shared by all views.
import * as dict from './dictionary.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = k => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}

const PATHS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  lists: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  review: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  volume: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
  spell: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  mixed: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  tools: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/><path d="M11 12v3h2v-3"/>',
  worksheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h3M13 12h3M8 16h3M13 16h3"/>',
  reels: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>'
};

export function icon(name, size = 22) {
  return h('span', {
    class: 'icon', 'aria-hidden': 'true',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`
  });
}

export function ring(pct, size = 104, stroke = 11) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return h('span', {
    class: 'ring',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="ring-track" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="ring-fill" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`
  });
}

// Segmented progress bar: mastered / learning shares of a total.
export function bar(mastered, learning, total, cls = '') {
  const pct = n => (total ? (n / total) * 100 : 0).toFixed(2) + '%';
  return h('div', { class: 'bar ' + cls },
    h('i', { class: 'm', style: `width:${pct(mastered)}` }),
    h('i', { class: 'l', style: `width:${pct(learning)}` }));
}

export function pageHead(title, sub, right) {
  return h('header', { class: 'page-head' },
    h('div', null, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null),
    right || null);
}

let toastTimer;
export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.className = kind;
  t.replaceChildren(...(kind ? [icon(kind === 'error' ? 'alert' : 'check', 18)] : []), msg);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sample = (arr, n) => shuffle(arr).slice(0, n);

export const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Hide the target word inside its own definition.
export function mask(text, word) {
  const root = word.slice(0, Math.max(3, word.length - 3));
  return text.replace(new RegExp('\\b' + esc(root) + '\\w*', 'gi'), '_____');
}

export function defBlock(def, count = 2, word = '') {
  if (!def) {
    const off = word && dict.failed(word);
    return h('div', { class: 'state compact ' + (off ? 'error' : 'empty') }, icon(off ? 'alert' : 'inbox', 20), off ? 'Offline' : 'No entry');
  }
  return h('div', { class: 'defs' }, def.defs.slice(0, count).map(d =>
    h('div', { class: 'def' },
      d.pos ? h('span', { class: 'pos' }, d.pos) : null,
      h('p', null, d.def),
      d.example ? h('p', { class: 'ex' }, '“' + d.example + '”') : null)),
    def.examples && def.examples.length ? h('div', { class: 'def' }, h('span', { class: 'pos' }, 'examples'), def.examples.map(e => h('p', { class: 'ex' }, '“' + e + '”'))) : null);
}

export function kbd(k) { return h('span', { class: 'kbd' }, k); }

const sk = (cls, style) => h('span', { class: 'sk ' + cls, style });
// Skeleton placeholders (flat pulse, no gradient). kind: 'def' | 'study'
export function skeleton(kind) {
  if (kind === 'study') {
    return h('div', { class: 'sk-study', 'aria-busy': 'true', 'aria-label': 'Loading' },
      sk('sk-word'), sk('sk-line w40'),
      h('div', { class: 'sk-box' }, sk('sk-line w100'), sk('sk-line w80'), sk('sk-line w60')),
      sk('sk-btn'));
  }
  return h('div', { class: 'sk-def', 'aria-busy': 'true', 'aria-label': 'Loading' },
    sk('sk-line w40'), sk('sk-line w100'), sk('sk-line w80'));
}

// Loading / empty / error / success states. kind: 'loading' | 'empty' | 'error' | 'success'
export function state(kind, label, action) {
  const ico = kind === 'loading'
    ? h('span', { class: 'spinner', 'aria-hidden': 'true' })
    : h('span', { class: 'state-ico' }, icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'inbox', 30));
  return h('div', { class: 'state ' + kind, role: kind === 'error' ? 'alert' : 'status', 'aria-live': 'polite' },
    ico,
    label ? h('div', { class: 'state-label' }, label) : null,
    action ? h('button', { class: 'btn', onclick: action.onClick }, action.label) : null);
}


// Copy a list's words to the clipboard (one per line) and confirm with a toast.
export async function copyWords(words, label = 'words') {
  const text = words.map(w => w.word).join(',');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    if (!ok) return toast('Copy failed', 'error');
  }
  toast(`Copied ${words.length} ${label}`, 'success');
}
