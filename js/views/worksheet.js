import * as store from '../store.js';
import { h, icon, pageHead, toast } from '../ui.js';
import { LISTS } from '../data.js';
import { Page, buildPdf, download } from '../pdf.js';

const PER_DAY = [10, 20, 30, 50, 100];
// LISTS is filled after the app boots, so build this lazily (never at import time).
const allWords = () => LISTS.flatMap(l => l.words);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? Math.round(+v) : lo));
const totalDays = perDay => Math.ceil(allWords().length / perDay);

// Day d = words (d-1)*perDay+1 .. d*perDay. Returns [{ day, words: [wordObj] }]
function select(o) {
  const ALL = allWords();
  const n = clamp(o.perDay, 1, 500), max = totalDays(n);
  const keep = w => o.filter === 'all' || store.status(w.id) !== 'mastered';
  let a = 1, b = max, cap = Infinity;
  if (o.source === 'range') { a = clamp(Math.min(o.from, o.to), 1, max); b = clamp(Math.max(o.from, o.to), 1, max); }
  if (o.source === 'count') { a = clamp(o.start, 1, max); cap = clamp(o.count, 1, ALL.length); }
  const days = [];
  for (let d = a; d <= b && cap > 0; d++) {
    let ws = ALL.slice((d - 1) * n, d * n).filter(keep);
    if (ws.length > cap) ws = ws.slice(0, cap);
    cap -= ws.length;
    if (ws.length) days.push({ day: d, words: ws });
  }
  return days;
}

const ROWS_PER_PAGE = 25;
const pagesFor = days => days.reduce((n, d) => n + Math.ceil(d.words.length / ROWS_PER_PAGE), 0);

const tick = () => new Promise(r => setTimeout(r, 0));
const wait = ms => new Promise(r => setTimeout(r, ms));

async function makePdf(days, boxes, onProgress = () => {}) {
  const total = pagesFor(days);
  const W = 841.89, H = 595.28, M = 28;
  const snW = 30, wordW = 120, rowH = 18, headH = 22;
  const boxW = (W - 2 * M - snW - wordW) / boxes;
  const pages = [];
  for (const d of days) {
    const parts = Math.ceil(d.words.length / ROWS_PER_PAGE);
    for (let i = 0; i < d.words.length; i += ROWS_PER_PAGE) {
      const chunk = d.words.slice(i, i + ROWS_PER_PAGE);
      const p = new Page(W, H);
      p.text(`Day ${d.day}`, M, M + 16, 20, { bold: true });
      p.text(`EVL Vocabulary Worksheet - ${d.words.length} words` + (parts > 1 ? ` (page ${i / ROWS_PER_PAGE + 1} of ${parts})` : ''), M, M + 30, 9, { gray: 0.4 });
      p.text('Name: ______________________', W - M - 330, M + 14, 10);
      p.text('Month: ______________', W - M - 120, M + 14, 10);
      const top = M + 44, left = M, right = W - M;
      const bottom = top + headH + chunk.length * rowH;
      p.rect(left, top, right - left, headH, 0.9);
      p.text('No.', left + snW / 2, top + 14, 9, { bold: true, align: 'center' });
      p.text('Word', left + snW + 8, top + 14, 9, { bold: true });
      for (let b = 0; b < boxes; b++) p.text(String(b + 1), left + snW + wordW + boxW * (b + 0.5), top + 14, boxes > 31 ? 6 : 7.5, { bold: true, align: 'center' });
      for (let r = 0; r <= chunk.length; r++) p.line(left, top + headH + r * rowH, right, top + headH + r * rowH);
      p.line(left, top, right, top); p.line(left, top, left, bottom); p.line(right, top, right, bottom);
      p.line(left + snW, top, left + snW, bottom); p.line(left + snW + wordW, top, left + snW + wordW, bottom);
      for (let b = 1; b < boxes; b++) p.line(left + snW + wordW + b * boxW, top, left + snW + wordW + b * boxW, bottom, 0.4, 0.7);
      chunk.forEach((w, r) => {
        const y = top + headH + r * rowH + 13;
        p.text(String(i + r + 1), left + snW / 2, y, 9.5, { align: 'center' });
        p.text(w.word, left + snW + 8, y, 10.5, { bold: true });
      });
      p.text('Tick a box each day you practise the word.', M, H - M + 6, 8, { gray: 0.45 });
      p.text('EVL - English Vocabulary Learning - Microintel', W - M, H - M + 6, 8, { gray: 0.45, align: 'right' });
      pages.push(p);
      onProgress(pages.length / total);
      if (pages.length % 3 === 0) await tick();
    }
  }
  return buildPdf(pages);
}

