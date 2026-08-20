/* Previdência Invest - Service Worker
 * Estratégia: precache do app shell + CDNs, stale-while-revalidate para fontes,
 * network-first com fallback offline para navegações e APIs de cotações.
 */
const VERSION = '1.4.0';
const CACHE_PREFIX = 'previdencia-invest-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/investor-app.js',
  '/src/styles/animations.css',
  '/manifest.webmanifest',
  '/src/config/supabase-config.js',
  '/src/services/supabaseService.js',
  '/src/services/mathEngine.js',
  '/src/services/quotesService.js',
  '/src/services/importerService.js',
  '/src/services/notificationService.js',
  '/src/services/newsService.js',
  '/src/data/modelPortfolio.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon-180.png',
  '/vendor/lucide.min.js'
];

// Dependências CDN (necessárias para o app funcionar offline)
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

const CDN_HOSTS = ['cdn.tailwindcss.com', 'unpkg.com', 'cdn.jsdelivr.net'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const API_HOSTS = ['brapi.dev', 'query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'supabase.co'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        const preCache = cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('[SW] Precache shell falhou:', err);
        });
        const cdnCache = Promise.all(
          CDN_ASSETS.map((url) => cache.add(url).catch((err) => {
            console.warn(`[SW] CDN falhou: ${url}`, err);
          }))
        );
        return Promise.all([preCache, cdnCache]);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ type: 'VERSION', version: VERSION });
  }
});

function isCdn(url) { return CDN_HOSTS.some((h) => url.hostname.endsWith(h) || url.hostname === h); }
function isFont(url) { return FONT_HOSTS.some((h) => url.hostname.endsWith(h) || url.hostname === h); }
function isApi(url) { return API_HOSTS.some((h) => url.hostname.endsWith(h) || url.hostname === h); }

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => cached);
  return cached || network;
}

async function networkFirst(request, fallbackUrl = '/index.html') {
  try {
    const response = await fetch(request);
    if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, copy);
      if (request.mode === 'navigate') { cache.put('/index.html', copy); }
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return caches.match(fallbackUrl);
    }
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'font') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isFont(url) || isCdn(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isApi(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }
});