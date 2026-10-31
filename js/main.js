import * as data from './data.js';
import * as store from './store.js';
import { route, start, onChange } from './router.js';
import { h, icon, bar, state, toast } from './ui.js';
import { home } from './views/home.js';
import { lists } from './views/lists.js';
import { list } from './views/list.js';
import { review } from './views/review.js';
import { study } from './views/study.js';
import { progress } from './views/progress.js';

const TABS = [
  ['/', 'Home', 'home'],
  ['/lists', 'Lists', 'lists'],
  ['/review', 'Review', 'review'],
  ['/progress', 'Progress', 'chart']
];

function activeTab(path) {
  if (path.startsWith('/study/review')) return '/review';
  if (path.startsWith('/list') || path.startsWith('/study')) return '/lists';
  return path;
}

function buildNav() {
  const nav = document.getElementById('nav');
  const links = TABS.map(([href, label, ic]) =>
    h('a', { class: 'nav-link', href: '#' + href, 'data-path': href }, icon(ic, 24), h('span', null, label)));
  const foot = h('div', { class: 'nav-foot' });
  nav.replaceChildren(
    h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'icon-192.png', alt: '' }), h('span', { class: 'brand-text' }, h('strong', null, 'EVL'), h('small', null, 'English Vocabulary Learning'))),
    ...links,
    foot
  );
  const paintFoot = () => {
    const t = store.totals();
    foot.replaceChildren(
      h('div', { class: 'nav-foot-row' }, h('span', null, 'Mastered'), h('strong', null, `${t.mastered} / ${t.total}`)),
      bar(t.mastered, t.learning, t.total),
      h('div', { class: 'credit' }, 'Developed by Microintel')
    );
  };
  paintFoot();
  store.subscribe(paintFoot);
  onChange(path => {
    const tab = activeTab(path);
    links.forEach(a => a.classList.toggle('active', a.dataset.path === tab));
  });
}

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}

async function boot() {
  const view = document.getElementById('view');
  try {
    await Promise.all([data.load(), store.init()]);
  } catch (e) {
    document.getElementById('nav').replaceChildren();
    view.replaceChildren(
      state('error', location.protocol === 'file:' ? 'Needs http server' : 'Failed to load', { label: 'Retry', onClick: () => location.reload() }),
      h('p', { class: 'muted small center' }, String(e.message || e)));
    return;
  }

  buildNav();
  let warned = 0;
  window.addEventListener('storageerror', () => { if (Date.now() - warned > 10000) { warned = Date.now(); toast('Not saved', 'error'); } });
  if (!store.canPersist()) toast('Not saved', 'error');
  route('/', home);
  route('/lists', lists);
  route('/list/:id', list);
  route('/review', review);
  route('/progress', progress);
  route('/study/:list/:mode', study);

  window.addEventListener('themechange', () => requestAnimationFrame(syncThemeColor));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(syncThemeColor));
  syncThemeColor();

  start(view);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
