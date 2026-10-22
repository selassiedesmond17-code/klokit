// KlokIt service worker.
// It never stores anything private: pages and data always come live from the server.
// It only keeps public files (logo, icons, styles) for speed, plus an offline page.
const VERSION = "klokit-v1";
const STATIC_CACHE = VERSION + "-static";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/logo-light.png", "/logo-dark.png", "/icons/icon-192.png"];
const MAX_STATIC_ENTRIES = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("klokit-") && k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Keep the cache small: drop the oldest files
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never touch other sites (such as the database) or sign-in routes
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return;

  // Pages: always the live version, with a friendly page if there is no connection
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        async () =>
          (await caches.match(OFFLINE_URL)) ||
          new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
      )
    );
    return;
  }

  // Public files: serve from the device for speed, refresh in the background
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|svg|jpe?g|webp|ico|woff2?)$/.test(url.pathname);
  if (!isStatic) return; // data and everything else goes straight to the network

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone()).then(() => trim(cache));
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});