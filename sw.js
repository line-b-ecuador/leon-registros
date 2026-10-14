/* ==========================================================
   LeonCar — Service Worker
   Versión: v2
   
   Estrategia:
   - HTML/JS/CSS → network-first (busca lo nuevo, cae a caché si no hay red)
   - Íconos/imágenes → cache-first (nunca cambian)
   - Google APIs → sin caché (para no romper el login)
   
   ⚠️ Cada vez que cambies la app, sube el número de VERSION
   ========================================================== */

const VERSION = 'leoncar-v2';   // 👈 SUBE ESTO en cada actualización (v2 → v3 → v4...)
const CACHE_STATIC  = VERSION + '-static';
const CACHE_DYNAMIC = VERSION + '-dynamic';

// Archivos que SIEMPRE se cachean al instalar
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* ============ INSTALL ============ */
self.addEventListener('install', event => {
  console.log('🔧 SW: instalando', VERSION);
  self.skipWaiting(); // Activa esta versión inmediatamente
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('⚠ No se pudieron cachear todos los assets:', err);
      });
    })
  );
});

/* ============ ACTIVATE ============ */
self.addEventListener('activate', event => {
  console.log('✅ SW: activando', VERSION);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => {
            console.log('🗑 Borrando caché viejo:', k);
            return caches.delete(k);
          })
      );
    }).then(() => self.clients.claim()) // Toma control inmediato
  );
});

/* ============ FETCH ============ */
self.addEventListener('fetch', event => {
  const req = event.request;

  // Solo GET
  if (req.method !== 'GET') return;

  // Ignorar peticiones a Google (login, Firebase, Drive)
  // → Si las cacheamos, rompemos la autenticación
  const url = new URL(req.url);
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com')
  ) {
    return; // deja que el navegador lo maneje normal (online)
  }

  // Íconos e imágenes → cache-first
  if (req.destination === 'image' || /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // HTML, JS, CSS, JSON → network-first
  if (
    req.destination === 'document' ||
    req.destination === 'script' ||
    req.destination === 'style' ||
    /\.(html|js|css|json)$/i.test(url.pathname) ||
    url.pathname.endsWith('/')
  ) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Todo lo demás → network-first por defecto
  event.respondWith(networkFirst(req));
});

/* ============ ESTRATEGIAS ============ */

// Cache-first: si está en caché lo devuelve, si no lo busca en red y lo guarda
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

// Network-first: intenta red, si falla usa caché, y si no hay, devuelve index.html
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    // Sin red → buscar en caché
    const cached = await caches.match(req);
    if (cached) return cached;

    // Si es navegación, devolver el index.html cacheado (SPA fallback)
    if (req.destination === 'document') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }

    return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
  }
}

/* ============ MENSAJES (para forzar actualización) ============ */
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    console.log('⚡ SW: skipWaiting solicitado');
    self.skipWaiting();
  }
  if (event.data && event.data.action === 'getVersion') {
    event.source.postMessage({ version: VERSION });
  }
});
