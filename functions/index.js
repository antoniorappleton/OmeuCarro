const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Função agendada para correr todos os dias às 09:00 AM.
 * Verifica Seguros, IUCs e Inspeções a expirar.
 */
exports.checkVehicleAlerts = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "Europe/Lisbon",
    region: "us-central1", // Garantir consistência de região
  },
  async (event) => {
    console.log("A iniciar verificação diária de alertas (v2)...");

    const hoje = new Date();
    const prazosAviso = [30, 7, 3, 1];

    try {
      const veiculosSnapshot = await db.collection("veiculos").get();

      if (veiculosSnapshot.empty) {
        console.log("Nenhum veículo encontrado.");
        return;
      }

      for (const doc of veiculosSnapshot.docs) {
        const veiculo = doc.data();
        const userId = veiculo.userId;
        if (!userId) continue;

        const userRef = db.collection("users").doc(userId);
        const alertas = [];

        const check = (val, name) => {
          if (!val) return;
          let d;
          try {
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
        };

        check(veiculo.seguro ? veiculo.seguro.validade : null, "Seguro");
        check(veiculo.iuc ? veiculo.iuc.dataLimite : null, "IUC");
        check(
          veiculo.inspecao ? veiculo.inspecao.proximaData : null,
          "Inspeção",
        );

        if (alertas.length > 0) {
          const tokensSnap = await userRef.collection("fcmTokens").get();
          if (tokensSnap.empty) {
            console.log(`User ${userId} tem alertas mas sem tokens.`);
            continue;
          }

          const tokens = tokensSnap.docs.map((t) => t.data().token);

          for (const alerta of alertas) {
            const message = {
              notification: {
                title: alerta.titulo,
                body: alerta.corpo,
              },
              data: {
                url: "/veiculos.html",
                veiculoId: doc.id,
              },
              webpush: {
                notification: {
                  icon: "https://omeucarro-d3889.web.app/images/logo-icon192.png",
                  click_action: "https://omeucarro-d3889.web.app/veiculos.html",
                },
              },
            };

            try {
              // multicasting in v2 admin
              const response = await admin.messaging().sendEachForMulticast({
                ...message,
                tokens,
              });
              console.log(
                `Alert enviado para ${userId} (${alerta.titulo}): Success=${response.successCount}`,
              );

              if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                  if (!resp.success) {
                    const errorInfo = resp.error;
                    if (
                      errorInfo.code ===
                        "messaging/registration-token-not-registered" ||
                      errorInfo.code === "messaging/invalid-argument"
                    ) {
                      userRef
                        .collection("fcmTokens")
                        .doc(tokens[idx])
                        .delete()
                        .catch(() => {});
                    }
                  }
                });
              }
            } catch (e) {
              console.error("Erro envio FCM:", e);
            }
          }
        }
      }
      console.log("Verificação concluída.");
    } catch (error) {
      console.error("Erro CRÍTICO:", error);
    }
  },
);
