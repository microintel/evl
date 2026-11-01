// Word family: tenses/forms, synonyms, opposites and word anatomy.
// Live data from two free, key-less APIs (nothing is hard-coded):
//   • Datamuse  (api.datamuse.com)      – synonyms, antonyms, derived words, syllables, part of speech
//   • Wiktionary (en.wiktionary.org)    – verb tenses / plurals / comparatives, etymology & morphology
// Results are cached in the existing IndexedDB 'defs' store under the key "fam:<word>" (works offline afterwards).
import * as db from './db.js';
import { h, icon } from './ui.js';

const DM = 'https://api.datamuse.com/words';
const WIKI = 'https://en.wiktionary.org/w/api.php';
const TTL = 30 * 864e5;
const mem = new Map();
const inflight = new Map();

const clean = w => String(w).toLowerCase().trim();

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ---------- Datamuse ---------- */
function stemOf(w) {
  let s = w;
  const m = s.match(/(ingly|ing|ed|ly|ness|ment|tion|sion|ful|less|able|ible|ous|ive|al|er|est|es|s|y|e)$/);
  if (m && s.length - m[0].length >= 4) s = s.slice(0, -m[0].length);
  if (s.length > 4) s = s.replace(/i$/, '');
  return s.length >= 3 ? s : w;
}
const POS_LABEL = { n: 'Nouns', v: 'Verbs', adj: 'Adjectives', adv: 'Adverbs' };
const tagsOf = r => (r.tags || []);
const freqOf = r => { const t = tagsOf(r).find(x => x.startsWith('f:')); return t ? parseFloat(t.slice(2)) : 0; };
const posOf = r => tagsOf(r).find(x => ['n', 'v', 'adj', 'adv'].includes(x)) || '';

function buildFamily(word, rows) {
  const out = {};
  const seen = new Set([word]);
  rows
    .filter(r => /^[a-z]+$/.test(r.word) && r.word !== word && r.word.length <= word.length + 7 && freqOf(r) >= 0.2)
    .sort((a, b) => freqOf(b) - freqOf(a))
    .slice(0, 16)
    .forEach(r => {
      if (seen.has(r.word)) return;
      seen.add(r.word);
      const p = posOf(r) || 'n';
      (out[p] = out[p] || []).push(r.word);
    });
  return out;
}

/* ---------- Wiktionary (rendered HTML → forms + etymology) ---------- */
const isHeading = el => el.matches && el.matches('.mw-heading, h1, h2, h3, h4, h5, h6');
const headingText = el => (el.querySelector('h2,h3,h4,h5,h6') || el).textContent.replace(/\[.*?\]/g, '').trim();

function englishSection(doc) {
  const anchor = doc.getElementById('English');
  if (!anchor) return [];
  let head = anchor.closest('.mw-heading') || anchor.closest('h2') || anchor.parentElement;
  const out = [];
  for (let el = head.nextElementSibling; el; el = el.nextElementSibling) {
    if (isHeading(el) && (el.matches('h2') || el.querySelector('h2') || el.classList.contains('mw-heading2'))) break;
    out.push(el);
  }
  return out;
}

function firstMatch(text, re) { const m = text.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; }

function parseWiki(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const section = englishSection(doc);
  const res = { forms: [], etymology: '' };
  let pos = '';
  let sawEty = false;
  for (const el of section) {
    if (isHeading(el)) {
      pos = headingText(el).toLowerCase();
      if (pos.startsWith('etymology') && !sawEty) { sawEty = true; res._ety = true; }
      else if (!pos.startsWith('etymology')) res._ety = false;
      continue;
    }
    if (res._ety && !res.etymology) {
      const p = el.matches('p') ? el : el.querySelector('p');
      if (p) res.etymology = p.textContent.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
    }
    const lines = el.matches('.headword-line') ? [el] : [...el.querySelectorAll('.headword-line')];
    for (const line of lines) {
      const t = line.textContent.replace(/\s+/g, ' ');
      const f = { pos };
      if (pos === 'verb') {
        f.third = firstMatch(t, /third-person singular simple present ([^,)]+?)(?:,|\)|$)/);
        f.ing = firstMatch(t, /present participle ([^,)]+?)(?:,|\)|$)/);
        const both = firstMatch(t, /simple past and past participle ([^,)]+?)(?:,|\)|$)/);
        f.past = both || firstMatch(t, /simple past ([^,)]+?)(?:,|\)|$)/);
        f.pp = both || firstMatch(t, /(?:^|[ ,(])past participle ([^,)]+?)(?:,|\)|$)/);
      } else if (pos === 'noun') {
        f.plural = firstMatch(t, /plural ([^,)]+?)(?:,|\)|$)/);
        if (/uncountable/.test(t) && !f.plural) f.note = 'uncountable';
      } else if (pos === 'adjective' || pos === 'adverb') {
        f.comparative = firstMatch(t, /comparative ([^,)]+?)(?:,|\)|$)/);
        f.superlative = firstMatch(t, /superlative ([^,)]+?)(?:,|\)|$)/);
      } else continue;
      if (Object.keys(f).some(k => k !== 'pos' && f[k])) res.forms.push(f);
    }
  }
  delete res._ety;
  return res;
}

