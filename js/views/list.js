import * as store from '../store.js';
import * as dict from '../dictionary.js';
import { speak, supported } from '../speech.js';
import { h, icon, bar, defBlock, state, toast, skeleton, copyWords } from '../ui.js';
import { getList } from '../data.js';
import { dotClass } from './lists.js';

const MODES = [
  ['mixed', 'Learn', 'mixed'],
  ['flash', 'Cards', 'cards'],
  ['quiz', 'Quiz', 'quiz'],
  ['spell', 'Spell', 'spell']
];

export function list(root, { id }) {
  const L = getList(id);
  if (!L) { location.replace('#/lists'); return; }
  const s = store.listStats(L);
  const todo = s.new + s.due;

  const rows = L.words.map(w => {
    const panel = h('div', { class: 'row-panel', hidden: true });
    let loaded = false;
    const r = store.rec(w.id);
    const row = h('div', { class: 'row-wrap' },
      h('div', { class: 'row', role: 'button', tabindex: '0', onclick: toggle, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } },
        h('span', { class: 'dot ' + dotClass(store.status(w.id)) }),
        h('span', { class: 'grow word' }, w.word),
        r ? h('span', { class: 'muted small' }, `${r.right}✓ ${r.wrong}✗`) : null,
        supported ? h('button', { class: 'icon-btn', 'aria-label': 'Pronounce ' + w.word, onclick: e => { e.stopPropagation(); speak(w.word, true); } }, icon('volume', 20)) : null),
      panel);
    async function load() {
      panel.replaceChildren(skeleton('def'));
      const def = await dict.lookup(w.word);
      loaded = !!def;
      if (def) panel.replaceChildren(h('div', null, def.phonetic ? h('p', { class: 'muted' }, def.phonetic) : null, defBlock(def, 3)));
      else if (dict.failed(w.word)) panel.replaceChildren(state('error', 'Offline', { label: 'Retry', onClick: load }));
      else panel.replaceChildren(state('empty', 'No entry'));
    }
    function toggle() {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !loaded) load();
    }
    return row;
  });

  root.append(
    h('a', { class: 'back', href: '#/lists' }, icon('back', 20), 'Lists'),
    h('header', { class: 'page-head' },
      h('div', null, h('h1', null, `List ${L.id}`), h('p', { class: 'sub' }, `${s.mastered} mastered · ${s.learning} learning · ${s.new} new`))),
    h('section', { class: 'card' },
      bar(s.mastered, s.learning, s.total, 'thick'),
      h('p', { class: 'muted small' }, `${todo} to study`)),
    h('section', { class: 'modes' }, MODES.map(([mode, label, ic], i) =>
      h('a', { class: 'mode card' + (i === 0 ? ' primary' : ''), href: `#/study/${L.id}/${mode}` },
        icon(ic, 26), h('div', { class: 'mode-title' }, label)))),
    h('div', { class: 'row-between' },
      h('h2', { class: 'section-title' }, 'Words'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => copyWords(L.words) }, icon('copy', 18), 'Copy words')),
    h('div', { class: 'card rows' }, rows),
    h('div', { class: 'center pad' }, h('button', {
      class: 'btn ghost',
      onclick: async () => {
        if (confirm(`Reset all progress for List ${L.id}?`)) { await store.resetList(L.id); toast('Reset', 'success'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
      }
    }, 'Reset this list')));
}
