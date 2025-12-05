self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("static-v1").then(cache => {
      return cache.addAll([
        "index.html",
        "offline.html",
        "css/style.css"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match("offline.html"))
  );
});
