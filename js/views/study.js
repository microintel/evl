import * as store from '../store.js';
import * as dict from '../dictionary.js';
import { speak, stop, supported } from '../speech.js';
import { h, icon, shuffle, sample, mask, defBlock, kbd, state, skeleton } from '../ui.js';
import { WORDS, getList } from '../data.js';

export function study(root, { list, mode }) {
  const isReview = list === 'review';
  const listNo = isReview ? null : Number(list);
  const backHash = isReview ? '#/review' : '#/list/' + listNo;

  let ids;
  if (isReview) {
    ids = store.dueIds().slice(0, 30);
    if (!ids.length) { location.replace('#/review'); return; }
  } else {
    const L = getList(listNo);
    if (!L) { location.replace('#/lists'); return; }
    ids = L.words.map(w => w.id).filter(id => store.status(id) === 'new' || store.isDue(id));
    if (!ids.length) ids = L.words.map(w => w.id);
  }

  document.body.classList.add('studying');
  let queue = shuffle(ids).map(id => ({ id, first: true }));
  let idx = 0;
  let res = { right: 0, wrong: 0, missed: [] };
  let alive = true;
  let seq = 0;
  let keys = null;
  let timer = null;

  const shell = h('div', { class: 'study' });
  root.append(shell);
  const onKey = e => { if (e.target.tagName === 'INPUT') return; if (keys) keys(e); };
  document.addEventListener('keydown', onKey);

  const exit = () => location.replace(backHash);
  const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(() => { if (alive) fn(); }, ms); };

  function frame(content) {
    const pct = Math.round((idx / queue.length) * 100);
    shell.replaceChildren(
      h('header', { class: 'study-top' },
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: exit }, icon('x', 24)),
        h('div', { class: 'bar thick' }, h('i', { class: 'm', style: `width:${pct}%` })),
        h('span', { class: 'count' }, `${Math.min(idx + 1, queue.length)}/${queue.length}`)),
      content);
  }

  function answer(item, correct) {
    if (!item.first) return;
    store.record(item.id, correct);
    if (correct) res.right++;
    else { res.wrong++; res.missed.push(item.id); queue.push({ id: item.id, first: false }); }
  }
  const advance = () => { idx++; next(); };

  async function next() {
    if (!alive) return;
    keys = null;
    if (idx >= queue.length) return finish();
    const item = queue[idx];
    const w = WORDS.get(item.id);
    const r = store.rec(item.id);
    let kind = mode === 'mixed' ? (!r || r.box <= 1 ? 'flash' : r.box <= 3 ? 'quiz' : 'spell') : mode;
    const token = ++seq;

    if (dict.peek(w.word) === undefined) {
      frame(h('div', { class: 'study-body' }, skeleton('study')));
    }
    const def = await dict.lookup(w.word);
    if (!alive || token !== seq) return;

    if (kind === 'quiz' && !def) kind = supported ? 'spell' : 'flash';
    if (kind === 'spell' && !def && !supported) kind = 'flash';

    dict.prefetch(queue.slice(idx + 1, idx + 4).map(q => WORDS.get(q.id).word));
    ({ flash, quiz, spell })[kind](item, w, def, token);
  }

  /* ---------- flashcard ---------- */
  function flash(item, w, def) {
    let revealed = false;
    const back = h('div', { class: 'fc-back', hidden: true }, defBlock(def, 2, w.word));
    const actions = h('div', { class: 'study-actions' });
    const done = ok => { answer(item, ok); advance(); };
    const showBtn = h('button', { class: 'btn primary', onclick: reveal }, 'Reveal', kbd('Space'));
    actions.append(showBtn);

    function reveal() {
      if (revealed) return;
      revealed = true;
      back.hidden = false;
      actions.replaceChildren(
        h('button', { class: 'btn bad', onclick: () => done(false) }, 'Again', kbd('1')),
        h('button', { class: 'btn good', onclick: () => done(true) }, 'Know', kbd('2')));
    }

    frame(h('div', { class: 'study-body' },
      h('div', { class: 'fc', onclick: reveal },
        h('div', { class: 'fc-word' }, w.word),
        def?.phonetic ? h('div', { class: 'muted' }, def.phonetic) : null,
        supported ? h('button', { class: 'icon-btn big', 'aria-label': 'Pronounce', onclick: e => { e.stopPropagation(); speak(w.word, true); } }, icon('volume', 26)) : null,
        back),
      actions));
    speak(w.word);
    keys = e => {
      if (!revealed) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); } }
      else if (e.key === '1' || e.key === 'ArrowLeft') done(false);
      else if (e.key === '2' || e.key === 'ArrowRight' || e.key === 'Enter') done(true);
    };
  }

  /* ---------- quiz ---------- */
  function quiz(item, w, def) {
    const d = def.defs[0];
    const pool = getList(w.list).words.filter(x => x.id !== item.id);
    const options = shuffle([w, ...sample(pool, 3)]);
    let locked = false;
    const actions = h('div', { class: 'study-actions' });
    const btns = options.map((o, i) => h('button', { class: 'opt', onclick: () => pick(i) },
      h('span', { class: 'opt-word' }, o.word), kbd(String(i + 1))));

    function pick(i) {
      if (locked) return;
      locked = true;
      const ok = options[i].id === w.id;
      btns.forEach((b, j) => {
        b.disabled = true;
        if (options[j].id === w.id) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
      });
      answer(item, ok);
      if (ok) { speak(w.word); later(advance, 800); }
      else {
        actions.replaceChildren(h('button', { class: 'btn primary', onclick: advance }, 'Continue', kbd('Enter')));
        keys = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } };
      }
    }

    frame(h('div', { class: 'study-body' },
      h('div', { class: 'card quiz-def' }, d.pos ? h('span', { class: 'pos' }, d.pos) : null, h('p', null, mask(d.def, w.word))),
      h('div', { class: 'opts' }, btns),
      actions));
    keys = e => { const n = Number(e.key); if (n >= 1 && n <= options.length) pick(n - 1); };
  }

  /* ---------- spelling ---------- */
  function spell(item, w, def) {
    const d = def?.defs[0];
    const target = w.word.toLowerCase().replace(/\s+/g, ' ');
    const input = h('input', {
      class: 'input spell-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
      spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Type the word', placeholder: 'Type'
    });
    const result = h('div', { class: 'spell-result' });
    const actions = h('div', { class: 'study-actions' });
    let locked = false;

    const check = skip => {
      if (locked) return;
      const guess = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!skip && !guess) return;
      locked = true;
      input.disabled = true;
      const ok = !skip && guess === target;
      answer(item, ok);
      if (ok) {
        result.className = 'spell-result good';
        result.textContent = 'Correct';
        later(advance, 800);
      } else {
        result.className = 'spell-result bad';
        result.replaceChildren((!skip && guess) ? h('s', { class: 'muted' }, guess) : null, h('strong', null, w.word));
        actions.replaceChildren(h('button', { class: 'btn primary', onclick: advance }, 'Continue', kbd('Enter')));
        keys = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } };
        setTimeout(() => document.activeElement?.blur?.(), 0);
      }
    };

    actions.append(
      h('button', { class: 'btn ghost', onclick: () => check(true) }, 'Skip'),
      h('button', { class: 'btn primary', onclick: () => check(false) }, 'Check'));

    frame(h('form', { class: 'study-body', onsubmit: e => { e.preventDefault(); check(false); } },
      h('div', { class: 'center' },
        supported ? h('button', { type: 'button', class: 'icon-btn huge', 'aria-label': 'Play word', onclick: () => speak(w.word, true) }, icon('volume', 38)) : null,
        h('div', { class: 'muted' }, `${w.word.length} letters`)),
      d ? h('div', { class: 'card quiz-def' }, d.pos ? h('span', { class: 'pos' }, d.pos) : null, h('p', null, mask(d.def, w.word))) : null,
      input, result, actions));
    actions.querySelectorAll('button').forEach(b => b.setAttribute('type', 'button'));
    later(() => speak(w.word), 250);
    setTimeout(() => { if (alive) input.focus(); }, 60);
  }

  /* ---------- summary ---------- */
  function finish() {
    keys = null;
    stop();
    const total = res.right + res.wrong;
    const acc = total ? Math.round((res.right / total) * 100) : 0;
    const missed = [...new Set(res.missed)];
    shell.replaceChildren(
      h('div', { class: 'study-body summary' },
        state('success', 'Done'),
        h('div', { class: 'grid-3 tight' },
          h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, `${acc}%`), h('div', { class: 'muted' }, 'Accuracy')),
          h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, String(res.right)), h('div', { class: 'muted' }, 'Right')),
          h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, String(res.wrong)), h('div', { class: 'muted' }, 'Missed'))),
        missed.length
          ? h('div', { class: 'card' }, h('div', { class: 'chips wrap' }, missed.map(id => h('span', { class: 'chip static' }, WORDS.get(id).word))))
          : null,
        h('div', { class: 'study-actions' },
          missed.length ? h('button', {
            class: 'btn', onclick: () => {
              queue = missed.map(id => ({ id, first: false })); idx = 0; res = { right: 0, wrong: 0, missed: [] }; next();
            }
          }, 'Retry missed') : null,
          h('button', { class: 'btn primary', onclick: exit }, 'Done'))));
  }

  next();

  return () => {
    alive = false;
    clearTimeout(timer);
    document.body.classList.remove('studying');
    document.removeEventListener('keydown', onKey);
    stop();
  };
}
