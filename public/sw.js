// Bulk Perps Tracker service worker: app-shell cache (offline launch), notification clicks. Never caches Bulk/API data.
const CACHE = "bpt-shell-v3";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url); if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") { e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put("/", r.clone())); return r; }).catch(() => caches.match("/"))); return; }
  if (u.pathname.startsWith("/assets/") || u.pathname.startsWith("/icons/") || u.pathname.startsWith("/sounds/"))
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })));
});
self.addEventListener("notificationclick", (e) => { e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => { for (const c of cs) if ("focus" in c) return c.focus(); return self.clients.openWindow("/"); })); });
