// Service worker de la App Puesto: abre sin señal (app shell en caché).
// IMPORTANTE: subir CACHE cada vez que cambie cualquier archivo de la app (sg-puesto-v2, v3...).
const CACHE = 'sg-puesto-v2';
const FONTS = 'sg-puesto-fonts';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './store.js',
  './api.js',
  './ui.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  '../config.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sg-puesto-') && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // la API (POST) siempre va a la red
  const url = new URL(req.url);

  // Tipografías de Google: caché propia, primero caché.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Navegación: siempre index.html desde la caché (ignora ?parametros) y se actualiza en segundo plano.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then(hit => {
        const red = fetch(req).then(r => {
          if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copia)); }
          return r;
        }).catch(() => hit);
        return hit || red;
      })
    );
    return;
  }

  // Resto del shell: caché primero, refresco en segundo plano.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const red = fetch(req).then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return r;
      }).catch(() => hit);
      return hit || red;
    })
  );
});