function parseParts(ety) {
  if (!ety || !ety.includes('+')) return null;
  const sentence = ety.split(/\.\s/).find(s => s.includes('+'));
  if (!sentence) return null;
  const body = sentence.replace(/^(?:From|Formed from|Equivalent to|Compound of|Derived from|Ultimately from)\s+/i, '').replace(/\.$/, '');
  const parts = body.split(/\s*\+\u200e?\s*/).map(p => p.replace(/\([^)]*\)/g, '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 6 || parts.some(p => p.length > 22 || p.split(' ').length > 2)) return null;
  return parts.map(p => {
    const clean = p.replace(/^[A-Z][a-z]+ /, '');
    const role = /^-.*-$/.test(clean) ? 'infix' : clean.endsWith('-') ? 'prefix' : clean.startsWith('-') ? 'suffix' : 'root';
    return { text: clean, role };
  });
}

// Used only when Wiktionary has no "a + b" breakdown: guess it from the derived words Datamuse returned.
function guessParts(word, family) {
  const all = Object.values(family).flat().filter(x => x.length >= 3 && x.length < word.length);
  all.sort((a, b) => b.length - a.length);
  for (const c of all) {
    for (const base of [c, c.replace(/y$/, 'i'), c.replace(/e$/, '')]) {
      if (word.startsWith(base) && word.length - base.length >= 2 && word.length - base.length <= 5) {
        return [{ text: c, role: 'root' }, { text: '-' + word.slice(base.length), role: 'suffix' }];
      }
    }
  }
  return null;
}

/* ---------- regular-verb fallback (only if Wiktionary gave no forms) ---------- */
function regularVerb(w) {
  const vowel = c => 'aeiou'.includes(c);
  const third = /(s|x|z|ch|sh|o)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's';
  const dbl = /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w) && w.length <= 4;
  const stem = w.endsWith('ie') ? w.slice(0, -2) + 'y' : w.endsWith('e') && !w.endsWith('ee') ? w.slice(0, -1) : w;
  const ing = stem + (dbl ? w.slice(-1) : '') + 'ing';
  const past = w.endsWith('e') ? w + 'd' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ied' : w + (dbl ? w.slice(-1) : '') + 'ed';
  void vowel;
  return { pos: 'verb', third, ing, past, pp: past, guessed: true };
}

/* ---------- main lookup ---------- */
async function fetchFamily(word) {
  const q = encodeURIComponent(word);
  const stem = encodeURIComponent(stemOf(word));
  const jobs = await Promise.allSettled([
    getJSON(`${DM}?rel_syn=${q}&max=14`),
    getJSON(`${DM}?rel_ant=${q}&max=10`),
    getJSON(`${DM}?sp=${stem}*&md=pf&max=80`),
    getJSON(`${DM}?sp=${q}&md=ps&max=1`),
    getJSON(`${WIKI}?action=parse&page=${q}&prop=text&format=json&formatversion=2&origin=*&redirects=1&disableeditsection=1&disabletoc=1`)
  ]);
  const ok = jobs.map(j => j.status === 'fulfilled');
  if (!ok.some(Boolean)) return { failed: true };
  const [syn, ant, fam, self, wiki] = jobs.map(j => (j.status === 'fulfilled' ? j.value : null));

  const info = (self && self[0] && self[0].word === word) ? self[0] : null;
  const dmPos = info ? tagsOf(info).filter(x => ['n', 'v', 'adj', 'adv'].includes(x)) : [];
  const syllables = info && info.numSyllables ? info.numSyllables : 0;

  let wk = { forms: [], etymology: '' };
  if (wiki && wiki.parse && wiki.parse.text) { try { wk = parseWiki(wiki.parse.text); } catch { /* ignore */ } }

  const family = fam ? buildFamily(word, fam) : {};
  const isVerb = dmPos.includes('v') || wk.forms.some(f => f.pos === 'verb');
  let verb = wk.forms.find(f => f.pos === 'verb' && (f.past || f.ing)) || null;
  if (isVerb && !verb && ok[3]) verb = regularVerb(word);

  let parts = parseParts(wk.etymology), partsGuessed = false;
  if (!parts) { parts = guessParts(word, family); partsGuessed = !!parts; }

  const data = {
    word, ts: Date.now(),
    complete: ok.every(Boolean),
    synonyms: (syn || []).map(x => x.word).filter(x => x !== word),
    antonyms: (ant || []).map(x => x.word),
    family,
    syllables, pos: dmPos, letters: word.length,
    verb,
    otherForms: wk.forms.filter(f => f.pos !== 'verb'),
    origin: wk.etymology ? wk.etymology.slice(0, 260) : '',
    parts, partsGuessed
  };
  return data;
}

