// js/notifications.js

const VAPID_KEY =
  "BGWavQLSFK6ckyhIAYrUA-bZyn4iCnStGQdbeIJMnJlpbtvG2Ts9yrorMmz5VfPgKAKs6gLeNn2oJz-9ScaqofM";

/**
 * Pede permissão ao utilizador e, se concedida, obtém o token FCM e guarda no Firestore.
 */
async function requestNotificationPermissionAndSaveToken() {
  console.log("A pedir permissão de notificações...");

  if (!("Notification" in window)) {
    throw new Error("Este browser não suporta notificações.");
  }

  if (Notification.permission === "granted") {
    console.log("Permissão de notificações já concedida.");
  } else {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Permissão de notificações negada.");
    }
  }

  // Verificar se o utilizador está autenticado
  if (!window.auth || !window.auth.currentUser) {
    throw new Error("Precisas de estar autenticado para ativar notificações.");
  }

  const user = window.auth.currentUser;

  // Garantir que o Service Worker de Messaging está registado
  // Nota: O registo é feito separadamente, mas aqui garantimos que o 'messaging' o usa
  // Garantir que o Service Worker principal está registado e pronto
  let swReg = await navigator.serviceWorker.ready;
  if (
    !swReg ||
    !swReg.active ||
    !swReg.active.scriptURL.includes("service-worker.js")
  ) {
    swReg = await navigator.serviceWorker.register("./service-worker.js?v=19");
  }

  const messaging = firebase.messaging();

  // Obter Token
  const token = await messaging.getToken({
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });

  if (!token) {
    throw new Error("Não foi possí­vel obter o token FCM.");
  }

  console.log("Token FCM obtido:", token);

  // Guardar no Firestore
  // Guardamos numa subcoleção 'fcmTokens' para suportar míºltiplos dispositivos por user
  const db = firebase.firestore();
  const tokenRef = db
    .collection("users")
    .doc(user.uid)
    .collection("fcmTokens")
    .doc(token);

  await tokenRef.set(
    {
      token: token,
      platform: "web",
      userAgent: navigator.userAgent,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return token;
}

/**
 * Ouve mensagens quando a app está em primeiro plano (aberta).
 */
function listenToForegroundMessages() {
  try {
    const messaging = firebase.messaging();
    messaging.onMessage((payload) => {
      console.log("ðŸ”” [FCM Client] Mensagem recebida em foreground:", payload);
      const title = payload.notification?.title || "L100";
      const body = payload.notification?.body || "";
      const icon = payload.notification?.icon || "./images/logo-icon192.png";
      const badge = payload.notification?.badge || "./images/logo-icon192.png";

      // Opção 1: Toast Simples (se tiveres um sistema de toast)
      if (window.showToast) {
        console.log("ðŸ‘‰ A mostrar Toast...");
        window.showToast(title + ": " + body, "info");
      }

      // Opção 2: Tentar notificação de sistema mesmo com app aberta
      if (Notification.permission === "granted") {
        console.log(
          "ðŸ‘‰ A disparar Notificação via ServiceWorker (Foreground)...",
        );
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body: body,
            icon: icon,
            badge: badge,
            vibrate: [200, 100, 200],
            tag: payload.notification?.tag || "l100-alert-fg",
            data: payload.data || {},
          });
        });
      }
    });
  } catch (error) {
    console.warn("Erro ao iniciar listener de mensagens foreground:", error);
  }
}

/**
 * Diagnóstico: Mostra uma notificação de teste local.
 */
async function testLocalNotification() {
  console.log("ðŸ§ª [Diagnostics] A iniciar teste de notificação local...");

  if (!("Notification" in window)) {
    console.error("âŒ [Diagnostics] Browser não suporta notificações.");
    return alert("Este browser não suporta notificações.");
  }

  console.log("ðŸ“ [Diagnostics] Permissão atual:", Notification.permission);
  if (Notification.permission !== "granted") {
    console.warn("âš ï¸ [Diagnostics] Permissão não concedida. A pedir agora...");
    const p = await Notification.requestPermission();
    if (p !== "granted") {
      return alert("Precisas de dar permissão nas definições do browser.");
    }
  }

  try {
    console.log("âŒ› [Diagnostics] À espera do Service Worker...");
    const reg = await navigator.serviceWorker.ready;
    console.log("âœ… [Diagnostics] Service Worker pronto:", reg.scope);

    console.log("ðŸ‘‰ [Diagnostics] A executar reg.showNotification...");

    // Tentamos await para capturar erros de permissão ou sistema
    await reg.showNotification("Teste de Notificação L100", {
      body: "Se estás a ver isto, as notificações locais funcionam! âœ…",
      icon: "./images/logo-icon192.png",
      tag: "test-notification-" + Date.now(),
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: { url: window.location.href },
    });

    console.log("ðŸŽ‰ [Diagnostics] Comando showNotification enviado.");

    if (window.showToast) {
      window.showToast(
        "Deverá aparecer uma notificação agora. Verifica também o Centro de Ações do Windows.",
        "success",
      );
    }
  } catch (err) {
    console.error("âŒ [Diagnostics] Erro no teste local:", err);
    alert(
      "Erro no teste: " +
        err.message +
        "\n\nVerifica a consola (F12) para detalhes.",
    );
  }
}

// Expor globalmente para ser usado nos botões
window.requestNotificationPermissionAndSaveToken =
  requestNotificationPermissionAndSaveToken;
window.listenToForegroundMessages = listenToForegroundMessages;
window.testLocalNotification = testLocalNotification;

// Auto-log do estado inicial
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((reg) => {
    console.log(
      "ðŸ“¡ [Diagnostics] Service Worker Ready:",
      reg.active?.scriptURL,
    );
    if (Notification.permission === "granted") {
      console.log("ðŸ“¡ [Diagnostics] Notificações permitidas no browser.");
    } else {
      console.warn(
        "ðŸ“¡ [Diagnostics] Permissão de notificações:",
        Notification.permission,
      );
    }
  });
}
