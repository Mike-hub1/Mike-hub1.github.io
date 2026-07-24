const CACHE_VERSION = "wc26-v303";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = [
  "/static/styles.min.css?v=303",
  "/static/app.min.js?v=303",
  "/static/assets/clubs/as-monaco.png",
  "/static/assets/clubs/paris-saint-germain.png",
  "/static/assets/clubs/real-madrid.png",
  "/static/assets/trophies/world-cup.png",
  "/static/assets/trophies/fifa-intercontinental-cup.png",
  "/static/assets/trophies/uefa-super-cup.png",
  "/static/assets/trophies/european-golden-shoe.png",
  "/static/assets/trophies/ligue-1-champion.png",
  "/static/assets/trophies/fifa-world-cup-golden-boot.png",
  "/static/assets/trophies/coupe-de-la-ligue.png",
  "/static/assets/trophies/coupe-de-france.png",
  "/static/assets/trophies/trophee-des-champions.png",
  "/static/assets/trophies/golden-boy.png",
  "/static/assets/trophies/top-scorer.png",
  "/static/assets/trophies/kopa-trophy.png",
  "/static/assets/trophies/uefa-nations-league.png",
  "/static/assets/trophies/uefa-u19-euro.png",
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
