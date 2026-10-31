import { state } from './ui.js';

// Tiny hash router. A view is (root, params) => optional cleanup function.
const routes = [];
let cleanup = null;
let root = null;
const listeners = new Set();

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
  window.scrollTo(0, 0);
}
