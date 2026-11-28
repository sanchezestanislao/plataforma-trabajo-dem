/* Service worker del sitio: guarda la aplicación para que abra sin conexión y trae la versión nueva cuando hay red. */
const VERSION = '1cb441cf1578';
const CACHE = 'plataforma-' + VERSION;
const BASE = ["./", "app.2ee6c8085720.js", "qr.18ae399f8118.js", "manifest.webmanifest", "tipografia/overpass-latin-wght-normal.woff2", "iconos/icono-192.png", "iconos/icono-512.png", "iconos/icono-adaptable-512.png", "iconos/apple-touch-icon.png"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.indexOf('plataforma-') === 0 && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  /* La página: primero la red, para recibir cada versión nueva; si no hay conexión, la copia guardada. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => {
          if (r.ok && !r.redirected) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(self.registration.scope, copia)); }
          return r;
        })
        .catch(() => caches.match(self.registration.scope))
    );
    return;
  }
  /* Íconos, manifest y tipografía: primero la copia guardada. */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      return r;
    }))
  );
});
