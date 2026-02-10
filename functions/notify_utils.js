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

  const message = {
    notification: { title, body },
    data: {
      ...extraData,
      click_action: "FLUTTER_NOTIFICATION_CLICK", // compatibilidade legada
      url: extraData.url || "/veiculos.html",
    },
    android: {
      priority: "high",
      notification: {
        color: "#0de3f2",
        icon: "stock_ticker_update", // Fallback para icon nativo se houver
        sound: "default",
      },
    },
    webpush: {
      headers: { Urgency: "high" },
      notification: {
        icon: "https://omeucarro-d3889.web.app/images/logo-icon192.png",
        badge: "https://omeucarro-d3889.web.app/images/logo-icon192.png",
        vibrate: [200, 100, 200],
        requireInteraction: true,
      },
      fcm_options: {
        link: "https://omeucarro-d3889.web.app" + (extraData.url || "/veiculos.html"),
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
