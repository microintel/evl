import * as store from '../store.js';
import { h, icon, ring, bar, pageHead } from '../ui.js';

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

const stat = (label, value, cls) =>
  h('div', { class: 'stat card' }, h('span', { class: 'dot ' + cls }), h('div', { class: 'stat-num' }, String(value)), h('div', { class: 'muted' }, label));

export function home(root) {
  const t = store.totals();
  const due = store.dueIds().length;
  const day = store.today();
  const goal = store.settings().goal;
  const streak = store.streak();
  const next = store.nextList();

  const actions = h('section', { class: 'grid-2' },
    h('a', { class: 'card action' + (due ? ' hot' : ''), href: '#/review' },
      h('div', { class: 'action-ico' }, icon('review', 26)),
      h('div', { class: 'grow' },
        h('div', { class: 'action-title' }, due ? `${due} due` : 'Review'),
        due ? null : h('div', { class: 'muted' }, '0')),
      icon('chevron', 20)),
    next
      ? h('a', { class: 'card action', href: '#/list/' + next.id },
          h('div', { class: 'action-ico' }, icon('cards', 26)),
          h('div', { class: 'grow' },
            h('div', { class: 'action-title' }, `List ${next.id}`),
            h('div', { class: 'muted' }, `${store.listStats(next).mastered}/${next.words.length} mastered`)),
          icon('chevron', 20))
      : h('div', { class: 'card action' }, h('div', { class: 'grow' }, h('div', { class: 'action-title' }, 'Complete'))));

  root.append(
    pageHead(greeting(), null, h('img', { class: 'logo head-logo', src: 'icon-192.png', alt: '' })),
    h('section', { class: 'hero' },
      h('div', { class: 'hero-ring' }, ring(day.reviewed / goal), h('div', { class: 'ring-label' }, h('strong', null, String(day.reviewed)), h('span', null, `of ${goal}`))),
      h('div', { class: 'hero-text' },
        h('div', { class: 'eyebrow' }, 'Today'),
        h('div', { class: 'hero-title' }, day.reviewed >= goal ? 'Goal reached' : `${goal - day.reviewed} to go`),
        h('div', { class: 'chip-hero' }, icon('flame', 18), String(streak)))),
    actions,
    h('section', { class: 'grid-3' },
      stat('Mastered', t.mastered, 'm'),
      stat('Learning', t.learning, 'l'),
      stat('Not started', t.new, 'n')),
    h('section', { class: 'card' },
      h('div', { class: 'row-between' }, h('strong', null, 'Mastery'), h('span', { class: 'muted' }, `${Math.round(t.mastered / t.total * 100)}%`)),
      bar(t.mastered, t.learning, t.total, 'thick'))
  );
}
