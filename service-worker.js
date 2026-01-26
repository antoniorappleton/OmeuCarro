// ===============================
// SERVICE WORKER – L100
// ===============================

// Aumenta a versão sempre que fizeres deploy
const STATIC_CACHE = "l100-static-v11";
const RUNTIME_CACHE = "l100-runtime-v11";

// Lista dos ficheiros essenciais para funcionar offline (APP SHELL)
const APP_SHELL = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./abastecimentos.html",
  "./estatisticas.html",
  "./veiculos.html",
  "./mapa.html",
  "./auth.html",
  "./css/style.css",
  "./css/dashboard.css",
  "./css/mapa.css",
  "./css/trip-calculator.css",

  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/firestore.js",
  "./js/dashboard.js",
  "./js/modal-abastecimento.js",
  "./js/estatisticas.js",
  "./js/veiculos.js",
  "./js/mapa.js",
  "./js/tripCalculator.js",
  "./js/utils.js",
  "./js/service-worker-register.js",
  "./images/logo-icon192.png",
  "./images/logo-icon512.png",
];

// ===============================
// MESSAGE HANDLER - Force Update
// ===============================
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log("[SW] Skip Waiting...");
    self.skipWaiting();
  }
});

// ===============================
// INSTALL – Pré-cache do App Shell
// ===============================
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const results = await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url)),
      );
      const failed = results
        .map((r, i) => (r.status === "rejected" ? APP_SHELL[i] : null))
        .filter(Boolean);
      if (failed.length) console.warn("[SW] Falharam no cache:", failed);
    })(),
  );
  // Don't auto-skip waiting here - let the client decide or waiting phase happen
  // self.skipWaiting();
});

// ===============================
// ACTIVATE – Limpa caches antigas
// ===============================
self.addEventListener("activate", (event) => {
  console.log("[SW] Activate v12");

  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((key) => {
          if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) {
            console.log("[SW] A eliminar cache antiga:", key);
            return caches.delete(key);
          }
        }),
      ),
    ),
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

          // Página offline (Splash Screen)
          return caches.match("./index.html");
        }),
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
      }),
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
          return caches.match("./images/logo-icon192.png");
        }
      }),
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// -------------------------------------
// FIREBASE MESSAGING (FCM) INTEGRATION
// -------------------------------------
importScripts(
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyAiKOykeoazkqCXMhy-mpX2Ho8liuUas-E",
  authDomain: "omeucarro-d3889.firebaseapp.com",
  projectId: "omeucarro-d3889",
  storageBucket: "omeucarro-d3889.appspot.com",
  messagingSenderId: "387296122464",
  appId: "1:387296122464:web:1c3c3c390dc26050f99505",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[SW-Messaging] Background message received:", payload);
  const notificationTitle = payload.notification?.title || "L100";
  const notificationOptions = {
    body: payload.notification?.body,
    icon: "/images/logo-icon192.png",
    data: payload.data || {},
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/dashboard.html";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && "focus" in client)
            return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(urlToOpen);
      }),
  );
});
