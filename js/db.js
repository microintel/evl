// IndexedDB wrapper — the only module that talks to the database directly.
const NAME = 'lexicon';
const VERSION = 1;
let dbPromise;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('words', { keyPath: 'id' });   // per-word progress
      d.createObjectStore('defs', { keyPath: 'word' });  // cached dictionary lookups
      d.createObjectStore('daily', { keyPath: 'date' }); // per-day activity
      d.createObjectStore('meta', { keyPath: 'key' });   // settings etc.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const rq = fn(s);
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const getAll = store => tx(store, 'readonly', s => s.getAll());
export const get = (store, key) => tx(store, 'readonly', s => s.get(key));
export const put = (store, value) => tx(store, 'readwrite', s => s.put(value));
export const putMany = (store, values) => tx(store, 'readwrite', s => { values.forEach(v => s.put(v)); });
export const clear = store => tx(store, 'readwrite', s => s.clear());
