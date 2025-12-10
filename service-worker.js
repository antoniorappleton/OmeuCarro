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

// service-worker.js

const STATIC_CACHE = "l100-static-v1";
const RUNTIME_CACHE = "l100-runtime-v1";

// "App shell" – adapta esta lista se mudares ficheiros/páginas
const APP_SHELL = [
  "/",                 // root
  "/index.html",
  "/dashboard.html",
  "/abastecimentos.html",
  "/estatisticas.html",

  // CSS
  "/css/style.css",
  "/css/home.css",
  "/css/abastecimentos.css",
  "/css/dashboard.css",

  // JS principais
  "/js/firebase-config.js",
  "/js/auth.js",
  "/js/firestore.js",
  "/js/home.js",
  "/js/abastecimentos.js",
  "/js/estatisticas.js",

  // assets
  "/assets/icons.svg",
  "/images/logo-icon192.png",
  "/images/logo-icon512.png",
  "/images/offroad.jpg",

  // página offline (cria uma simples se ainda não tiveres)
  "/offline.html"
];

// INSTALL – pré-cache do app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  // força a ativação deste SW assim que acabar de instalar
  self.skipWaiting();
});

// ACTIVATE – limpar caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (name !== STATIC_CACHE && name !== RUNTIME_CACHE) {
            return caches.delete(name);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// FETCH – estratégias por tipo de pedido
self.addEventListener("fetch", (event) => {
  const { request } = event;

  const url = new URL(request.url);

  // Só mexemos em pedidos do mesmo domínio
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1) Navegação (HTML) – network first com fallback
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // guarda uma cópia no cache de runtime
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (err) {
          // se falhar rede, tenta cache
          const cached = await caches.match(request);
          if (cached) return cached;

          // fallback final: offline.html
          const offline = await caches.match("/offline.html");
          return offline || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // 2) CSS / JS – stale-while-revalidate
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font"
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            cache.put(request, response.clone());
            return response;
          })
          .catch(() => null);

        // se já temos em cache, devolvemos logo e atualizamos em background
        return cached || networkPromise;
      })()
    );
    return;
  }

  // 3) Imagens – cache-first
  if (request.destination === "image") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          cache.put(request, response.clone());
          return response;
        } catch (err) {
          // se não houver rede nem cache, falha silenciosamente
          return new Response("", { status: 404 });
        }
      })()
    );
    return;
  }

  // 4) Restante – tenta rede, fallback cache se existir
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