export function lookup(word) {
  const k = clean(word);
  if (mem.has(k)) return Promise.resolve(mem.get(k));
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    try {
      const c = await db.get('defs', 'fam:' + k);
      if (c && c.data && Date.now() - c.ts < TTL) { mem.set(k, c.data); return c.data; }
    } catch { /* ignore */ }
    let data;
    try { data = await fetchFamily(k); } catch { data = { failed: true }; }
    if (!data.failed && data.complete) {
      mem.set(k, data);
      db.put('defs', { word: 'fam:' + k, data, ts: Date.now() }).catch(() => {});
    }
    return data;
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/* ---------- UI: bottom sheet ---------- */
const ROLE_LABEL = { prefix: 'prefix', suffix: 'suffix', root: 'root', infix: 'link' };
let current = null;   // { close } while a sheet is open

export function openFamily(word) {
  if (current) current.close();
  const stack = [];
  let shown = clean(word);
  let token = 0;

  const title = h('h2', { class: 'fam-title' });
  const back = h('button', { class: 'icon-btn', 'aria-label': 'Back', hidden: true, onclick: () => { const w = stack.pop(); if (w) show(w, true); } }, icon('back', 22));
  const body = h('div', { class: 'fam-body' });
  const sheet = h('div', { class: 'fam-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Word family' },
    h('div', { class: 'fam-grab' }),
    h('header', { class: 'fam-head' }, back,
      h('div', { class: 'fam-head-t' }, h('span', { class: 'fam-eyebrow' }, 'Word family'), title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x', 22))),
    body);
  const overlay = h('div', { class: 'fam-overlay', onclick: e => { if (e.target === overlay) close(); } }, sheet);

  const onKey = e => {
    e.stopPropagation();                       // keep reels / study shortcuts from firing behind the sheet
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  function close() {
    token++;
    document.removeEventListener('keydown', onKey, true);
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
    if (current && current.overlay === overlay) current = null;
  }
  current = { close, overlay };

  const chip = (w, cls = '') => h('button', { class: 'fam-chip ' + cls, type: 'button', onclick: () => show(w) }, w);
  const section = (label, content, hint) => h('section', { class: 'fam-sec' },
    h('h3', null, label, hint ? h('small', null, hint) : null), content);
  const none = t => h('p', { class: 'muted small' }, t);

  function render(d) {
    const blocks = [];

    // Anatomy
    const meta = [];
    if (d.pos && d.pos.length) meta.push(d.pos.map(p => ({ n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' }[p])).join(' / '));
    if (d.syllables) meta.push(d.syllables + (d.syllables === 1 ? ' syllable' : ' syllables'));
    meta.push(d.letters + ' letters');
    const anat = [h('p', { class: 'muted small' }, meta.join(' · '))];
    if (d.parts) {
      anat.push(h('div', { class: 'fam-parts' }, d.parts.flatMap((p, i) => [
        i ? h('span', { class: 'fam-plus' }, '+') : null,
        h('div', { class: 'fam-part ' + p.role }, h('strong', null, p.text), h('small', null, ROLE_LABEL[p.role]))
      ])));
      if (d.partsGuessed) anat.push(none('Estimated from related words'));
    }
    if (d.origin) anat.push(h('p', { class: 'fam-origin' }, d.origin + (d.origin.length >= 260 ? '…' : '')));
    blocks.push(section('Anatomy', anat));

    // Tenses
    if (d.verb) {
      const v = d.verb, base = d.word;
      const rows = [
        ['Base', base], ['He / she / it', v.third], ['-ing form', v.ing], ['Past', v.past], ['Past participle', v.pp]
      ].filter(r => r[1]);
      const ex = [
        ['Simple present', `I ${base} · it ${v.third || base + 's'}`],
        ['Present continuous', `is / are ${v.ing || ''}`],
        ['Simple past', v.past],
        ['Present perfect', `has / have ${v.pp || ''}`],
        ['Future', `will ${base}`]
      ].filter(r => r[1] && !/(\s)$/.test(r[1]));
      blocks.push(section('Tenses', [
        h('div', { class: 'fam-forms' }, rows.map(([k, val]) => h('div', { class: 'fam-form' }, h('small', null, k), h('strong', null, val)))),
        h('div', { class: 'fam-tenses' }, ex.map(([k, val]) => h('div', null, h('span', null, k), h('b', null, val)))),
        v.guessed ? none('Regular pattern — check an irregular verb list if unsure') : null
      ]));
    }

    // Noun / adjective forms
    const other = d.otherForms || [];
    if (other.length) {
      blocks.push(section('Forms', h('div', { class: 'fam-forms' }, other.flatMap(f => [
        f.plural ? h('div', { class: 'fam-form' }, h('small', null, 'Plural'), h('strong', null, f.plural)) : null,
        f.note ? h('div', { class: 'fam-form' }, h('small', null, 'Noun'), h('strong', null, f.note)) : null,
        f.comparative ? h('div', { class: 'fam-form' }, h('small', null, 'Comparative'), h('strong', null, f.comparative)) : null,
        f.superlative ? h('div', { class: 'fam-form' }, h('small', null, 'Superlative'), h('strong', null, f.superlative)) : null
      ]))));
    }

    blocks.push(section('Synonyms', d.synonyms.length ? h('div', { class: 'fam-chips' }, d.synonyms.map(w => chip(w))) : none('None found'), 'similar meaning'));
    blocks.push(section('Opposites', d.antonyms.length ? h('div', { class: 'fam-chips' }, d.antonyms.map(w => chip(w, 'opp'))) : none('None found'), 'opposite meaning'));

    const groups = ['n', 'v', 'adj', 'adv'].filter(p => d.family[p] && d.family[p].length);
    blocks.push(section('Word family', groups.length
      ? h('div', { class: 'fam-groups' }, groups.map(p => h('div', { class: 'fam-group' }, h('small', null, POS_LABEL[p]), h('div', { class: 'fam-chips' }, d.family[p].map(w => chip(w))))))
      : none('No related forms found'), 'same root'));

    if (!d.complete) blocks.push(h('div', { class: 'center' }, h('button', { class: 'btn ghost', onclick: () => show(shown, true, true) }, 'Some parts were unavailable · Retry')));
    body.replaceChildren(...blocks);
  }

  async function show(w, isBack = false, force = false) {
    w = clean(w);
    if (!isBack && shown && w !== shown) stack.push(shown);
    shown = w;
    back.hidden = !stack.length;
    title.textContent = w;
    body.scrollTop = 0;
    const my = ++token;
    if (force) mem.delete(w);
    body.replaceChildren(h('div', { class: 'sk-def', 'aria-busy': 'true', 'aria-label': 'Loading' },
      h('span', { class: 'sk sk-line w40' }), h('span', { class: 'sk sk-line w100' }), h('span', { class: 'sk sk-line w80' }),
      h('span', { class: 'sk sk-line w60' }), h('span', { class: 'sk sk-line w100' })));
    const d = await lookup(w);
    if (my !== token) return;
    if (d.failed) {
      body.replaceChildren(h('div', { class: 'state error', role: 'alert' }, h('span', { class: 'state-ico' }, icon('alert', 30)),
        h('div', { class: 'state-label' }, 'Offline'),
        h('button', { class: 'btn', onclick: () => show(w, true, true) }, 'Retry')));
      return;
    }
    render(d);
  }

  show(shown, true);
}

// The family icon button used in lists, reels and cards.
export function familyButton(word, cls = 'icon-btn', size = 20) {
  return h('button', {
    class: cls + ' fam-btn', type: 'button', 'aria-label': 'Word family of ' + word, title: 'Word family',
    onclick: e => { e.stopPropagation(); openFamily(word); }
  }, icon('family', size));
}
