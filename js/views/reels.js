import * as dict from '../dictionary.js';
import * as store from '../store.js';
import { speak, stop, supported } from '../speech.js';
import { h, icon, pageHead, shuffle, state } from '../ui.js';
import { LISTS } from '../data.js';
import * as db from '../db.js';

const PER_DAY = [10, 20, 30, 50, 100];
const PALETTE = ['#2f45c9', '#0f7a45', '#a85f00', '#b3325a', '#6a35c2', '#0c7585', '#8a3b12', '#2b5d8f'];
const BATCH = 8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? Math.round(+v) : lo));
const allWords = () => LISTS.flatMap(l => l.words);   // built lazily: LISTS fills after boot
const totalDays = pd => Math.ceil(allWords().length / pd);

/* ---------- remembered mode + serial position (stored in the existing 'meta' store) ---------- */
const PREFS_KEY = 'reels';
let prefs = null;                                   // { mode: 'random' | 'serial', serial: { pd, a, b, idx } | null }
async function loadPrefs() {
  if (prefs) return prefs;
  prefs = { mode: 'random', serial: null };
  try { const r = await db.get('meta', PREFS_KEY); if (r && r.value) prefs = { ...prefs, ...r.value }; } catch { /* storage unavailable */ }
  return prefs;
}
function savePrefs(patch) {
  prefs = { mode: 'random', serial: null, ...(prefs || {}), ...patch };
  db.put('meta', { key: PREFS_KEY, value: prefs }).catch(() => {});
}
const validSaved = s => !!s && [s.pd, s.a, s.b, s.idx].every(Number.isInteger) && s.idx >= 0 && s.idx < allWords().length;

