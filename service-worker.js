// ============================================
// SERVICE WORKER - PWA Offline Support
// ============================================
const CACHE_NAME = 'meli-full-3pl-v1';

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/src/main.js',
    '/src/config.js',
    '/src/router.js',
    '/src/utils.js',
    '/src/modules/calculadoraEnvios.js'
];

// Instalación
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Cacheando archivos');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activación
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activado');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Limpiando caché antigua');
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // Solo cachear requests GET
    if (event.request.method !== 'GET') return;

    // No cachear requests a APIs externas
    if (event.request.url.includes('supabase.co') ||
        event.request.url.includes('mercadolibre.com')) {
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
