// ============================================================
// Service Worker — Steel & Deco
// Estrategia: Cache-first para assets locales,
//             Network-first para APIs y CDNs externos
// ============================================================

const CACHE_VERSION  = 'steel-deco-v3';
const CACHE_STATIC   = `${CACHE_VERSION}-static`;
const CACHE_EXTERNAL = `${CACHE_VERSION}-ext`;

// Solo archivos LOCALES (que controlamos)
const LOCAL_ASSETS = [
    './',
    './index.html',
    './galeria.html',
    './comparador.html',
    './visualizador.html',
    './products.js',
    './layout.js',
    './logo.jpeg',
    './manifest.json'
];

// Dominios externos: usamos Network-first (no se cachean en install)
const EXTERNAL_HOSTS = [
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'www.gstatic.com',
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com'
];

// ── INSTALL: solo cachear assets locales ──────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Activar inmediatamente
    event.waitUntil(
        caches.open(CACHE_STATIC).then((cache) => {
            return cache.addAll(LOCAL_ASSETS).catch((err) => {
                console.warn('[SW] Error cacheando assets locales:', err);
            });
        })
    );
});

// ── ACTIVATE: limpiar cachés viejas ───────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((key) => {
                if (!key.startsWith(CACHE_VERSION)) {
                    return caches.delete(key);
                }
            }))
        ).then(() => self.clients.claim())
    );
});

// ── FETCH: estrategia dual ─────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignorar requests que no son GET
    if (event.request.method !== 'GET') return;

    // Firebase / APIs externas → siempre Network (no cachear)
    if (EXTERNAL_HOSTS.some(h => url.hostname.includes(h))) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Assets locales → Cache-first, fallback a Network
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Cachear solo respuestas válidas de assets locales
                if (response && response.status === 200 && url.origin === self.location.origin) {
                    const clone = response.clone();
                    caches.open(CACHE_STATIC).then((c) => c.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                // Offline fallback: servir index.html para navegación
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