export function worksheet(root) {
  const ALL = allWords();
  const goal = store.settings().goal;
  const o = { source: 'all', perDay: goal, from: 1, to: 1, start: 1, count: 100, filter: 'all', boxes: 30 };

  const max = () => totalDays(clamp(o.perDay, 1, 500));
  const num = (key, lo, hi, after) => h('input', {
    class: 'input', type: 'number', inputmode: 'numeric', min: lo, max: typeof hi === 'function' ? hi() : hi, value: o[key],
    oninput: e => { o[key] = e.target.value === '' ? '' : +e.target.value; paintSummary(); },
    onblur: e => { const m = typeof hi === 'function' ? hi() : hi; o[key] = clamp(o[key] === '' ? lo : o[key], lo, m); e.target.value = o[key]; if (after) after(); paintSummary(); }
  });
  const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'eyebrow' }, label), input);
  const perDayBox = h('div', { class: 'perday' });
  function paintPerDay() {
    const input = num('perDay', 1, 500, () => { paintPerDay(); paintSummary(); });
    perDayBox.replaceChildren(
      field('Words per day', input),
      h('div', { class: 'chips' }, PER_DAY.map(n =>
        h('button', { class: 'chip' + (o.perDay === n ? ' on' : ''), onclick: () => { o.perDay = n; paintPerDay(); paintSummary(); } }, String(n)))));
  }

  let busy = false;
  const summary = h('div', { class: 'muted' });
  const btn = h('button', { class: 'btn primary wide', onclick: generate }, icon('download', 18), 'Download PDF');
  const current = () => select(o);
  function paintSummary() {
    const days = current();
    const words = days.reduce((n, d) => n + d.words.length, 0), pages = pagesFor(days);
    summary.textContent = words ? `${days.length} day${days.length > 1 ? 's' : ''} · ${words} words · ${pages} page${pages > 1 ? 's' : ''}` : 'No words match';
    btn.disabled = !words || pages > 1000;
    if (pages > 1000) summary.textContent += ' (too many pages, increase words per day)';
  }
  async function generate() {
    const days = current();
    if (!days.length || busy) return;
    busy = true;
    const STEPS = ['Collecting words', 'Drawing day sheets', 'Adding tracker boxes', 'Finishing PDF'];
    const pages = pagesFor(days);
    const fill = h('i', { class: 'm', style: 'width:0%' });
    const pct = h('strong', null, '0%');
    const label = h('div', { class: 'gen-title' }, STEPS[0] + '…');
    const counter = h('span', { class: 'muted small' }, `Page 0 / ${pages}`);
    const steps = STEPS.map(t => h('li', null, h('span', { class: 'gen-dot' }), t));
    const sheet = h('div', { class: 'gen-sheet', 'aria-hidden': 'true' },
      h('div', { class: 'gen-scan' }),
      Array.from({ length: 7 }, (_, r) => h('div', { class: 'gen-row' },
        h('b', { style: `animation-delay:${r * 0.22}s` }),
        Array.from({ length: 10 }, (_, c) => h('i', { style: `animation-delay:${r * 0.22 + c * 0.09}s` })))));
    const card = h('div', { class: 'gen-card card', role: 'status', 'aria-live': 'polite' },
      sheet, label,
      h('div', { class: 'bar thick gen-bar' }, fill, h('span', { class: 'gen-shine' })),
      h('div', { class: 'row-between' }, counter, pct),
      h('ul', { class: 'gen-steps' }, steps));
    const overlay = h('div', { class: 'gen' }, card);
    document.body.append(overlay);
    const stageAt = p => (p < 0.22 ? 0 : p < 0.58 ? 1 : p < 0.9 ? 2 : 3);
    const paint = p => {
      fill.style.width = (p * 100).toFixed(1) + '%';
      pct.textContent = Math.floor(p * 100) + '%';
      counter.textContent = `Page ${Math.min(pages, Math.round(p * pages))} / ${pages}`;
      const st = stageAt(p);
      label.textContent = STEPS[st] + '…';
      steps.forEach((li, i) => { li.className = i < st ? 'ok' : i === st ? 'on' : ''; });
    };
    try {
      const DURATION = Math.min(8000, 4200 + pages * 10);   // deliberately unhurried so the animation reads
      const t0 = Date.now();
      const made = makePdf(days, clamp(o.boxes, 1, 40));
      let ready = false;
      made.then(() => { ready = true; });
      for (;;) {
        await wait(40);
        const t = Math.min(1, (Date.now() - t0) / DURATION);
        paint(ready || t < 0.96 ? t : 0.96);
        if (t >= 1 && ready) break;
      }
      const blob = await made;
      paint(1);
      await wait(350);
      card.classList.add('done');
      label.textContent = 'Worksheet ready';
      sheet.replaceWith(h('span', { class: 'big-icon gen-ok' }, icon('check', 40)));
      const first = days[0].day, last = days[days.length - 1].day;
      const name = `EVL-worksheet-day-${first}${last !== first ? '-' + last : ''}.pdf`;
      const url = URL.createObjectURL(blob);
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      const save = async () => {
        const file = new File([blob], name, { type: 'application/pdf' });
        if ((ios || standalone) && navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
        }
        const a = h('a', { href: url, download: name });
        document.body.append(a); a.click(); a.remove();
      };
      // Browsers only allow a download from a tap, so the user gets a Save button (desktop also auto-saves).
      if (!ios && !standalone) save();
      await new Promise(done => {
        card.append(
          h('button', { class: 'btn primary wide', onclick: save }, icon('download', 18), 'Save PDF'),
          h('div', { class: 'btn-row gen-row2' },
            h('a', { class: 'btn grow', href: url, target: '_blank', rel: 'noopener' }, 'Open'),
            h('button', { class: 'btn ghost grow', onclick: done }, 'Close')));
      });
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { console.error(e); toast('Failed', 'error'); }
    overlay.classList.add('out');
    await wait(200);
    overlay.remove();
    busy = false;
  }

  root.append(
    h('a', { class: 'back', href: '#/tools' }, icon('back', 20), 'Tools'),
    pageHead('Worksheet', `${ALL.length} words`),
    h('section', { class: 'card' }, perDayBox),
    h('section', { class: 'card' }, summary, btn));
  paintPerDay();
  paintSummary();
}
