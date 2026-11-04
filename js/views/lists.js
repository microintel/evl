import * as store from '../store.js';
import { h, listBar, listLegend, pageHead, icon, state, copyWords } from '../ui.js';
import { LISTS, WORDS } from '../data.js';

const FILTERS = [['all', 'All'], ['progress', 'In progress'], ['new', 'Not started'], ['done', 'Completed']];

export function lists(root) {
  let filter = 'all';
  let q = '';
  const out = h('div');

  const search = h('label', { class: 'search' }, icon('search', 20),
    h('input', {
      class: 'input', type: 'search', placeholder: 'Search', autocomplete: 'off', spellcheck: 'false',
      oninput: e => { q = e.target.value.trim().toLowerCase(); paint(); }
    }));
  const chips = h('div', { class: 'chips' });

  function paintChips() {
    chips.replaceChildren(...FILTERS.map(([k, label]) =>
      h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; paintChips(); paint(); } }, label)));
  }

  function paint() {
    if (q) return paintSearch();
    const cards = LISTS.map(l => ({ l, s: store.listStats(l) })).filter(({ s }) => {
      if (filter === 'progress') return s.read > 0 && s.learnt < s.total;
      if (filter === 'new') return s.read === 0;
      if (filter === 'done') return s.learnt === s.total;
      return true;
    });
    if (!cards.length) return out.replaceChildren(state('empty', 'None'));
    out.replaceChildren(h('div', { class: 'list-grid' }, cards.map(({ l, s }) =>
      h('a', { class: 'list-card card' + (s.learnt === s.total ? ' complete' : ''), href: '#/list/' + l.id },
        h('div', { class: 'row-between' },
          h('span', { class: 'eyebrow' }, 'List', s.learnt === s.total ? h('span', { class: 'done-tick' }, icon('check', 14)) : null),
          h('span', { class: 'card-actions' },
            s.due ? h('span', { class: 'badge' }, `${s.due} due`) : null,
            h('button', {
              class: 'icon-btn sm', type: 'button', 'aria-label': `Copy words of List ${l.id}`, title: 'Copy words',
              onclick: e => { e.preventDefault(); e.stopPropagation(); copyWords(l.words); }
            }, icon('copy', 18)))),
        h('div', { class: 'list-num' }, String(l.id)),
        listBar(s),
        listLegend(s)))));
  }

  function paintSearch() {
    const hits = [];
    for (const w of WORDS.values()) {
      if (w.word.toLowerCase().includes(q)) { hits.push(w); if (hits.length >= 80) break; }
    }
    if (!hits.length) return out.replaceChildren(state('empty', 'No match'));
    out.replaceChildren(h('div', { class: 'card rows' }, hits.map(w =>
      h('a', { class: 'row', href: '#/list/' + w.list },
        h('span', { class: 'dot ' + dotClass(store.level(w.id)) }),
        h('span', { class: 'grow word' }, w.word),
        h('span', { class: 'muted small' }, 'List ' + w.list),
        icon('chevron', 18)))));
  }

  root.append(
    pageHead('Lists', `${LISTS.length} lists · ${WORDS.size} words`),
    h('div', { class: 'toolbar' }, search, chips),
    out);
  paintChips();
  paint();
}

export const dotClass = s => (s === 'mastered' ? 'm' : s === 'learnt' ? 'g' : s === 'opened' ? 'o' : s === 'learning' ? 'l' : 'n');
