/* mosques.world service worker (spec P5): app-shell caching and offline saved mosques.
 * Hashed build assets are cache-first; pages and the saved-times feed are network-first with a cache
 * fallback, so nothing stale is shown while online. Mutations, auth and test endpoints are never touched. */
const VERSION = "v2";
const STATIC = `mw-static-${VERSION}`;
const PAGES = `mw-pages-${VERSION}`;
const DATA = `mw-data-${VERSION}`;
const MAX_PAGES = 40;
const SHELL = ["/saved", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(SHELL.filter((path) => path !== "/saved")))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("mw-") && ![STATIC, PAGES, DATA].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheablePage(url) {
  return url.pathname === "/" || url.pathname === "/saved" || url.pathname.startsWith("/m/") || url.pathname.startsWith("/@");
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

function offlinePage() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · mosques.world</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:48px 20px;color:#1F1D1A;max-width:520px}a{color:#0B6E4F;font-weight:700}</style></head>
<body><h1>You're offline</h1><p>Your saved mosques and their times for the next 7 days are still available.</p><p><a href="/saved">Open Saved</a></p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function networkFirst(request, cacheName, store) {
  try {
    const response = await fetch(request);
    if (response.ok && store) {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, copy).then(() => trim(cacheName, MAX_PAGES)));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    if (request.mode === "navigate") return offlinePage();
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(STATIC).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith("/api/auth") || path.startsWith("/api/v1/test") || path === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, cacheablePage(url)));
    return;
  }
  if (path === "/api/v1/saved/offline") {
    event.respondWith(networkFirst(request, DATA, true));
    return;
  }
  if (path.startsWith("/api/")) return;
  if (path.startsWith("/_next/static/") || path.startsWith("/assets/") || path.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (["script", "style", "font", "manifest"].includes(request.destination) || path.startsWith("/map/")) {
    event.respondWith(networkFirst(request, STATIC, true));
  }
});

self.addEventListener("message", (event) => {
  // Sent on sign-out so one person's pages never show for the next.
  if (event.data === "clear-user-caches") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(DATA)]));
});

// Web Push (spec P6): show the notification; tapping it opens the page it is about.
self.addEventListener("push", (event) => {
  let data = { title: "mosques.world", body: "", url: "/notifications" };
  try {
    data = { ...data, ...(event.data ? event.data.json() : {}) };
  } catch {
    data.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  target.searchParams.set("from", "push");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target.toString() && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target.toString());
    }),
  );
});
