const CACHE_VERSION = "wc26-v281";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = [
  "/static/styles.min.css?v=280",
  "/static/app.min.js?v=281",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("wc26-") && !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isCacheableApi(url)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE, event));
  }
});

function isStaticAsset(url) {
  if (url.pathname === "/static/archive-mode.js") return false;
  if (!url.pathname.startsWith("/static/")) return false;
  if (url.searchParams.has("v")) return /\.(?:css|js|png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname);
  return /\.(?:png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname);
}

function isCacheableApi(url) {
  if (!url.pathname.startsWith("/api/v1/")) return false;
  return !/\/(?:stream|admin|exports)(?:\/|$)/.test(url.pathname);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (!cached) return network;
  event.waitUntil(network.catch(() => undefined));
  return cached;
}
