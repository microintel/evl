import * as store from '../store.js';
import { h, icon, pageHead, state } from '../ui.js';

const MODES = [['mixed', 'Mixed'], ['flash', 'Flashcards'], ['quiz', 'Quiz'], ['spell', 'Spelling']];

export function review(root) {
  const due = store.dueIds().length;
  const up = store.upcoming();
  let mode = 'mixed';

  const seg = h('div', { class: 'seg' });
  const paintSeg = () => seg.replaceChildren(...MODES.map(([k, label]) =>
    h('button', { class: k === mode ? 'on' : '', onclick: () => { mode = k; paintSeg(); } }, label)));
  paintSeg();

  root.append(
    pageHead('Review'),
    due
      ? h('section', { class: 'card review-hero' },
          h('div', { class: 'big-num' }, String(due)),
          h('div', { class: 'muted' }, 'due'),
          seg,
          h('button', { class: 'btn primary wide', onclick: () => { location.hash = `#/study/review/${mode}`; } }, icon('play', 18), 'Start'))
      : h('section', { class: 'card' }, state('success', 'Clear', { label: 'Lists', onClick: () => { location.hash = '#/lists'; } })),
    h('section', { class: 'grid-3' },
      h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, String(up.tomorrow)), h('div', { class: 'muted' }, 'Tomorrow')),
      h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, String(up.week)), h('div', { class: 'muted' }, 'This week')),
      h('div', { class: 'stat card' }, h('div', { class: 'stat-num' }, String(up.later)), h('div', { class: 'muted' }, 'Later'))));
}
