// 60-second timed challenge: answer as many "which word fits this meaning?" questions as you can. High score is saved.
import * as dict from '../dictionary.js';
import * as R from '../rewards.js';
import { h, icon, shuffle, sample, mask, state } from '../ui.js';
import { LISTS } from '../data.js';

const SECONDS = 60;

export function blitz(root) {
  document.body.classList.add('studying');
  const ALL = LISTS.flatMap(l => l.words);
  let alive = true, score = 0, left = SECONDS, running = false, interval = null, filling = false, fails = 0, locked = false;
  let buffer = [];
  const shell = h('div', { class: 'study bz' });
  root.append(shell);
  const exit = () => location.replace('#/tools');

  // Questions are prepared ahead of time so the clock never waits on the network.
  const pickWord = () => {
    const local = ALL.filter(w => dict.peek(w.word));
    const pool = fails >= 4 && local.length >= 4 ? local : ALL;
    return pool[Math.floor(Math.random() * pool.length)];
  };
  async function fill() {
    if (filling) return;
    filling = true;
    while (alive && buffer.length < 3 && fails < 12) {
      const w = pickWord();
      if (buffer.some(q => q.w.id === w.id)) continue;
      const d = await dict.lookup(w.word);
      if (d && d.defs.length) { fails = 0; buffer.push({ w, d }); } else fails++;
    }
    filling = false;
    if (alive && !buffer.length && !running && fails >= 12) offline();
  }
  const offline = () => shell.replaceChildren(h('div', { class: 'study-body' }, state('error', 'Offline', { label: 'Back', onClick: exit })));

  /* ---------- intro ---------- */
  function intro() {
    shell.replaceChildren(
      h('header', { class: 'study-top' }, h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: exit }, icon('x', 24))),
      h('div', { class: 'study-body bz-intro' },
        h('div', { class: 'bz-big' }, '60'),
        h('h1', null, 'Timed challenge'),
        h('p', { class: 'muted' }, 'Pick the word that matches the meaning. As many as you can in 60 seconds.'),
        h('div', { class: 'bz-best' }, `Best: ${R.best()}`),
        h('button', { class: 'btn primary wide', id: 'bz-start', onclick: begin }, 'Start')));
    fill();
  }

  /* ---------- play ---------- */
  const timeEl = h('span', { class: 'bz-time' }, String(SECONDS));
  const scoreEl = h('span', { class: 'bz-score' }, '0');
  const bar = h('i', { class: 'm', style: 'width:100%' });
  function begin() {
    R.beginSession();
    score = 0; left = SECONDS; running = false; scoreEl.textContent = '0'; timeEl.textContent = String(SECONDS); bar.style.width = '100%';
    shell.replaceChildren(
      h('header', { class: 'study-top' },
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: exit }, icon('x', 24)),
        h('div', { class: 'bar thick bz-bar' }, bar), timeEl, scoreEl),
      h('div', { class: 'study-body bz-body' }, h('div', { class: 'center' }, state('loading'))));
    show();
    clearInterval(interval);
    interval = setInterval(tick, 100);
  }
  function tick() {
    if (!running) return;                                    // the clock only runs while a question is on screen
    left = Math.max(0, left - 0.1);
    const s = Math.ceil(left - 1e-6);
    if (timeEl.textContent !== String(s)) { timeEl.textContent = String(s); if (s <= 5 && s > 0) R.sound('tick'); }
    timeEl.classList.toggle('low', left <= 10);
    bar.style.width = (left / SECONDS * 100) + '%';
    if (left <= 0) end();
  }
  async function show() {
    if (!alive) return;
    running = false; locked = false;
    while (alive && !buffer.length) {
      if (fails >= 12 && !filling) return offline();
      fill();
      await new Promise(r => setTimeout(r, 120));
    }
    if (!alive) return;
    const { w, d } = buffer.shift();
    fill();
    const pool = ALL.filter(x => x.id !== w.id);
    const options = shuffle([w, ...sample(pool, 3)]);
    const def = d.defs[0];
    const btns = options.map(o => h('button', { class: 'opt', onclick: () => pick(o, btns[options.indexOf(o)]) }, h('span', { class: 'opt-word' }, o.word)));
    const body = shell.querySelector('.bz-body');
    body.replaceChildren(
      h('div', { class: 'card quiz-def' }, def.pos ? h('span', { class: 'pos' }, def.pos) : null, h('p', null, mask(def.def, w.word))),
      h('div', { class: 'opts' }, btns));
    running = true;

    function pick(o, btn) {
      if (locked || !running) return;
      locked = true; running = false;
      const ok = o.id === w.id;
      btns.forEach((b, j) => { b.disabled = true; if (options[j].id === w.id) b.classList.add('right'); else if (b === btn) b.classList.add('wrong'); });
      if (ok) { score++; scoreEl.textContent = String(score); }
      R.answered(ok, btn);
      setTimeout(() => { if (alive && left > 0) show(); }, ok ? 350 : 750);
    }
  }

  /* ---------- result ---------- */
  function end() {
    running = false; clearInterval(interval);
    const record = score > 0 && R.setBest(score);
    R.endSession();
    R.sound('end');
    if (record) { R.confetti(150); R.banner('trophy', 'New high score!', `${score} words`, 3200); }
    else if (score > 0) R.confetti(40);
    shell.replaceChildren(
      h('div', { class: 'study-body summary' },
        h('div', { class: 'bz-big' }, String(score)),
        h('h2', null, score === 1 ? 'word in 60 seconds' : 'words in 60 seconds'),
        h('p', { class: record ? 'bz-record' : 'muted' }, record ? 'New high score!' : `Best: ${R.best()}`),
        h('div', { class: 'study-actions' },
          h('button', { class: 'btn primary', onclick: () => { buffer = buffer.slice(0, 3); begin(); } }, 'Play again'),
          h('button', { class: 'btn', onclick: exit }, 'Done'))));
    if (score > 0) R.sessionDone();
  }

  intro();

  return () => {
    alive = false; clearInterval(interval);
    R.endSession();
    document.body.classList.remove('studying');
  };
}
