const admin = require("firebase-admin");

/**
 * Envia uma notificação para todos os tokens FCM de um utilizador.
 * @param {string} userId ID do utilizador no Firestore
 * @param {string} title Título da notificação
 * @param {string} body Corpo da mensagem
 * @param {object} extraData Dados extra para a notificação (opcional)
 */
async function sendNotificationToUser(userId, title, body, extraData = {}) {
  if (!userId) {
    console.warn("[NotifyUtils] Tentativa de enviar notificação sem userId.");
    return;
  }

  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);
  const tokensSnap = await userRef.collection("fcmTokens").get();

  if (tokensSnap.empty) {
    console.log(`[NotifyUtils] User ${userId} não tem tokens registados.`);
    return;
  }

  const tokens = tokensSnap.docs.map((t) => t.data().token);
  console.log(`[NotifyUtils] A enviar para ${tokens.length} tokens do user ${userId}.`);

  // Caminho real das páginas estáticas é sempre dentro de /pages/.
  // Se quem chamou já incluir o prefixo, respeitamos; caso contrário, adicionamo-lo.
  const rawUrl = extraData.url || "/pages/veiculos.html";
  const targetUrl = rawUrl.startsWith("/pages/") ? rawUrl : `/pages${rawUrl}`;

  // IMPORTANTE: Mensagem "data-only" (sem campo top-level "notification").
  // Quando existe "notification", o SDK do FCM mostra a notificação sozinho
  // e regista o SEU PRÓPRIO listener de "notificationclick" (usando fcm_options.link),
  // que corre em paralelo ao listener definido em service-worker.js — duplo clique,
  // janelas a abrir a mais, e nenhum controlo sobre o destino real do clique.
  // Ao mandar só "data", é o nosso próprio service-worker.js (onBackgroundMessage +
  // notificationclick) que decide tudo, de forma consistente.
  const message = {
    data: {
      ...extraData,
      title,
      body,
      click_action: "FLUTTER_NOTIFICATION_CLICK", // compatibilidade legada
      url: targetUrl,
    },
    webpush: {
      headers: { Urgency: "high" },
      fcm_options: {
        link: "https://omeucarro-d3889.web.app" + targetUrl,
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast({
      ...message,
      tokens,
    });
    console.log(`[NotifyUtils] Success=${response.successCount}, Failure=${response.failureCount}`);

    // Limpeza de tokens inválidos
    if (response.failureCount > 0) {
      const tokensToDelete = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-argument"
          ) {
            tokensToDelete.push(tokens[idx]);
          }
        }
      });

      for (const t of tokensToDelete) {
        await userRef.collection("fcmTokens").doc(t).delete().catch(() => {});
      }
    }
    
    return response;
  } catch (error) {
    console.error("[NotifyUtils] Erro ao enviar FCM:", error);
    throw error;
  }
}

module.exports = { sendNotificationToUser };
