const CACHE = "vendedor-erp-v1";
const BASE = "/vendedor";
const SHELL = [BASE + "/", BASE + "/styles.css", BASE + "/app.js", BASE + "/manifest.webmanifest", BASE + "/icon.svg", BASE + "/icon-192.png", BASE + "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE && !clave.startsWith("erp-movil-")).map((clave) => caches.delete(clave)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (!url.pathname.startsWith(BASE + "/")) return;
  event.respondWith(
    caches.match(event.request).then((cacheada) => cacheada || fetch(event.request).then((respuesta) => {
      if (respuesta.ok && respuesta.type === "basic") {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copia));
      }
      return respuesta;
    }).catch(() => caches.match(BASE + "/"))),
  );
});
