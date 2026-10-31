const CACHE = 'evl-v9';
const SHELL = [
  './', 'index.html', 'styles.css', 'words_all.json', 'manifest.webmanifest', 'favicon.ico', 'favicon-32.png', 'favicon-64.png',
  'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'js/main.js', 'js/db.js', 'js/data.js', 'js/store.js', 'js/dictionary.js', 'js/speech.js',
  'js/router.js', 'js/ui.js', 'js/pdf.js',
  'js/views/home.js', 'js/views/lists.js', 'js/views/list.js', 'js/views/review.js',
  'js/views/study.js', 'js/views/progress.js', 'js/views/tools.js', 'js/views/worksheet.js', 'js/views/reels.js', 'js/views/test.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for the app itself (always fresh when online), cache fallback offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  const swiperCdn = u.hostname === 'cdn.jsdelivr.net' && u.pathname.startsWith('/npm/swiper');
  if (req.method !== 'GET' || (u.origin !== location.origin && !swiperCdn)) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
