import * as store from '../store.js';
import { h, bar, pageHead, toast, state } from '../ui.js';

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
import { LISTS } from '../data.js';

const LEVELS = ['Relearn', 'Seen', 'Familiar', 'Almost', 'Mastered', 'Solid'];
const GOALS = [10, 20, 30, 50, 100];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function seg(options, current, onPick) {
  const el = h('div', { class: 'seg' });
  const paint = () => el.replaceChildren(...options.map(([v, label]) =>
    h('button', { class: v === current ? 'on' : '', onclick: () => { current = v; paint(); onPick(v); } }, label)));
  paint();
  return el;
}

function toggle(checked, onChange) {
  return h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked: checked ? true : null, onchange: e => onChange(e.target.checked) }),
    h('span', { class: 'track' }));
}

export function progress(root) {
  const t = store.totals();
  const s = store.settings();
  const acc = store.accuracy();
  const days = store.recentDays(14);
  const maxDay = Math.max(1, ...days.map(d => d.reviewed));
  const boxes = store.boxCounts();
  const maxBox = Math.max(1, ...boxes);
  const hard = store.hardest(10);
  const completed = LISTS.filter(l => store.listStats(l).mastered === l.words.length).length;

  const chart = h('div', { class: 'chart' }, days.map(d =>
    h('div', { class: 'col', title: `${d.date}: ${d.reviewed}` },
      h('div', { class: 'col-bar-wrap' }, h('div', { class: 'col-bar' + (d.reviewed ? '' : ' empty'), style: `height:${Math.max(4, d.reviewed / maxDay * 100)}%` })),
      h('span', { class: 'col-label' }, DAYS[d.day.getDay()]))));

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const n = await store.importData(JSON.parse(await f.text()));
        toast(`${n} imported`, 'success');
        rerender();
      } catch (err) { toast('Import failed', 'error'); }
      e.target.value = '';
    }
  });

  root.append(
    pageHead('Progress'),
    h('section', { class: 'grid-4' },
      h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, String(t.mastered)), h('div', { class: 'muted' }, 'Mastered')),
      h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, String(store.streak())), h('div', { class: 'muted' }, 'Day streak')),
      h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, acc == null ? '–' : acc + '%'), h('div', { class: 'muted' }, 'Accuracy')),
      h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, `${completed}/${LISTS.length}`), h('div', { class: 'muted' }, 'Lists done'))),
    h('section', { class: 'card' },
      h('div', { class: 'row-between' }, h('strong', null, 'Mastery'), h('span', { class: 'muted' }, `${t.mastered} mastered · ${t.learning} learning · ${t.new} new`)),
      bar(t.mastered, t.learning, t.total, 'thick')),
    h('section', { class: 'card' }, h('strong', null, 'Last 14 days'), days.some(d => d.reviewed) ? chart : state('empty', 'No activity')),
    h('section', { class: 'card' }, h('strong', null, 'Word levels'),
      h('div', { class: 'levels' }, LEVELS.map((label, i) =>
        h('div', { class: 'level' },
          h('span', { class: 'level-name' }, label),
          h('div', { class: 'bar' }, h('i', { class: i >= store.MASTERED ? 'm' : 'l', style: `width:${boxes[i] / maxBox * 100}%` })),
          h('span', { class: 'level-n' }, String(boxes[i])))))),
    hard.length
      ? h('section', { class: 'card' }, h('strong', null, 'Trickiest words'),
          h('div', { class: 'chips wrap' }, hard.map(r =>
            h('a', { class: 'chip', href: '#/list/' + r.list }, `${r.word} · ${r.wrong}✗`))))
      : null,
    h('h2', { class: 'section-title' }, 'Settings'),
    h('section', { class: 'card rows' },
      h('div', { class: 'row static' }, h('span', { class: 'grow' }, 'Daily goal'),
        seg(GOALS.map(g => [g, String(g)]), s.goal, v => store.setSetting('goal', v))),
      h('div', { class: 'row static' }, h('span', { class: 'grow' }, 'Audio'),
        toggle(s.speech, v => store.setSetting('speech', v))),
      h('div', { class: 'row static' }, h('span', { class: 'grow' }, 'Theme'),
        seg([['light', 'White'], ['dark', 'Black']], s.theme, v => store.setSetting('theme', v)))),
    h('section', { class: 'card' },
      h('strong', null, 'Backup'),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn', onclick: () => {
            const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `evl-backup-${store.dayKey()}.json` });
            document.body.append(a); a.click(); a.remove();
            toast('Exported', 'success');
          }
        }, 'Export'),
        h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import'),
        h('button', {
          class: 'btn bad', onclick: async () => {
            if (confirm('Erase all progress?')) { await store.resetAll(); toast('Reset', 'success'); rerender(); }
          }
        }, 'Reset all'),
        fileInput)),
    h('footer', { class: 'credit center' }, h('strong', null, 'EVL'), ' · English Vocabulary Learning', h('br'), 'Developed by Microintel'));
}
