import { setLocal } from './dictionary.js';
// Loads words_all.json and exposes lists + a flat word index.
export const LISTS = [];          // [{ id, words: [{ id, word, list }] }]
export const WORDS = new Map();   // id -> { id, word, list }

export async function load() {
  const res = await fetch('words_all.json');
  if (!res.ok) throw new Error('Could not load words_all.json');
  const raw = await res.json();
  Object.keys(raw).map(Number).sort((a, b) => a - b).forEach(n => {
    const words = raw[n].words.map(item => {
      // an entry is either a plain string or { word, ai: { meanings: [2], examples: [3] } }
      const w = typeof item === 'string' ? item : item.word;
      const o = { id: `${n}|${w}`, word: w, list: n };
      if (item.ai) { o.ai = item.ai; setLocal(w, item.ai); }
      WORDS.set(o.id, o);
      return o;
    });
    LISTS.push({ id: n, words });
  });
}

export const getList = n => LISTS.find(l => l.id === Number(n));
