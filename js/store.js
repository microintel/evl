// Progress state: in-memory cache backed by IndexedDB, with a Leitner-style spaced repetition schedule.
import * as db from './db.js';
import { WORDS, LISTS } from './data.js';

export const MASTERED = 4;      // box >= 4 counts as mastered
export const MAX_BOX = 5;
const DAY = 864e5;
const GAP = [0, 1, 2, 4, 8, 16]; // days until next review per box

const state = {
  recs: new Map(),
  daily: new Map(),
  settings: { name: '', goal: 20, speech: true, theme: 'auto' }
};
const subs = new Set();
export const subscribe = fn => (subs.add(fn), () => subs.delete(fn));
const emit = () => subs.forEach(f => f());
let persistent = true;
export const canPersist = () => persistent;
const safe = p => p.catch(e => {
  console.warn('storage error', e);
  persistent = false;
  window.dispatchEvent(new Event('storageerror'));
});

export const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export async function init() {
  try {
    const [recs, daily, meta] = await Promise.all([db.getAll('words'), db.getAll('daily'), db.getAll('meta')]);
    recs.forEach(r => state.recs.set(r.id, r));
    daily.forEach(d => state.daily.set(d.date, d));
    const s = meta.find(m => m.key === 'settings');
    if (s) Object.assign(state.settings, s.value);
  } catch (e) {
    console.warn('IndexedDB unavailable — progress will not persist this session', e);
    persistent = false;
  }
  if (state.settings.theme !== 'light' && state.settings.theme !== 'dark') {
    state.settings.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme();
}

/* ---------- settings ---------- */
export const settings = () => state.settings;
export function setSetting(key, value) {
  state.settings[key] = value;
  safe(db.put('meta', { key: 'settings', value: { ...state.settings } }));
  if (key === 'theme') applyTheme();
  emit();
}
export function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  window.dispatchEvent(new Event('themechange'));
}

/* ---------- words ---------- */
export const rec = id => state.recs.get(id);
export function status(id) {
  const r = state.recs.get(id);
  return !r ? 'new' : r.box >= MASTERED ? 'mastered' : 'learning';
}
export const isDue = id => { const r = state.recs.get(id); return !!r && r.due <= Date.now(); };

export function record(id, correct) {
  const w = WORDS.get(id);
  if (!w) return;
  const now = Date.now();
  const r = state.recs.get(id) || { id, word: w.word, list: w.list, box: 0, seen: 0, right: 0, wrong: 0, due: 0, last: 0 };
  r.seen++;
  r.last = now;
  if (correct) { r.right++; r.box = Math.min(MAX_BOX, r.box + 1); }
  else { r.wrong++; r.box = Math.max(0, r.box - 1); }
  r.due = r.box === 0 ? now : startOfToday() + GAP[r.box] * DAY;
  state.recs.set(id, r);
  safe(db.put('words', r));

  const k = dayKey();
  const d = state.daily.get(k) || { date: k, reviewed: 0, right: 0 };
  d.reviewed++;
  if (correct) d.right++;
  state.daily.set(k, d);
  safe(db.put('daily', d));
  emit();
}

/* ---------- queries ---------- */
export function listStats(list) {
  let n = 0, l = 0, m = 0, due = 0;
  for (const w of list.words) {
    const s = status(w.id);
    if (s === 'new') n++; else if (s === 'learning') l++; else m++;
    if (isDue(w.id)) due++;
  }
  return { new: n, learning: l, mastered: m, due, total: list.words.length };
}

export function totals() {
  let n = 0, l = 0, m = 0;
  for (const id of WORDS.keys()) {
    const s = status(id);
    if (s === 'new') n++; else if (s === 'learning') l++; else m++;
  }
  return { new: n, learning: l, mastered: m, total: WORDS.size };
}

export function dueIds() {
  return [...state.recs.values()].filter(r => r.due <= Date.now()).sort((a, b) => a.due - b.due).map(r => r.id);
}

