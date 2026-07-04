// Minimal service worker: cache the app shell, always use network for the API.
const CACHE = 'dentalink-v4';
const SHELL = ['/', '/styles.css', '/app.js', '/icon.svg', '/manifest.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // never cache API or writes
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
