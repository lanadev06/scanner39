// sw.js
const SW_VERSION = 'scanner39-2025-08-25-02';
const HTML_CACHE  = `html-${SW_VERSION}`;
const ASSET_CACHE = `assets-${SW_VERSION}`;

// Статика (без index.html). Пути — ОТНОСИТЕЛЬНЫЕ.
const STATIC_ASSETS = [
  './scannerlogo.png',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.8.1/dist/quagga.min.js',
  'https://cdn.jsdelivr.net/npm/zxing-wasm@2/dist/iife/reader/index.js'
];

// Специальные заголовки для Android
const ANDROID_HEADERS = {
  'Cache-Control': 'public, max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block'
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    self.skipWaiting(); // мгновенно активируем новую версию
    const cache = await caches.open(ASSET_CACHE);
    await cache.addAll(STATIC_ASSETS);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (![HTML_CACHE, ASSET_CACHE].includes(k)) return caches.delete(k);
    }));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHTMLRequest(req) {
  return req.mode === 'navigate' ||
         (req.headers.get('accept') || '').includes('text/html');
}

function isImageRequest(req) {
  return req.destination === 'image' || 
         req.url.includes('.png') || 
         req.url.includes('.jpg') || 
         req.url.includes('.jpeg') || 
         req.url.includes('.gif') || 
         req.url.includes('.webp');
}

// HTML — network-first (чтобы обновляться сразу), статика — cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (isHTMLRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(HTML_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Специальная обработка для изображений (логотип)
  if (isImageRequest(req)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Возвращаем кэшированное изображение с заголовками для Android
        const response = new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers: {
            ...Object.fromEntries(cached.headers.entries()),
            ...ANDROID_HEADERS
          }
        });
        return response;
      }
      
      try {
        const resp = await fetch(req);
        const cache = await caches.open(ASSET_CACHE);
        cache.put(req, resp.clone());
        return resp;
      } catch {
        return new Response('Offline image', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      const cache = await caches.open(ASSET_CACHE);
      cache.put(req, resp.clone());
      return resp;
    } catch {
      return new Response('Offline asset', { status: 503 });
    }
  })());
});