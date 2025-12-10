// ===============================
// SERVICE WORKER – L100
// ===============================

// Aumenta a versão sempre que fizeres deploy
const STATIC_CACHE = "l100-static-v3";
const RUNTIME_CACHE = "l100-runtime-v3";

// Lista dos ficheiros essenciais para funcionar offline (APP SHELL)
const APP_SHELL = [
  "/", // GitHub Pages redireciona para /index.html
  "/index.html",
  "/offline.html",

  // Screens
  "/dashboard.html",
  "/abastecimentos.html",
  "/estatisticas.html",
  "/perfil.html",
  "/veiculos.html",
  "/login.html",
  "/register.html",

  // CSS
  "/css/style.css",
  "/css/dashboard.css",
  "/css/abastecimentos.css",

  // JS
  "/js/firebase-config.js",
  "/js/auth.js",
  "/js/firestore.js",
  "/js/dashboard.js",
  "/js/abastecimentos.js",
  "/js/estatisticas.js",
  "/js/perfil.js",
  "/js/veiculos.js",
  "/js/modal-abastecimento.js",
  "/js/utils.js",
  "/js/service-worker-register.js",

  // Assets
  "/images/logo-icon192.png",
  "/images/logo-icon512.png",
  "/images/offline.png",
];

// ===============================
// INSTALL – Pré-cache do App Shell
// ===============================
self.addEventListener("install", (event) => {
  console.log("[SW] Install");

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] A cachear APP_SHELL…");
      return cache.addAll(APP_SHELL);
    })
  );

  self.skipWaiting(); // força imediatamente o novo SW
});

// ===============================
// ACTIVATE – Limpa caches antigas
// ===============================
self.addEventListener("activate", (event) => {
  console.log("[SW] Activate");

  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            console.log("[SW] A eliminar cache antiga:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// ================================================================
// FETCH HANDLER – Estrategias por tipo de conteúdo
// ================================================================
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Apenas tratar pedidos deste domínio
  if (url.origin !== location.origin) return;

  // -------------------------------------
  // HTML → NETWORK FIRST (para garantir que recebes atualizações)
  // -------------------------------------
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Guardar a versão mais recente no runtime cache
          return caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        })
        .catch(async () => {
          // Offline → tenta cache
          const cached = await caches.match(request);
          if (cached) return cached;

          // Página offline
          return caches.match("/offline.html");
        })
    );
    return;
  }

  // -------------------------------------
  // CSS / JS → STALE WHILE REVALIDATE
  // -------------------------------------
  if (request.destination === "style" || request.destination === "script") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            cache.put(request, response.clone());
            return response;
          })
          .catch(() => null);

        return cached || network;
      })
    );
    return;
  }

  // -------------------------------------
  // IMAGENS → CACHE FIRST
  // -------------------------------------
  if (request.destination === "image") {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          cache.put(request, response.clone());
          return response;
        } catch {
          return caches.match("/images/offline.png");
        }
      })
    );
    return;
  }

  // -------------------------------------
  // RESTANTE → NETWORK FIRST com fallback cache
  // -------------------------------------
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
