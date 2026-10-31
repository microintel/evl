// Vocabulary test, day by day: pick a day, say whether you know each of its words, see your results.
// Answers + finished sessions live in the existing 'meta' store, so they survive restarts and work offline.
import * as db from '../db.js';
import * as dict from '../dictionary.js';
import * as store from '../store.js';
import { speak, supported } from '../speech.js';
import { WORDS } from '../data.js';
import { h, icon, pageHead, shuffle, defBlock } from '../ui.js';

const KEY = 'tests';
let data = null;                                    // { answers: { wordId: 1 | 0 }, sessions: [{ ts, day, n, known }] }

async function load() {
  if (data) return data;
  data = { answers: {}, sessions: [] };
  try { const r = await db.get('meta', KEY); if (r && r.value) data = { ...data, ...r.value }; } catch { /* storage unavailable */ }
  return data;
}
const persist = () => db.put('meta', { key: KEY, value: data }).catch(() => {});

// Days use the same "words per day" goal as the rest of the app (Progress -> daily goal).
function layout() {
  const words = [...WORDS.values()];
  const pd = Math.max(1, Math.round(+store.settings().goal) || 20);
  return { words, pd, days: Math.ceil(words.length / pd), of: d => words.slice((d - 1) * pd, d * pd) };
}
function overall() {
  let tested = 0, known = 0;
  for (const [id, v] of Object.entries(data.answers)) { if (!WORDS.has(id)) continue; tested++; if (v === 1) known++; }
  return { total: WORDS.size, tested, known };
}
const dayStat = (L, d) => {
  const ws = L.of(d); let a = 0, k = 0;
  for (const w of ws) { const v = data.answers[w.id]; if (v !== undefined) { a++; if (v === 1) k++; } }
  return { a, k, n: ws.length };
};
const fmt = ts => new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const pctText = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';

/* ---------- overview: overall result, day grid, history ---------- */
export async function testHome(root) {
  await load();
  const L = layout(), o = overall();
  const stats = Array.from({ length: L.days }, (_, i) => dayStat(L, i + 1));
  const next = stats.findIndex(s => s.a < s.n) + 1;               // first day not fully tested (0 = all done)

  const hero = h('section', { class: 'tqh' },
    h('div', { class: 'tqh-num' }, String(o.known), h('span', { class: 'tqh-of' }, ` / ${o.total}`)),
    h('div', { class: 'tqh-cap' }, o.tested ? 'words you know' : 'Not tested yet'),
    o.tested ? h('div', { class: 'tqh-bar' }, h('i', { style: `width:${(o.known / o.total * 100).toFixed(1)}%` })) : null,
    o.tested ? h('div', { class: 'tqh-meta' }, h('span', null, `${pctText(o.known, o.tested)} of tested`), h('span', null, `${o.tested} tested`), h('span', null, `${o.total - o.tested} left`)) : null);

  const grid = h('div', { class: 'tdg' }, stats.map((s, i) => {
    const full = s.a === s.n;
    return h('button', { class: 'td' + (full ? (s.k === s.n ? ' top' : ' full') : s.a ? ' part' : ''), 'aria-label': `Day ${i + 1}`,
      onclick: () => { location.hash = `#/test/run/${i + 1}`; } },
      h('span', null, String(i + 1)), h('small', null, s.a ? pctText(s.k, s.a) : ''));
  }));

  const history = data.sessions.length
    ? h('section', { class: 'tq-hist' }, h('div', { class: 'rs-label' }, 'Past tests'),
        data.sessions.slice(0, 15).map(x => h('div', { class: 'tq-hrow' },
          h('span', { class: 'grow' }, x.day ? `Day ${x.day}` : 'Full test', h('small', { class: 'muted' }, ' · ' + fmt(x.ts))),
          h('span', { class: 'muted' }, `${x.known} / ${x.n}`),
          h('strong', null, pctText(x.known, x.n)))))
    : null;

  root.append(
    pageHead('Vocabulary test', `${L.pd} words a day · ${L.days} days`),
    h('div', { class: 'tqw' },
      hero,
      h('button', { class: 'btn primary wide', onclick: () => { location.hash = `#/test/run/${next || 1}`; } },
        !o.tested ? 'Start with Day 1' : next ? `Continue · Day ${next}` : 'Test Day 1 again'),
      h('section', { class: 'tq-days' }, h('div', { class: 'rs-label' }, 'Choose a day'), grid),
      history,
      o.tested ? h('button', { class: 'tq-end tq-clear', onclick: async () => {
        if (!confirm('Clear all test results?')) return;
        data = { answers: {}, sessions: [] }; await persist(); window.dispatchEvent(new HashChangeEvent('hashchange'));
      } }, 'Clear results') : null));
}