export function upcoming() {
  const t0 = startOfToday();
  const out = { tomorrow: 0, week: 0, later: 0 };
  for (const r of state.recs.values()) {
    if (r.due <= Date.now()) continue;
    const days = Math.floor((r.due - t0) / DAY);
    if (days <= 1) out.tomorrow++; else if (days <= 7) out.week++; else out.later++;
  }
  return out;
}

export const today = () => state.daily.get(dayKey()) || { date: dayKey(), reviewed: 0, right: 0 };

export function recentDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    out.push({ ...(state.daily.get(k) || { date: k, reviewed: 0, right: 0 }), day: d });
  }
  return out;
}

export function streak() {
  const d = new Date();
  if (!(state.daily.get(dayKey(d))?.reviewed > 0)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (state.daily.get(dayKey(d))?.reviewed > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function boxCounts() {
  const c = [0, 0, 0, 0, 0, 0];
  for (const r of state.recs.values()) c[r.box]++;
  return c;
}

export function accuracy() {
  let seen = 0, right = 0;
  for (const r of state.recs.values()) { seen += r.seen; right += r.right; }
  return seen ? Math.round(right / seen * 100) : null;
}

export function hardest(n = 8) {
  return [...state.recs.values()].filter(r => r.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.right - b.right).slice(0, n);
}

export function lastTouchedList() {
  let best = null;
  for (const r of state.recs.values()) if (!best || r.last > best.last) best = r;
  return best ? best.list : null;
}

export function nextList() {
  const last = lastTouchedList();
  if (last) {
    const l = LISTS.find(x => x.id === last);
    if (l && listStats(l).mastered < l.words.length) return l;
  }
  return LISTS.find(l => listStats(l).mastered < l.words.length) || null;
}

/* ---------- backup / reset ---------- */
export function exportData() {
  return {
    app: 'evl', version: 1, exported: new Date().toISOString(),
    user: state.settings.name || '',
    settings: state.settings,
    words: [...state.recs.values()],
    daily: [...state.daily.values()]
  };
}

export async function importData(obj) {
  if (!obj || (obj.app !== 'evl' && obj.app !== 'lexicon') || !Array.isArray(obj.words)) throw new Error('Not an EVL backup file');
  const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  const words = obj.words.filter(r => WORDS.has(r.id)).map(r => {
    const w = WORDS.get(r.id);
    return {
      id: r.id, word: w.word, list: w.list,
      box: Math.min(MAX_BOX, Math.max(0, num(r.box))), seen: num(r.seen), right: num(r.right),
      wrong: num(r.wrong), due: num(r.due), last: num(r.last)
    };
  });
  const daily = (obj.daily || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .map(d => ({ date: d.date, reviewed: num(d.reviewed), right: num(d.right) }));
  await db.clear('words'); await db.clear('daily');
  await db.putMany('words', words); await db.putMany('daily', daily);
  state.recs = new Map(words.map(r => [r.id, r]));
  state.daily = new Map(daily.map(d => [d.date, d]));
  if (obj.settings) {
    const s = obj.settings;
    const imported = String(obj.user || s.name || '').trim().slice(0, 40);
    state.settings = {
      name: imported || state.settings.name || '',
      goal: [10, 20, 30, 50, 100].includes(+s.goal) ? +s.goal : 20,
      speech: s.speech !== false,
      theme: s.theme === 'dark' ? 'dark' : 'light'
    };
    await db.put('meta', { key: 'settings', value: { ...state.settings } });
    applyTheme();
  }
  else if (obj.user) {
    state.settings.name = String(obj.user).trim().slice(0, 40) || state.settings.name;
    await db.put('meta', { key: 'settings', value: { ...state.settings } });
  }
  emit();
  return words.length;
}

export async function resetAll() {
  state.recs.clear(); state.daily.clear();
  await safe(db.clear('words')); await safe(db.clear('daily'));
  emit();
}

export async function resetList(listId) {
  const list = LISTS.find(l => l.id === listId);
  if (!list) return;
  const recs = state.recs;
  const db_ = await db.open();
  await new Promise(res => {
    const t = db_.transaction('words', 'readwrite');
    list.words.forEach(w => { recs.delete(w.id); t.objectStore('words').delete(w.id); });
    t.oncomplete = res; t.onerror = res;
  });
  emit();
}
