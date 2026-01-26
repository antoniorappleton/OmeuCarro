const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

/**
 * Função agendada para correr todos os dias às 09:00 AM (fuso horário Lisboa).
 * Verifica Seguros, IUCs e Inspeções a expirar.
 */
exports.checkVehicleAlerts = functions.pubsub
  .schedule("every day 09:00")
  .timeZone("Europe/Lisbon")
  .onRun(async (context) => {
    console.log("A iniciar verificação diária de alertas...");

    const hoje = new Date();
    // Default: 30 dias, 7 dias, 3 dias, 1 dia (amanhã), 0 dias (hoje)
    const prazosAviso = [30, 7, 3, 1];

    try {
      // 1. Obter todos os veículos (Coleção Raiz)
      const veiculosSnapshot = await db.collection("veiculos").get();

      if (veiculosSnapshot.empty) {
        console.log("Nenhum veículo encontrado.");
        return null;
      }

      for (const doc of veiculosSnapshot.docs) {
        const veiculo = doc.data();

        // Obter User ID do campo
        const userId = veiculo.userId;
        if (!userId) continue; // Ignora veículos órfãos

        const userRef = db.collection("users").doc(userId);

        const alertas = [];
        const check = (val, name) => {
          if (!val) return;

          let d;
          try {
            // Suporte para Timestamps do Firestore e Strings/Dates JS
            d = val.toDate ? val.toDate() : new Date(val);
          } catch (e) {
            return;
          }

          if (isNaN(d.getTime())) return;

          const diffTime = d - hoje;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (prazosAviso.includes(diffDays)) {
            alertas.push({
              titulo: `⚠️ ${name} a expirar!`,
              corpo: `O ${name} vence em ${diffDays} dias (${d.toLocaleDateString("pt-PT")}).`,
            });
          } else if (diffDays === 0) {
            alertas.push({
              titulo: `🚨 ${name} vence HOJE!`,
              corpo: `Regulariza o ${name} do ${veiculo.nome || "veículo"} hoje!`,
            });
          }
          // Opcional: Avisar se já expirou? (diffDays < 0). Por defeito não faz spam.
        };

        // Verificar datas (estrutura aninhada correta)
        check(veiculo.seguro ? veiculo.seguro.validade : null, "Seguro");
        check(veiculo.iuc ? veiculo.iuc.dataLimite : null, "IUC");
        check(
          veiculo.inspecao ? veiculo.inspecao.proximaData : null,
          "Inspeção",
        );

        if (alertas.length > 0) {
          const tokensSnap = await userRef.collection("fcmTokens").get();

          if (tokensSnap.empty) {
            console.log(
              `User ${userId} tem alertas mas sem tokens de notificação.`,
            );
          } else {
            const tokens = tokensSnap.docs.map((t) => t.data().token);

            // Enviar uma mensagem combinada ou múltiplas?
            // Vamos enviar cada alerta individualmente para ser claro
            for (const alerta of alertas) {
              const message = {
                tokens: tokens, // V1 pode usar array of tokens se usar sendEachForMulticast? Sim.
                notification: {
                  title: alerta.titulo,
                  body: alerta.corpo,
                },
                data: {
                  url: "/veiculos.html", // Deep link (pode precisar de tratamento no client)
                  veiculoId: doc.id,
                },
                webpush: {
                  notification: {
                    icon: "https://omeucarro-d3889.web.app/images/logo-icon192.png",
                    click_action:
                      "https://omeucarro-d3889.web.app/veiculos.html",
                  },
                },
              };

              try {
                const response = await admin
                  .messaging()
                  .sendEachForMulticast(message);
                console.log(
                  `Alert enviado para ${userId} (${alerta.titulo}): Success=${response.successCount}`,
                );

                // Limpar tokens inválidos
                if (response.failureCount > 0) {
                  const failedTokens = [];
                  response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                      const errorInfo = resp.error;
                      if (
                        errorInfo.code ===
                          "messaging/registration-token-not-registered" ||
                        errorInfo.code === "messaging/invalid-argument"
                      ) {
                        failedTokens.push(tokens[idx]);
                        // Opcional: remover do DB
                        userRef
                          .collection("fcmTokens")
                          .doc(tokens[idx])
                          .delete()
                          .catch(() => {});
                      }
                    }
                  });
                  console.log(
                    "Tokens removidos/inválidos:",
                    failedTokens.length,
                  );
                }
              } catch (e) {
                console.error("Erro envio FCM:", e);
              }
            }
          }
        }
      }

      console.log("Verificação concluída.");
      return null;
    } catch (error) {
      console.error("Erro CRITICO na verificação:", error);
      return null;
    }
  });
