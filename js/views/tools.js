import { h, icon, pageHead } from '../ui.js';
import * as store from '../store.js';
import * as R from '../rewards.js';

export function tools(root) {
  const due = store.dueIds().length;
  const card = (href, ic, title, sub, hot) =>
    h('a', { class: 'card action' + (hot ? ' hot' : ''), href },
      h('div', { class: 'action-ico' }, icon(ic, 26)),
      h('div', { class: 'grow' }, h('div', { class: 'action-title' }, title), h('div', { class: 'muted' }, sub)),
      icon('chevron', 20));
  root.append(
    pageHead('Tools'),
    h('section', { class: 'grid-2' },
      card('#/review', 'review', 'Review', due ? `${due} due` : 'Nothing due', due > 0),
      card('#/test', 'quiz', 'Vocabulary test', 'How many words you know'),
      card('#/blitz', 'flame', '60-second challenge', `Best: ${R.best()}`),
      card('#/worksheet', 'worksheet', 'Worksheet', 'Download PDF')));
}
