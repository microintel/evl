import * as store from '../store.js';
import { h, icon, ring, bar, pageHead, toast } from '../ui.js';
import * as R from '../rewards.js';
import { bi } from '../bicons.js';

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
  const streak = R.streak();
  const frz = R.freezes();
  const note = R.takeNotice();
  if (note) setTimeout(() => toast(note), 400);
  const next = store.nextList();

  const goHome = next ? store.listStats(next) : null;
  const actions = h('section', { class: 'home-actions' },
    next
      ? h('a', { class: 'card cta', href: '#/list/' + next.id },
          h('div', { class: 'action-ico' }, icon('cards', 26)),
          h('div', { class: 'grow' },
            h('div', { class: 'action-title' }, goHome.mastered || goHome.learning ? `Continue List ${next.id}` : `Start List ${next.id}`),
            h('div', { class: 'cta-sub' }, goHome.new ? `${goHome.new} new words to learn` : `${goHome.mastered}/${next.words.length} mastered`)),
          icon('chevron', 22))
      : h('div', { class: 'card cta' }, h('div', { class: 'grow' }, h('div', { class: 'action-title' }, 'All lists complete'))),
    due
      ? h('a', { class: 'card action hot', href: '#/review' },
          h('div', { class: 'action-ico' }, icon('review', 24)),
          h('div', { class: 'grow' }, h('div', { class: 'action-title' }, `${due} due for review`), h('div', { class: 'muted' }, 'Quick refresh keeps words in memory')),
          icon('chevron', 20))
      : null);

  const quick = h('section', { class: 'quick' },
    h('a', { class: 'card tile reels-tile', href: '#/reels' },
      h('div', { class: 'action-ico' }, icon('reels', 24)),
      h('div', { class: 'action-title' }, 'Reels'),
      h('div', { class: 'muted' }, `${R.reelsToday()} today`)),
    R.chestCard(true),
    h('a', { class: 'card tile', href: '#/blitz' },
      h('div', { class: 'action-ico' }, icon('flame', 24)),
      h('div', { class: 'action-title' }, '60 sec'),
      h('div', { class: 'muted' }, `Best ${R.best()}`)));

  root.append(
    pageHead(greeting(), null, h('img', { class: 'logo head-logo', src: 'icon-192.png', alt: '' })),
    h('section', { class: 'hero' },
      h('div', { class: 'hero-ring' }, ring(day.reviewed / goal), h('div', { class: 'ring-label' }, h('strong', null, String(day.reviewed)), h('span', null, `of ${goal}`))),
      h('div', { class: 'hero-text' },
        h('div', { class: 'eyebrow' }, 'Today'),
        h('div', { class: 'hero-title' }, day.reviewed >= goal ? 'Goal reached' : `${goal - day.reviewed} to go`),
        h('div', { class: 'chip-hero' + (streak ? ' lit' : '') }, icon('flame', 18), String(streak),
          frz ? h('span', { class: 'rw-freeze', title: 'Streak freezes: each one protects a missed day' }, bi('snow', 14), ' ' + frz) : null))),
    actions,
    quick,
    R.xpCard(),
    h('div', { class: 'home-more' },
      h('section', { class: 'grid-3' },
        stat('Mastered', t.mastered, 'm'),
        stat('Learning', t.learning, 'l'),
        stat('Not started', t.new, 'n')),
      h('section', { class: 'card' },
        h('div', { class: 'row-between' }, h('strong', null, 'Mastery'), h('span', { class: 'muted' }, `${Math.round(t.mastered / t.total * 100)}%`)),
        bar(t.mastered, t.learning, t.total, 'thick')))
  );
}
