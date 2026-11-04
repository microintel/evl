import * as store from '../store.js';
import * as dict from '../dictionary.js';
import { speak, supported } from '../speech.js';
import { h, icon, listBar, listLegend, defBlock, state, toast, skeleton, copyWords } from '../ui.js';
import { getList } from '../data.js';
import { dotClass } from './lists.js';
import { familyButton } from '../family.js';

const MODES = [
  ['mixed', 'Learn', 'mixed'],
  ['flash', 'Cards', 'cards'],
  ['quiz', 'Quiz', 'quiz'],
  ['spell', 'Spell', 'spell']
];

const DAY = 864e5;
// "Your plan": three steps and one big button that always says what to do next.
function guide(L, s, prog) {
  const stage = s.learnt === s.total ? 2 : s.new > 0 ? 0 : 1;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const dues = L.words.map(w => store.rec(w.id)).filter(r => r && r.box < store.MASTERED).map(r => r.due);
  const nd = dues.length ? Math.min(...dues) : 0;
  const days = Math.max(1, Math.round((nd - t0.getTime()) / DAY));
  const when = days <= 1 ? 'tomorrow' : `in ${days} days`;

  const steps = [
    ['Learn the new words', `Tap Reveal to see the meaning. Don't know it? Tap Again, it comes back until you get it.`],
    ['Review when words are due', 'Each word returns tomorrow, then a few days later. Right answers move it up.'],
    ['All words learnt', 'Get each word right once and it turns green. All green means the list is complete. Keep reviewing to master them.']
  ];
  const cta = stage === 2
    ? [h('div', { class: 'guide-done' }, icon('check', 22), `List complete · ${s.mastered}/${s.total} mastered`),
       s.due > 0 ? h('a', { class: 'btn wide guide-go', href: `#/study/${L.id}/mixed` }, icon('review', 18), `Review ${s.due} due word${s.due === 1 ? '' : 's'}`) : null]
    : s.new > 0
      ? h('a', { class: 'btn primary wide guide-go', href: `#/study/${L.id}/mixed` }, icon('play', 18), `Learn ${s.new} new word${s.new === 1 ? '' : 's'}`)
      : s.due > 0
        ? h('a', { class: 'btn primary wide guide-go', href: `#/study/${L.id}/mixed` }, icon('review', 18), `Review ${s.due} due word${s.due === 1 ? '' : 's'}`)
        : h('div', { class: 'guide-wait' }, icon('review', 20), h('div', null, h('strong', null, 'Nothing due right now'), h('small', null, `Next review ${when}. Come back then.`)));

  const card = h('section', { class: 'card guide' },
    h('strong', null, 'Your plan'),
    prog,
    h('ol', { class: 'guide-steps' }, steps.map(([title, text], i) =>
      h('li', { class: 'gs' + (i < stage || stage === 2 ? ' done' : i === stage ? ' now' : '') },
        h('span', { class: 'gs-n' }, i < stage || stage === 2 ? icon('check', 16) : String(i + 1)),
        h('div', null, h('strong', null, title), i === stage ? h('p', { class: 'muted small' }, text) : null)))));
  return [card, h('div', { class: 'cta-dock' }, cta)];
}

export function list(root, { id }) {
  const L = getList(id);
  if (!L) { location.replace('#/lists'); return; }
  const s = store.listStats(L);
  const prog = h('div', { class: 'prog' });
  const sub = h('p', { class: 'sub' });
  function paintProgress() {
    const st = store.listStats(L);
    prog.replaceChildren(listBar(st, 'thick'), listLegend(st));
    sub.textContent = `${st.read} opened · ${st.learnt} learnt · ${st.mastered} mastered`;
  }
  paintProgress();

  const rows = L.words.map(w => {
    const panel = h('div', { class: 'row-panel', hidden: true });
    let loaded = false;
    const r = store.rec(w.id);
    const dot = h('span', { class: 'dot ' + dotClass(store.level(w.id)) });
    const row = h('div', { class: 'row-wrap' },
      h('div', { class: 'row', role: 'button', tabindex: '0', onclick: toggle, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } },
        dot,
        h('span', { class: 'grow word' }, w.word),
        r ? h('span', { class: 'muted small' }, `${r.right}✓ ${r.wrong}✗`) : null,
        familyButton(w.word),
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
      if (!panel.hidden) {
        if (store.markOpened(w.id)) { dot.className = 'dot ' + dotClass(store.level(w.id)); paintProgress(); }
        if (!loaded) load();
      }
    }
    return row;
  });

  root.append(
    h('a', { class: 'back', href: '#/lists' }, icon('back', 20), 'Lists'),
    h('header', { class: 'page-head' },
      h('div', null, h('h1', null, `List ${L.id}`), sub)),
    ...guide(L, s, prog),
    h('details', { class: 'practice' },
      h('summary', null, 'Practise another way', icon('chevron', 18)),
      h('section', { class: 'modes' }, MODES.map(([mode, label, ic]) =>
        h('a', { class: 'mode card', href: `#/study/${L.id}/${mode}` },
          icon(ic, 24), h('div', { class: 'mode-title' }, label))))),
    h('div', { class: 'row-between' },
      h('h2', { class: 'section-title' }, 'Words'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => copyWords(L.words) }, icon('copy', 18), 'Copy words')),
    h('div', { class: 'card rows' }, rows),
    h('div', { class: 'center pad' }, h('button', {
      class: 'btn ghost',
      onclick: async () => {
        if (confirm(`Reset all progress for List ${L.id}?`)) { await store.resetList(L.id); toast('Reset', 'success'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
      }
    }, 'Reset this list')),
    h('div', { class: 'dock-space' }));
}
