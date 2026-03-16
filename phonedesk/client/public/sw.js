const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `phonedesk-${CACHE_VERSION}`;
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const isOk = response.ok;
          const isAsset =
            event.request.url.includes("/assets/") ||
            event.request.url.endsWith(".js") ||
            event.request.url.endsWith(".css") ||
            event.request.url.endsWith(".png") ||
            event.request.url.endsWith(".svg");

          if (isOk && isAsset) {
            const clone = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }

          return response;
        })
        .catch(() => caches.match("/index.html"));
    }),
  );
});