/* ---------- setup screen: minimal — mode, words per day, day range ---------- */
export async function reelsSetup(root) {
  await loadPrefs();
  let mode = prefs.mode === 'serial' ? 'serial' : 'random';
  const o = { perDay: store.settings().goal, from: 1, to: 0 };
  o.to = totalDays(o.perDay);
  const max = () => totalDays(clamp(o.perDay, 1, 500));
  const inRange = () => {
    const pd = clamp(o.perDay, 1, 500), m = max();
    const a = clamp(Math.min(o.from, o.to), 1, m), b = clamp(Math.max(o.from, o.to), 1, m);
    return { pd, a, b, words: Math.max(0, Math.min(b * pd, allWords().length) - (a - 1) * pd) };
  };
  const num = (key, lo, hi, label) => h('input', {
    class: 'rs-in', type: 'number', inputmode: 'numeric', 'aria-label': label, min: lo, max: typeof hi === 'function' ? hi() : hi, value: o[key],
    oninput: e => { o[key] = e.target.value === '' ? '' : +e.target.value; paintSummary(); },
    onblur: e => { const m = typeof hi === 'function' ? hi() : hi; o[key] = clamp(o[key] === '' ? lo : o[key], lo, m); e.target.value = o[key]; paintSummary(); }
  });

  const pdBox = h('div', { class: 'rs-opts' });
  const rangeBox = h('div', { class: 'rs-days' });
  function paintPd() {
    pdBox.replaceChildren(
      ...PER_DAY.map(n => h('button', { class: 'rs-opt' + (o.perDay === n ? ' on' : ''), onclick: () => { o.perDay = n; resetRange(); } }, String(n))),
      h('input', {
        class: 'rs-in', type: 'number', inputmode: 'numeric', 'aria-label': 'Custom words per day', min: 1, max: 500, value: o.perDay,
        oninput: e => { o.perDay = e.target.value === '' ? '' : +e.target.value; paintSummary(); },
        onblur: () => { o.perDay = clamp(o.perDay === '' ? 1 : o.perDay, 1, 500); resetRange(); }
      }));
  }
  function resetRange() { o.from = 1; o.to = max(); paintPd(); paintRange(); paintSummary(); }
  function paintRange() { rangeBox.replaceChildren(num('from', 1, max, 'From day'), h('span', { class: 'rs-dash' }, '–'), num('to', 1, max, 'To day')); }

  const summary = h('p', { class: 'rs-sum' });
  const go = h('button', { class: 'btn primary wide', onclick: () => {
    const r = inRange();
    location.hash = mode === 'serial' ? `#/reels/${r.pd}/${r.a}/${r.b}/serial` : `#/reels/${r.pd}/${r.a}/${r.b}`;
  } });
  function paintSummary() {
    const r = inRange();
    summary.textContent = r.words ? `${r.words} words · ${mode === 'serial' ? 'in order' : 'random'}` : 'No words match';
    go.textContent = mode === 'serial' ? `Start from day ${r.a}` : 'Start';
    go.disabled = !r.words;
  }

  const tabs = h('div', { class: 'rs-tabs', role: 'tablist' });
  const resumeBox = h('div');
  function paintResume() {
    const sv = prefs.serial;
    resumeBox.hidden = !(mode === 'serial' && validSaved(sv));
    if (resumeBox.hidden) return;
    const day = Math.floor(sv.idx / sv.pd) + 1;
    const total = Math.max(1, Math.min(sv.b * sv.pd, allWords().length) - (sv.a - 1) * sv.pd);
    const pos = Math.min(total, sv.idx - (sv.a - 1) * sv.pd + 1);
    resumeBox.replaceChildren(h('button', { class: 'rs-resume', onclick: () => { location.hash = `#/reels/${sv.pd}/${sv.a}/${sv.b}/serial/${sv.idx}`; } },
      h('span', null, h('strong', null, 'Continue'), h('small', null, `${allWords()[sv.idx].word} · day ${day} · ${pos}/${total}`)),
      icon('chevron', 20)));
  }
  function paintMode() {
    tabs.replaceChildren(...[['random', 'Random'], ['serial', 'Serial']].map(([k, label]) =>
      h('button', { class: mode === k ? 'on' : '', role: 'tab', 'aria-selected': mode === k ? 'true' : 'false',
        onclick: () => { if (mode === k) return; mode = k; savePrefs({ mode }); paintMode(); paintSummary(); paintResume(); } }, label)));
  }

  root.append(
    pageHead('Reels'),
    h('div', { class: 'rs' },
      tabs,
      resumeBox,
      h('div', { class: 'rs-row' }, h('span', { class: 'rs-label' }, 'Words per day'), pdBox),
      h('div', { class: 'rs-row' }, h('span', { class: 'rs-label' }, 'Days'), rangeBox),
      h('div', { class: 'rs-foot' }, summary, go)));
  paintMode(); paintPd(); paintRange(); paintSummary(); paintResume();
}

/* ---------- the reels player (Swiper.js, with a native scroll-snap fallback) ---------- */
// Swiper is loaded from the jsDelivr CDN and cached by the service worker, so it also works offline after the first load.
const SWIPER_URL = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';
let swiperPromise = null;
function loadSwiper() {
  if (!swiperPromise) {
    swiperPromise = Promise.race([
      import(SWIPER_URL).then(m => m.default || m.Swiper),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Swiper timeout')), 6000))
    ]).catch(e => { swiperPromise = null; throw e; });
  }
  return swiperPromise;
}

