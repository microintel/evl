import { state } from './ui.js';

// Tiny hash router. A view is (root, params) => optional cleanup function.
const routes = [];
let cleanup = null;
let root = null;
const listeners = new Set();

// Scroll position is kept in each history entry, so Back/Forward return to exactly where you were.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let noSave = false, raf = 0;
window.addEventListener('scroll', () => {
  if (noSave) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { try { history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, ''); } catch { /* ignore */ } });
}, { passive: true });

export function route(pattern, view) {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  routes.push({ re, view });
}

export const onChange = fn => listeners.add(fn);

export function start(el) {
  root = el;
  window.addEventListener('hashchange', go);
  go();
}

async function go() {
  const saved = Number(history.state && history.state.scrollY) || 0;   // set only when we are coming back to an entry
  noSave = true; cancelAnimationFrame(raf);
  const path = location.hash.slice(1) || '/';
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  root.replaceChildren();
  const match = routes.map(r => ({ r, m: path.match(r.re) })).find(x => x.m);
  listeners.forEach(f => f(path));
  if (!match) { location.replace('#/'); return; }
  try {
    cleanup = (await match.r.view(root, match.m.groups || {})) || null;
  } catch (e) {
    console.error(e);
    root.replaceChildren(state('error', 'Error', { label: 'Retry', onClick: go }));
  }
  window.scrollTo(0, saved);
  requestAnimationFrame(() => {
    if (saved && Math.abs(window.scrollY - saved) > 2) window.scrollTo(0, saved);   // content that finished laying out late
    requestAnimationFrame(() => { noSave = false; });
  });
}
