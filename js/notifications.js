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

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão de notificações negada.");
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
    swReg = await navigator.serviceWorker.register("/service-worker.js?v=11");
  }

  const messaging = firebase.messaging();

  // Obter Token
  const token = await messaging.getToken({
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });

  if (!token) {
    throw new Error("Não foi possível obter o token FCM.");
  }

  console.log("Token FCM obtido:", token);

  // Guardar no Firestore
  // Guardamos numa subcoleção 'fcmTokens' para suportar múltiplos dispositivos por user
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
      console.log("Mensagem recebida em foreground:", payload);
      const title = payload.notification?.title || "L100";
      const body = payload.notification?.body || "";
      const icon = payload.notification?.icon || "./images/logo-icon192.png";

      // Podemos mostrar um Toast personalizado ou usar a Notification API se o utilizador deixar
      // Nota: Browsers normalmente não mostram System Notifications se a aba estiver focada,
      // a menos que usemos a API explicitamente.

      // Opção 1: Toast Simples (se tiveres um sistema de toast)
      if (window.showToast) {
        window.showToast(title + ": " + body, "info");
      }

      // Opção 2: Tentar notificação de sistema mesmo com app aberta (útil para alertas de outros tabs)
      if (Notification.permission === "granted") {
        new Notification(title, {
          body: body,
          icon: icon,
        });
      }
    });
  } catch (error) {
    console.warn("Erro ao iniciar listener de mensagens foreground:", error);
  }
}

// Expor globalmente para ser usado nos botões
window.requestNotificationPermissionAndSaveToken =
  requestNotificationPermissionAndSaveToken;
window.listenToForegroundMessages = listenToForegroundMessages;
