importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// Configuração do Firebase HARDCODED (Necessário para SW)
firebase.initializeApp({
  apiKey: "AIzaSyAiKOykeoazkqCXMhy-mpX2Ho8liuUas-E",
  authDomain: "omeucarro-d3889.firebaseapp.com",
  projectId: "omeucarro-d3889",
  storageBucket: "omeucarro-d3889.appspot.com",
  messagingSenderId: "387296122464",
  appId: "1:387296122464:web:1c3c3c390dc26050f99505"
});

const messaging = firebase.messaging();

// Handler de mensagens em background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title || 'L100';
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/images/logo-icon192.png', // Ajustado para o path correto
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Clique na notificação
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  // Abre a dashboard ou a URL específica
  const urlToOpen = event.notification.data.url || "/dashboard.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Se já houver uma janela aberta, foca nela
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && "focus" in client) return client.focus();
      }
      // Se não, abre uma nova
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