export function reelsPlay(root, params) {
  const pd = clamp(params.pd, 1, 500), m = totalDays(pd);
  const a = clamp(Math.min(params.from, params.to), 1, m), b = clamp(Math.max(params.from, params.to), 1, m);
  const ALL = allWords();
  const serial = params.mode === 'serial';
  const pool = [];
  for (let i = (a - 1) * pd; i < Math.min(b * pd, ALL.length); i++) pool.push({ w: ALL[i], day: Math.floor(i / pd) + 1, gi: i });
  if (!pool.length) { location.replace('#/reels'); return; }
  const queue = serial ? pool : shuffle(pool);   // random: shuffled once -> a word never repeats; serial: Day a -> Day b in order
  let startAt = 0;                                // serial + saved position -> open on that word
  if (serial && params.start != null) { const at = queue.findIndex(q => q.gi === Math.round(+params.start)); if (at > 0) startAt = at; }
  const baseHash = `#/reels/${pd}/${a}/${b}/serial`;

  document.body.classList.add('studying');
  let alive = true, rendered = 0, ended = false, active = -1, sound = store.settings().speech;
  let swiper = null, io = null;

  const wrapper = h('div', { class: 'swiper-wrapper' }, h('div', { class: 'reels-loading' }, state('loading')));
  const scroller = h('div', { class: 'reels swiper', tabindex: '-1' }, wrapper);
  const counter = h('span', { class: 'reels-count' }, `1 / ${queue.length}`);
  const prog = h('i', { style: 'width:0%' });
  const soundBtn = h('button', { class: 'reels-btn', 'aria-label': 'Toggle sound', onclick: () => { sound = !sound; paintSound(); if (!sound) stop(); else if (active >= 0) speak(queue[active].w.word, true); } });
  const paintSound = () => { if (!supported) { soundBtn.hidden = true; return; } soundBtn.replaceChildren(icon(sound ? 'volume' : 'mute', 22)); soundBtn.classList.toggle('off', !sound); };
  paintSound();
  const exit = () => location.replace('#/reels');
  const top = h('header', { class: 'reels-top' },
    h('button', { class: 'reels-btn', 'aria-label': 'Close', onclick: exit }, icon('x', 22)),
    h('div', { class: 'reels-prog' }, prog), counter, soundBtn);
  root.append(scroller, top);

  const steps = [];
  function loadDef(item, box) {
    if (item.loaded) return;
    item.loaded = true;
    const paint = def => {
      if (def) {
        box.replaceChildren(...[def.phonetic ? h('p', { class: 'reel-phon' }, def.phonetic) : null,
          ...def.defs.slice(0, 2).map(d => h('div', { class: 'reel-def' },
            d.pos ? h('span', { class: 'reel-pos' }, d.pos) : null,
            h('p', null, d.def),
            d.example ? h('p', { class: 'reel-ex' }, '“' + d.example + '”') : null)),
          def.examples && def.examples.length ? h('div', { class: 'reel-def' }, h('span', { class: 'reel-pos' }, 'examples'), def.examples.map(e => h('p', { class: 'reel-ex' }, '“' + e + '”'))) : null].filter(Boolean));
      } else if (dict.failed(item.w.word)) {
        box.replaceChildren(h('div', { class: 'reel-off' }, icon('alert', 20), 'Offline',
          h('button', { class: 'reels-pill', onclick: () => { item.loaded = false; loadDef(item, box); } }, 'Retry')));
      } else box.replaceChildren(h('div', { class: 'reel-off' }, icon('inbox', 20), 'No entry'));
    };
    const cached = dict.peek(item.w.word);
    if (cached !== undefined) return paint(cached);
    box.replaceChildren(h('div', { class: 'reel-sk' }, h('span'), h('span'), h('span')));
    dict.lookup(item.w.word).then(d => { if (alive) paint(d); });
  }

  function makeReel(i) {
    const item = queue[i];
    const box = h('div', { class: 'reel-body' });
    const el = h('section', { class: 'reel swiper-slide', style: `background:${PALETTE[i % PALETTE.length]}`, 'data-i': i },
      h('div', { class: 'reel-inner' },
        h('span', { class: 'reel-day' }, `Day ${item.day}`),
        h('div', { class: 'reel-word' }, item.w.word),
        supported ? h('button', { class: 'reels-round', 'aria-label': 'Pronounce', onclick: () => speak(item.w.word, true) }, icon('volume', 26)) : null,
        box),
      i === startAt ? h('div', { class: 'reel-hint' }, h('span', { class: 'reel-up' }, icon('chevron', 22)), 'Swipe up') : null);
    steps[i] = { item, box };
    if (io) io.observe(el);
    return el;
  }

  function endReel() {
    return h('section', { class: 'reel reel-end swiper-slide', style: 'background:#111' },
      h('div', { class: 'reel-inner' },
        h('div', { class: 'big-icon' }, icon('check', 40)),
        h('div', { class: 'reel-word small' }, 'All done'),
        h('p', { class: 'reel-phon' }, serial ? `${queue.length} words, in order` : `${queue.length} words, none repeated`),
        h('div', { class: 'btn-row' },
          serial
            ? h('button', { class: 'btn primary', onclick: () => { if (location.hash === baseHash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.replace(baseHash); } }, 'Start over')
            : h('button', { class: 'btn primary', onclick: () => window.dispatchEvent(new HashChangeEvent('hashchange')) }, 'Shuffle again'),
          h('button', { class: 'btn', onclick: exit }, 'Done'))));
  }

  // Adds the next batch of reels (to the DOM before Swiper starts, via appendSlide afterwards).
  function renderMore(minEnd = 0) {
    const els = [];
    const end = Math.min(queue.length, Math.max(rendered + BATCH, minEnd));
    for (; rendered < end; rendered++) els.push(makeReel(rendered));
    if (rendered >= queue.length && !ended) { ended = true; els.push(endReel()); }
    if (swiper) swiper.appendSlide(els); else wrapper.append(...els);
  }

  function activate(i) {
    if (i === active) return;
    if (!steps[i]) { if (serial && i >= queue.length) savePrefs({ serial: null }); return; }   // reached the end -> nothing left to resume
    active = i;
    if (serial) savePrefs({ serial: { pd, a, b, idx: queue[i].gi } });
    counter.textContent = `${i + 1} / ${queue.length}`;
    prog.style.width = ((i + 1) / queue.length * 100).toFixed(1) + '%';
    loadDef(steps[i].item, steps[i].box);
    if (steps[i + 1]) loadDef(steps[i + 1].item, steps[i + 1].box);
    if (i >= rendered - 3 && rendered < queue.length) renderMore();
    if (sound) speak(queue[i].w.word, true); else stop();
  }

  const go = dir => {
    if (swiper) dir > 0 ? swiper.slideNext() : swiper.slidePrev();
    else scroller.scrollBy({ top: dir * scroller.clientHeight, behavior: 'smooth' });
  };
  const onKey = e => {
    if (e.key === 'Escape') return exit();
    const dir = ['ArrowDown', 'j', ' ', 'PageDown'].includes(e.key) ? 1 : ['ArrowUp', 'k', 'PageUp'].includes(e.key) ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    go(dir);
  };
  document.addEventListener('keydown', onKey);

  function startSwiper(Swiper) {
    wrapper.replaceChildren();
    renderMore(startAt + BATCH);
    swiper = new Swiper(scroller, {
      direction: 'vertical', slidesPerView: 1, speed: 380, initialSlide: startAt, longSwipesRatio: 0.2, resistanceRatio: 0.6,
      mousewheel: { thresholdDelta: 18, forceToAxis: true }, keyboard: false,
      on: { slideChange: s => activate(s.activeIndex) }
    });
    activate(startAt);
  }
  function startNative() {          // fallback if Swiper could not be loaded (e.g. offline on first use)
    wrapper.replaceChildren();
    scroller.classList.add('native');
    io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(+e.target.dataset.i);
    }, { root: scroller, threshold: [0.6] });
    renderMore(startAt + BATCH);
    if (startAt) scroller.scrollTop = startAt * scroller.clientHeight;
    activate(startAt);
  }
  loadSwiper().then(S => { if (alive) startSwiper(S); }).catch(() => { if (alive) startNative(); });

  return () => {
    alive = false;
    if (io) io.disconnect();
    if (swiper) { try { swiper.destroy(true, false); } catch { /* ignore */ } }
    document.body.classList.remove('studying');
    document.removeEventListener('keydown', onKey);
    stop();
  };
}
