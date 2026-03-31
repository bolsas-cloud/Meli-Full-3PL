// ============================================
// SERVICE WORKER - PWA Offline Support + Auto-Update
// ============================================
const CACHE_VERSION = 18; // Incrementar con cada deploy
const CACHE_NAME = `meli-full-3pl-v${CACHE_VERSION}`;

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/callback.html',
    '/manifest.json',
    '/src/main.js',
    '/src/config.js',
    '/src/router.js',
    '/src/utils.js'
];

// Instalación — cachea assets y toma control inmediato
self.addEventListener('install', (event) => {
    console.log(`Service Worker v${CACHE_VERSION}: Instalando...`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

// Activación — limpia caches viejas y toma control de todas las pestañas
self.addEventListener('activate', (event) => {
    console.log(`Service Worker v${CACHE_VERSION}: Activado`);
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((cache) => cache !== CACHE_NAME)
                    .map((cache) => {
                        console.log('Service Worker: Limpiando caché:', cache);
                        return caches.delete(cache);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // Solo cachear requests GET
    if (event.request.method !== 'GET') return;

    // No cachear requests a APIs externas o extensiones
    if (event.request.url.includes('supabase.co') ||
        event.request.url.includes('mercadolibre.com') ||
        event.request.url.startsWith('chrome-extension://') ||
        event.request.url.startsWith('moz-extension://')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clonar respuesta para guardar en caché
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Si falla la red, buscar en caché
                return caches.match(event.request);
            })
    );
});
