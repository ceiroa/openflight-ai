const SHELL_CACHE = 'cielorumbo-shell-v1';
const RUNTIME_CACHE = 'cielorumbo-runtime-v1';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/checkpoints.html',
    '/map.html',
    '/airspace-profile.html',
    '/aircraft.html',
    '/manifest.webmanifest',
    '/icons/app-icon.svg',
    '/styles/app-shell.css',
    '/styles/map.css',
    '/styles/airspace-profile.css',
    '/js/pwa.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((cacheName) => ![SHELL_CACHE, RUNTIME_CACHE].includes(cacheName))
                .map((cacheName) => caches.delete(cacheName))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    if (url.pathname.startsWith('/api/')) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request);
        cache.put(request, response.clone());
        return response;
    } catch (error) {
        return (await cache.match(request))
            || (await cache.match('/index.html'));
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match(request);
    const networkResponsePromise = fetch(request)
        .then((response) => {
            cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    return cachedResponse || networkResponsePromise || fetch(request);
}