/* ---------- running one day's test ---------- */
export async function testRun(root, params) {
  await load();
  const L = layout();
  const day = Math.max(1, Math.min(L.days, Math.round(+params.day) || 1));
  const pick = shuffle(L.of(day)).map(w => w.id);                  // the day's words, in a shuffled order
  const n = pick.length;
  if (!n) { location.replace('#/test'); return; }
  let i = 0, known = 0, answered = 0, saved = false, alive = true;

  const prog = h('i', { style: 'width:0%' });
  const count = h('span', { class: 'tq-count' });
  const live = h('div', { class: 'tq-live' });
  const body = h('div', { class: 'tq' });
  const exit = () => { location.hash = '#/test'; };
  root.append(
    h('div', { class: 'tq-head' }, count, h('button', { class: 'tq-end', onclick: exit }, 'End')),
    h('div', { class: 'tq-prog' }, prog),
    live,
    body);

  // live result: this day's score + how many words you know overall, updated after every answer
  function paintLive() {
    const o = overall();
    live.replaceChildren(
      h('div', { class: 'tq-pct' }, answered ? pctText(known, answered) : '–'),
      h('div', { class: 'tq-sub' }, `${known} known · ${answered - known} not yet`),
      h('div', { class: 'tq-sub' }, `Overall ${o.known} / ${o.total} known`));
  }
  function saveSession() {
    if (saved || !answered) return;
    saved = true;
    data.sessions.unshift({ ts: Date.now(), day, n: answered, known });
    data.sessions.length = Math.min(data.sessions.length, 60);
    persist();
  }
  const answer = yes => {
    data.answers[pick[i]] = yes ? 1 : 0;
    answered++; if (yes) known++;
    persist(); i++; paintLive(); show();
  };

  function show() {
    count.textContent = `Day ${day} · ${Math.min(i + 1, n)} / ${n}`;
    prog.style.width = (i / n * 100) + '%';
    if (i >= n) return finish();
    const w = WORDS.get(pick[i]);
    const meaning = h('div', { class: 'tq-meaning' });
    body.replaceChildren(
      h('div', { class: 'tq-word' }, w.word),
      h('div', { class: 'tq-tools' },
        supported ? h('button', { class: 'tq-link', onclick: () => speak(w.word, true) }, 'Listen') : null,
        h('button', { class: 'tq-link', onclick: async e => {
          e.currentTarget.hidden = true;
          meaning.replaceChildren(h('span', { class: 'spinner' }));
          const d = await dict.lookup(w.word);
          if (alive) meaning.replaceChildren(defBlock(d, 2, w.word));
        } }, 'Meaning')),
      meaning,
      h('div', { class: 'grid-2 tq-answer' },
        h('button', { class: 'btn', onclick: () => answer(false) }, "Don't know"),
        h('button', { class: 'btn primary', onclick: () => answer(true) }, 'I know it')));
  }

  function finish() {
    saveSession();
    body.replaceChildren(
      h('div', { class: 'tq-result' },
        h('div', { class: 'big-icon' }, icon('check', 40)),
        h('div', { class: 'big-num' }, `${known} / ${answered}`),
        h('p', { class: 'muted' }, `Day ${day} · ${pctText(known, answered)}`),
        h('div', { class: 'btn-row' },
          day < L.days ? h('button', { class: 'btn primary', onclick: () => { location.hash = `#/test/run/${day + 1}`; } }, `Day ${day + 1}`) : null,
          h('button', { class: 'btn', onclick: exit }, 'Done'))));
  }

  const onKey = e => {
    if (i >= n) return;
    if (e.key === 'ArrowRight' || e.key === 'k') answer(true);
    else if (e.key === 'ArrowLeft' || e.key === 'd') answer(false);
  };
  document.addEventListener('keydown', onKey);
  const onHide = () => saveSession();
  window.addEventListener('pagehide', onHide);
  paintLive(); show();

  return () => {                                   // leaving early still saves what you answered
    alive = false; saveSession();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', onHide);
  };
}
