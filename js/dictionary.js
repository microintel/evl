// Definitions come from the free dictionaryapi.dev service and are cached in IndexedDB for offline reuse.
import * as db from './db.js';

const mem = new Map();       // word -> entry | null (null = known missing)
const inflight = new Map();
const failedSet = new Set();
export const failed = w => failedSet.has(w.toLowerCase());
const WEEK = 6048e5;

const key = w => w.toLowerCase();

// undefined = not looked up yet, null = no definition exists, object = entry
export const peek = w => mem.get(key(w));

// Built-in (AI-written) meanings + examples from words_all.json: instant, offline, and never fetched.
export function setLocal(word, ai) {
  mem.set(key(word), { word: key(word), phonetic: '', ai: true,
    defs: ai.meanings.map(m => ({ pos: m.pos, def: m.def, example: '' })), examples: ai.examples || [] });
}

export function lookup(word) {
  const k = key(word);
  if (mem.has(k)) return Promise.resolve(mem.get(k));
  if (inflight.has(k)) return inflight.get(k);
  const p = fetchEntry(k).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

async function fetchEntry(k) {
  try {
    const cached = await db.get('defs', k);
    if (cached) {
      if (!cached.missing) { mem.set(k, cached); return cached; }
      if (Date.now() - cached.ts < WEEK) { mem.set(k, null); return null; }
    }
  } catch { /* ignore */ }

  failedSet.delete(k);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(k), { signal: ctrl.signal });
    if (res.status === 404) {
      mem.set(k, null);
      db.put('defs', { word: k, missing: true, ts: Date.now() }).catch(() => {});
      return null;
    }
    if (!res.ok) { failedSet.add(k); return null; }
    const entry = parse(k, await res.json());
    if (!entry) { mem.set(k, null); return null; }
    mem.set(k, entry);
    db.put('defs', entry).catch(() => {});
    return entry;
  } catch {
    failedSet.add(k);
    return null; // offline or timeout — don't cache the failure
  } finally {
    clearTimeout(timer);
  }
}

function parse(k, data) {
  if (!Array.isArray(data) || !data.length) return null;
  const first = data[0];
  const defs = [];
  for (const entry of data) {
    for (const m of entry.meanings || []) {
      const d = (m.definitions || [])[0];
      if (d && d.definition && defs.length < 3) defs.push({ pos: m.partOfSpeech || '', def: d.definition, example: d.example || '' });
    }
  }
  if (!defs.length) return null;
  const phon = first.phonetic || (first.phonetics || []).map(p => p.text).find(Boolean) || '';
  return { word: k, phonetic: phon, defs };
}

export async function prefetch(words) {
  for (const w of words) { if (peek(w) === undefined) await lookup(w); }
}
